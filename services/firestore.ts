import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { Formation, Play, Player, TeamInfo } from '../types';

const PLAYBOOK_MIGRATION_KEY = 'ultiplan_migrated_playbook_v2';

const getUserId = () => auth?.currentUser?.uid || null;

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const normalizeTeamIds = (teamIds: string[]) => Array.from(new Set(teamIds)).sort();

const syncUserTeamIds = async (teamIds: string[], mode: 'replace' | 'merge' = 'replace') => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? normalizeStringArray(userSnap.data().teamIds) : [];
  const next = mode === 'merge'
    ? normalizeTeamIds([...existing, ...teamIds])
    : normalizeTeamIds(teamIds);
  const existingNormalized = normalizeTeamIds(existing);
  if (userSnap.exists() && existingNormalized.length === next.length && existingNormalized.every((id, i) => id === next[i])) {
    return;
  }
  const payload: Record<string, unknown> = {
    teamIds: next,
    updatedAt: serverTimestamp()
  };
  if (!userSnap.exists()) {
    payload.createdAt = serverTimestamp();
  }
  await setDoc(userRef, payload, { merge: true });
};

const hydratePlayers = (players: Player[]) => {
  return players.map((player) => ({
    ...player,
    id: player.id || generateId(),
    path: player.path || []
  }));
};

const serializePlayer = (player: Player) => {
  const data: Record<string, unknown> = {
    id: player.id,
    team: player.team,
    x: player.x,
    y: player.y,
    label: player.label,
    path: (player.path || []).map((pt) => ({ x: pt.x, y: pt.y })),
    speed: player.speed,
    acceleration: player.acceleration,
    hasDisc: !!player.hasDisc
  };

  if (player.role) data.role = player.role;
  if (typeof player.autoAssigned === 'boolean') data.autoAssigned = player.autoAssigned;
  if (player.coversOffenseId) data.coversOffenseId = player.coversOffenseId;
  if (player.cutterDefense) data.cutterDefense = player.cutterDefense;

  return data;
};

const normalizeVisibility = (visibility?: Play['visibility']) => visibility || 'private';

const serializePlay = (play: Play, uid: string) => {
  const visibility = normalizeVisibility(play.visibility);
  return {
    ownerId: play.ownerId || uid,
    name: play.name.trim(),
    force: play.force,
    description: play.description.trim(),
    players: play.players.map(serializePlayer),
    visibility,
    sharedTeamIds: visibility === 'team' ? play.sharedTeamIds || [] : [],
    createdBy: play.createdBy || uid,
    lastEditedBy: uid,
    sourcePlayId: play.sourcePlayId || null,
    createdAt: play.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };
};

const serializeFormation = (formation: Formation, uid: string) => {
  const visibility = normalizeVisibility(formation.visibility);
  return {
    ownerId: formation.ownerId || uid,
    name: formation.name.trim(),
    players: formation.players.map(serializePlayer),
    visibility,
    sharedTeamIds: visibility === 'team' ? formation.sharedTeamIds || [] : [],
    createdBy: formation.createdBy || uid,
    lastEditedBy: uid,
    sourceFormationId: formation.sourceFormationId || null,
    createdAt: formation.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  };
};

const hydratePlay = (data: Omit<Play, 'id'>, id: string): Play => ({
  id,
  ...data,
  ownerId: data.ownerId,
  visibility: data.visibility || 'private',
  sharedTeamIds: data.sharedTeamIds || [],
  players: hydratePlayers(data.players || [])
});

const hydrateFormation = (data: Omit<Formation, 'id'>, id: string): Formation => ({
  id,
  ...data,
  ownerId: data.ownerId,
  visibility: data.visibility || 'private',
  sharedTeamIds: data.sharedTeamIds || [],
  players: hydratePlayers(data.players || [])
});

const chunk = <T,>(items: T[], size: number) => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const mergeById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();
  items.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
};

export const isFirestoreEnabled = () => Boolean(isFirebaseConfigured && db);

