import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { Formation, Play, Player } from '../types';

const PLAYBOOK_COLLECTION = 'playbook';

const getUserId = () => auth?.currentUser?.uid || null;

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
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

const hydratePlayers = (players: Player[]) => {
  return players.map((player) => ({
    ...player,
    id: player.id || generateId(),
    path: player.path || []
  }));
};

const mapPlay = (play: Play) => ({
  name: play.name.trim(),
  force: play.force,
  description: play.description.trim(),
  players: play.players.map(serializePlayer)
});

const mapFormation = (formation: Formation) => ({
  name: formation.name.trim(),
  players: formation.players.map(serializePlayer)
});

export const isFirestoreEnabled = () => Boolean(isFirebaseConfigured && db);

export const fetchPlays = async (): Promise<Play[]> => {
  if (!db) return [];
  const uid = getUserId();
  if (!uid) return [];
  const playsRef = collection(db, PLAYBOOK_COLLECTION, uid, 'plays');
  const snapshot = await getDocs(query(playsRef, orderBy('updatedAt', 'desc')));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<Play, 'id'>;
    return {
      id: docSnap.id,
      ...data,
      players: hydratePlayers(data.players || [])
    };
  });
};

export const fetchFormations = async (): Promise<Formation[]> => {
  if (!db) return [];
  const uid = getUserId();
  if (!uid) return [];
  const formationsRef = collection(db, PLAYBOOK_COLLECTION, uid, 'formations');
  const snapshot = await getDocs(query(formationsRef, orderBy('updatedAt', 'desc')));
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<Formation, 'id'>;
    return {
      id: docSnap.id,
      ...data,
      players: hydratePlayers(data.players || [])
    };
  });
};

export const savePlayToFirestore = async (play: Play) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const playsRef = collection(db, PLAYBOOK_COLLECTION, uid, 'plays');
  if (play.id) {
    const docRef = doc(playsRef, play.id);
    await setDoc(docRef, { ...mapPlay(play), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  await addDoc(playsRef, { ...mapPlay(play), updatedAt: serverTimestamp() });
};

export const saveFormationToFirestore = async (formation: Formation) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const formationsRef = collection(db, PLAYBOOK_COLLECTION, uid, 'formations');
  if (formation.id) {
    const docRef = doc(formationsRef, formation.id);
    await setDoc(docRef, { ...mapFormation(formation), updatedAt: serverTimestamp() }, { merge: true });
    return;
  }
  await addDoc(formationsRef, { ...mapFormation(formation), updatedAt: serverTimestamp() });
};

export const deletePlayFromFirestore = async (id: string) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const docRef = doc(db, PLAYBOOK_COLLECTION, uid, 'plays', id);
  await deleteDoc(docRef);
};

export const deleteFormationFromFirestore = async (id: string) => {
  if (!db) return;
  const uid = getUserId();
  if (!uid) return;
  const docRef = doc(db, PLAYBOOK_COLLECTION, uid, 'formations', id);
  await deleteDoc(docRef);
};