export const ensureUserDocument = async () => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await setDoc(userRef, { updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  await setDoc(userRef, { teamIds: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
};

export const fetchTeamsForUser = async (): Promise<TeamInfo[]> => {
  if (!db) return [];
  const uid = getUserId();
  if (!uid) return [];
  const userSnap = await getDoc(doc(db, 'users', uid));
  const teamIds = userSnap.exists() ? normalizeStringArray(userSnap.data().teamIds) : [];
  const uniqueTeamIds = Array.from(new Set(teamIds));
  if (userSnap.exists()) {
    await syncUserTeamIds(uniqueTeamIds, 'replace');
  }
  if (uniqueTeamIds.length === 0) return [];
  const teams = await Promise.all(
    uniqueTeamIds.map(async (teamId) => {
      const teamSnap = await getDoc(doc(db, 'teams', teamId));
      if (!teamSnap.exists()) return null;
      const data = teamSnap.data() as Omit<TeamInfo, 'id'>;
      return {
        id: teamSnap.id,
        name: data.name,
        ownerId: data.ownerId
      };
    })
  );
  return teams.filter((team): team is TeamInfo => Boolean(team));
};

export const createTeam = async (name: string): Promise<TeamInfo | null> => {
  if (!db) return null;
  const uid = getUserId();
  if (!uid) return null;
  const teamRef = doc(collection(db, 'teams'));
  const team: TeamInfo = {
    id: teamRef.id,
    name: name.trim(),
    ownerId: uid
  };
  await setDoc(teamRef, {
    name: team.name,
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await setDoc(doc(db, 'teams', teamRef.id, 'members', uid), {
    userId: uid,
    role: 'owner',
    joinedAt: serverTimestamp()
  });
  await syncUserTeamIds([teamRef.id], 'merge');
  return team;
};

const migrateLegacyPlaybook = async () => {
  if (!db) return { plays: [], formations: [] } as { plays: Play[]; formations: Formation[] };
  const uid = getUserId();
  if (!uid) return { plays: [], formations: [] };
  if (localStorage.getItem(`${PLAYBOOK_MIGRATION_KEY}_${uid}`) === 'true') {
    return { plays: [], formations: [] };
  }
  const legacyPlaysRef = collection(db, 'playbook', uid, 'plays');
  const legacyFormationsRef = collection(db, 'playbook', uid, 'formations');
  const [legacyPlaysSnap, legacyFormationsSnap] = await Promise.all([
    getDocs(legacyPlaysRef),
    getDocs(legacyFormationsRef)
  ]);

  const legacyPlays = legacyPlaysSnap.docs.map((docSnap) => hydratePlay(docSnap.data() as Omit<Play, 'id'>, docSnap.id));
  const legacyFormations = legacyFormationsSnap.docs.map((docSnap) => hydrateFormation(docSnap.data() as Omit<Formation, 'id'>, docSnap.id));

  if (legacyPlays.length === 0 && legacyFormations.length === 0) {
    localStorage.setItem(`${PLAYBOOK_MIGRATION_KEY}_${uid}`, 'true');
    return { plays: [], formations: [] };
  }

  const normalizedLegacyPlays = legacyPlays.map((play) => ({
    ...play,
    ownerId: uid,
    visibility: 'private' as const,
    sharedTeamIds: []
  }));
  const normalizedLegacyFormations = legacyFormations.map((formation) => ({
    ...formation,
    ownerId: uid,
    visibility: 'private' as const,
    sharedTeamIds: []
  }));

  await Promise.all([
    ...normalizedLegacyPlays.map((play) => savePlayToFirestore(play)),
    ...normalizedLegacyFormations.map((formation) => saveFormationToFirestore(formation))
  ]);

  localStorage.setItem(`${PLAYBOOK_MIGRATION_KEY}_${uid}`, 'true');
  return { plays: normalizedLegacyPlays, formations: normalizedLegacyFormations };
};

export const fetchPlaysForUser = async (teamIds: string[]): Promise<Play[]> => {
  if (!db) return [];
  const uid = getUserId();
  if (!uid) return [];

  const ownedSnap = await getDocs(
    query(collection(db, 'plays'), where('ownerId', '==', uid), orderBy('updatedAt', 'desc'))
  );
  const owned = ownedSnap.docs.map((docSnap) => hydratePlay(docSnap.data() as Omit<Play, 'id'>, docSnap.id));

  const teamShared: Play[] = [];
  if (teamIds.length > 0) {
    const chunks = chunk(teamIds, 10);
    for (const ids of chunks) {
      const snap = await getDocs(
        query(
          collection(db, 'plays'),
          where('visibility', '==', 'team'),
          where('sharedTeamIds', 'array-contains-any', ids)
        )
      );
      teamShared.push(...snap.docs.map((docSnap) => hydratePlay(docSnap.data() as Omit<Play, 'id'>, docSnap.id)));
    }
  }

  let merged = mergeById([...owned, ...teamShared]);
  if (merged.length === 0) {
    const migration = await migrateLegacyPlaybook();
    if (migration.plays.length > 0) {
      merged = mergeById([...merged, ...migration.plays]);
    }
  }
  return merged;
};

export const fetchFormationsForUser = async (teamIds: string[]): Promise<Formation[]> => {
  if (!db) return [];
  const uid = getUserId();
  if (!uid) return [];

  const ownedSnap = await getDocs(
    query(collection(db, 'formations'), where('ownerId', '==', uid), orderBy('updatedAt', 'desc'))
  );
  const owned = ownedSnap.docs.map((docSnap) => hydrateFormation(docSnap.data() as Omit<Formation, 'id'>, docSnap.id));

  const teamShared: Formation[] = [];
  if (teamIds.length > 0) {
    const chunks = chunk(teamIds, 10);
    for (const ids of chunks) {
      const snap = await getDocs(
        query(
          collection(db, 'formations'),
          where('visibility', '==', 'team'),
          where('sharedTeamIds', 'array-contains-any', ids)
        )
      );
      teamShared.push(...snap.docs.map((docSnap) => hydrateFormation(docSnap.data() as Omit<Formation, 'id'>, docSnap.id)));
    }
  }

  let merged = mergeById([...owned, ...teamShared]);
  if (merged.length === 0) {
    const migration = await migrateLegacyPlaybook();
    if (migration.formations.length > 0) {
      merged = mergeById([...merged, ...migration.formations]);
    }
  }
  return merged;
};

export const savePlayToFirestore = async (play: Play) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const playId = play.id || generateId();
  await setDoc(doc(db, 'plays', playId), serializePlay({ ...play, id: playId }, uid), { merge: true });
};

export const saveFormationToFirestore = async (formation: Formation) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const formationId = formation.id || generateId();
  await setDoc(doc(db, 'formations', formationId), serializeFormation({ ...formation, id: formationId }, uid), { merge: true });
};

export const deletePlayFromFirestore = async (id: string) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const docRef = doc(db, 'plays', id);
  await deleteDoc(docRef);
};

export const deleteFormationFromFirestore = async (id: string) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const docRef = doc(db, 'formations', id);
  await deleteDoc(docRef);
};
