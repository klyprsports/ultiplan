import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share2, Users, Plus, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Play, TeamInfo } from './types';
import {
  loadPlaysFromStorage,
  savePlaysToStorage,
  setPendingSelection,
  setPendingConceptDraft,
  clearPendingConceptDraft,
  loadPendingManageTeams,
  clearPendingManageTeams,
  clearPlaybookStorage,
  hasSeenOnboarding,
  setSeenOnboarding,
  setPendingTour
} from './services/storage';
import { signInWithGoogle, subscribeToAuth, getCurrentUser, deleteCurrentUser } from './services/auth';
import HeaderBar from './components/HeaderBar';
import AccountModal from './components/AccountModal';
import OnboardingIntroModal from './components/OnboardingIntroModal';
import ShareModal from './components/ShareModal';
import AuthModal from './components/AuthModal';
import { createTeam, deleteAccountData, deletePlayFromFirestore, fetchPlaysForUser, fetchTeamsForUser, isFirestoreEnabled, savePlayToFirestore } from './services/firestore';
import { User } from 'firebase/auth';

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

const toTimestampMs = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === 'object') {
    if ('toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      try {
        return (value as { toMillis: () => number }).toMillis();
      } catch {
        return 0;
      }
    }
    if ('seconds' in value) {
      const seconds = Number((value as { seconds?: unknown }).seconds);
      const nanos = Number((value as { nanoseconds?: unknown }).nanoseconds || 0);
      if (Number.isFinite(seconds)) {
        return (seconds * 1000) + (Number.isFinite(nanos) ? nanos / 1_000_000 : 0);
      }
    }
  }
  return 0;
};

const PlaybookPage: React.FC = () => {
  const [savedPlays, setSavedPlays] = useState<Play[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [sharingTarget, setSharingTarget] = useState<Play | null>(null);
  const [sharingVisibility, setSharingVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [sharingTeamIds, setSharingTeamIds] = useState<string[]>([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [showOnboardingIntro, setShowOnboardingIntro] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showNewConceptModal, setShowNewConceptModal] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [moveTarget, setMoveTarget] = useState<Play | null>(null);
  const [moveConceptChoice, setMoveConceptChoice] = useState<string>('__independent__');
  const [moveNewConceptName, setMoveNewConceptName] = useState('');
  const [expandedConcepts, setExpandedConcepts] = useState<Record<string, boolean>>({});
  const [sequenceNameDrafts, setSequenceNameDrafts] = useState<Record<string, string>>({});
  const sequenceNameSaveTimersRef = useRef<Record<string, number>>({});
  const [draggingSequence, setDraggingSequence] = useState<{ conceptId: string; sequenceIndex: number } | null>(null);
  const [dragOverSequenceKey, setDragOverSequenceKey] = useState<string | null>(null);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const getDeleteAccountErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/requires-recent-login') {
        return 'Please sign in again before deleting your account.';
      }
    }
    return 'Failed to delete account. Please try again.';
  };

  useEffect(() => {
    setSavedPlays(loadPlaysFromStorage());
  }, []);

  useEffect(() => {
    if (!loadPendingManageTeams()) return;
    setShowTeamModal(true);
    clearPendingManageTeams();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(setUser);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    if (!hasSeenOnboarding(user.uid)) {
      setShowOnboardingIntro(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    savePlaysToStorage(savedPlays);
  }, [savedPlays]);

  useEffect(() => {
    let cancelled = false;
    const loadRemote = async () => {
      if (!isFirestoreEnabled()) return;
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.isAnonymous) return;
      try {
        const remoteTeams = await fetchTeamsForUser().catch((error) => {
          console.error('Failed to fetch teams from Firestore', error);
          throw error;
        });
        if (cancelled) return;
        setTeams(remoteTeams);
        const teamIds = remoteTeams.map((team) => team.id);
        const remotePlays = await fetchPlaysForUser(teamIds).catch((error) => {
          console.error('Failed to fetch plays from Firestore', error);
          throw error;
        });
        if (cancelled) return;
        if (remotePlays.length > 0) {
          setSavedPlays(remotePlays);
        } else {
          const localPlays = loadPlaysFromStorage();
          if (localPlays.length > 0) {
            const uid = getCurrentUser()?.uid;
            await Promise.all(
              localPlays.map((play) => savePlayToFirestore({ ...play, ownerId: play.ownerId || uid, visibility: play.visibility || 'private', sharedTeamIds: play.sharedTeamIds || [] }))
            );
          }
        }
      } catch (error) {
        console.error('Failed to load playbook from Firestore', error);
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const applyPlaybookMutation = async (nextPlays: Play[], updatedPlays: Play[], deletedIds: string[]) => {
    setSavedPlays(nextPlays);
    if (!isFirestoreEnabled()) return;
    await Promise.all([
      ...updatedPlays.map((play) => (
        savePlayToFirestore(play).catch((error) => {
          console.error('Failed to persist play update', error);
        })
      )),
      ...deletedIds.map((id) => (
        deletePlayFromFirestore(id).catch((error) => {
          console.error('Failed to delete play from Firestore', error);
        })
      ))
    ]);
  };

  const getDescendantIds = (startId: string, allPlays: Play[]) => {
    const childMap = new Map<string, string[]>();
    allPlays.forEach((play) => {
      if (!play.startFromPlayId) return;
      const children = childMap.get(play.startFromPlayId) || [];
      children.push(play.id);
      childMap.set(play.startFromPlayId, children);
    });
    const ids: string[] = [];
    const stack = [startId];
    const seen = new Set<string>();
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      const children = childMap.get(id) || [];
      children.forEach((childId) => stack.push(childId));
    }
    return ids;
  };

  const deletePlaySubtree = async (playId: string) => {
    const play = savedPlays.find((entry) => entry.id === playId);
    if (!play) return;
    const idsToDelete = getDescendantIds(playId, savedPlays);
    const confirmed = window.confirm(
      idsToDelete.length > 1
        ? `Delete "${play.name}" and ${idsToDelete.length - 1} downstream play(s)?`
        : `Delete "${play.name}"?`
    );
    if (!confirmed) return;
    const deleteSet = new Set(idsToDelete);
    const nextPlays = savedPlays.filter((entry) => !deleteSet.has(entry.id));
    await applyPlaybookMutation(nextPlays, [], idsToDelete);
  };

  const deletePlayStepOnly = async (playId: string) => {
    const play = savedPlays.find((entry) => entry.id === playId);
    if (!play) return;
    const confirmed = window.confirm(`Delete step "${play.name}" and relink any following steps?`);
    if (!confirmed) return;
    const children = savedPlays.filter((entry) => entry.startFromPlayId === playId);
    const relinked = children.map((child) => ({
      ...child,
      startFromPlayId: play.startFromPlayId,
      startLocked: Boolean(play.startFromPlayId)
    }));
    const relinkedById = new Map(relinked.map((entry) => [entry.id, entry]));
    const nextPlays = savedPlays
      .filter((entry) => entry.id !== playId)
      .map((entry) => relinkedById.get(entry.id) || entry);
    await applyPlaybookMutation(nextPlays, relinked, [playId]);
  };

  const deleteSequenceBranch = async (sequence: Play[], allSequences: Play[][]) => {
    if (sequence.length === 0) return;
    const occurrence = new Map<string, number>();
    allSequences.forEach((path) => {
      const uniqueIds = new Set(path.map((entry) => entry.id));
      uniqueIds.forEach((id) => occurrence.set(id, (occurrence.get(id) || 0) + 1));
    });
    const firstUniqueIndex = sequence.findIndex((entry) => (occurrence.get(entry.id) || 0) === 1);
    const deleteAnchorIndex = firstUniqueIndex >= 0 ? firstUniqueIndex : sequence.length - 1;
    const anchor = sequence[deleteAnchorIndex];
    if (!anchor) return;
    const idsToDelete = getDescendantIds(anchor.id, savedPlays);
    const confirmed = window.confirm(
      idsToDelete.length > 1
        ? `Delete this sequence branch (${idsToDelete.length} plays)?`
        : 'Delete this sequence branch?'
    );
    if (!confirmed) return;
    const deleteSet = new Set(idsToDelete);
    const nextPlays = savedPlays.filter((entry) => !deleteSet.has(entry.id));
    await applyPlaybookMutation(nextPlays, [], idsToDelete);
  };

  const ensureSignedInForWrite = async () => {
    if (user && !user.isAnonymous) return;
    await signInWithGoogle();
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      if (isFirestoreEnabled()) {
        await deleteAccountData();
      }
      clearPlaybookStorage();
      setSavedPlays([]);
      await deleteCurrentUser();
      setShowAccountModal(false);
    } catch (error) {
      console.error('Failed to delete account', error);
      setDeleteAccountError(getDeleteAccountErrorMessage(error));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const shareUrl = `${window.location.origin}/`;

  const shareApp = () => {
    setShareStatus(null);
    setShowShareModal(true);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('Copied to clipboard.');
    } catch (error) {
      setShareStatus('Copy failed. Please select and copy the link.');
    }
  };

  const startTour = () => {
    if (user?.uid) {
      setSeenOnboarding(user.uid);
    }
    setShowOnboardingIntro(false);
    setPendingTour();
    navigate('/builder');
  };

  const closeIntro = () => {
    if (user?.uid) {
      setSeenOnboarding(user.uid);
    }
    setShowOnboardingIntro(false);
  };

  const openPlay = (id: string, branchRootId?: string, branchChildId?: string) => {
    setPendingSelection({ type: 'play', id, branchRootId, branchChildId });
    navigate('/builder');
  };

  const createNewPlay = () => {
    clearPendingConceptDraft();
    setPendingSelection({ type: 'new-play' });
    navigate('/builder');
  };

  const createNewSequenceInConcept = (conceptId: string, conceptName: string) => {
    clearPendingConceptDraft();
    const conceptPlays = savedPlays.filter((play) => (play.conceptId?.trim() || '') === conceptId);
    const playOrder = new Map(savedPlays.map((play, index) => [play.id, index]));
    const playById = new Map(savedPlays.map((play) => [play.id, play]));

    const getRootIdForPlay = (play: Play) => {
      let cursor: Play | undefined = play;
      const seen = new Set<string>();
      while (cursor?.startFromPlayId) {
        if (seen.has(cursor.startFromPlayId)) break;
        seen.add(cursor.startFromPlayId);
        const parent = playById.get(cursor.startFromPlayId);
        if (!parent) break;
        cursor = parent;
      }
      return cursor?.id;
    };

    const latestPlay = [...conceptPlays].sort((a, b) => {
      const aTime = Math.max(toTimestampMs(a.updatedAt), toTimestampMs(a.createdAt));
      const bTime = Math.max(toTimestampMs(b.updatedAt), toTimestampMs(b.createdAt));
      if (aTime !== bTime) return bTime - aTime;
      return (playOrder.get(a.id) || 0) - (playOrder.get(b.id) || 0);
    })[0];

    const startFromPlayId = latestPlay ? getRootIdForPlay(latestPlay) : undefined;
    setPendingSelection({
      type: 'new-play',
      conceptId,
      conceptName,
      startFromPlayId
    });
    navigate('/builder');
  };

  const createNewConcept = () => {
    const name = newConceptName.trim();
    if (!name) return;
    setPendingConceptDraft(name);
    setPendingSelection({ type: 'new-play' });
    setNewConceptName('');
    setShowNewConceptModal(false);
    navigate('/builder');
  };

  const openSharing = (play: Play) => {
    setSharingTarget(play);
    setSharingVisibility(play.visibility || 'private');
    setSharingTeamIds(play.sharedTeamIds || []);
  };

  const saveSharing = async () => {
    if (!sharingTarget) return;
    await ensureSignedInForWrite();
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const visibility = sharingVisibility;
    const updated: Play = {
      ...sharingTarget,
      visibility,
      sharedTeamIds: visibility === 'team' ? sharingTeamIds : []
    };
    setSavedPlays((prev) => prev.map((p) => (p.id === sharingTarget.id ? updated : p)));
    if (isFirestoreEnabled()) {
      await savePlayToFirestore(updated);
    }
    setSharingTarget(null);
  };

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      await ensureSignedInForWrite();
      const team = await createTeam(name);
      if (team) {
        setTeams((prev) => [team, ...prev]);
        setNewTeamName('');
        setShowTeamModal(false);
      }
    } catch (error) {
      console.error('Failed to create team', error);
    }
  };

  const conceptOptions = useMemo(() => {
    const map = new Map<string, string>();
    savedPlays.forEach((play) => {
      const id = play.conceptId?.trim();
      if (!id) return;
      const name = play.conceptName?.trim() || 'Untitled Concept';
      if (!map.has(id)) {
        map.set(id, name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [savedPlays]);

  const openMoveConceptModal = (play: Play) => {
    setMoveTarget(play);
    setMoveConceptChoice(play.conceptId?.trim() || '__independent__');
    setMoveNewConceptName('');
  };

  const saveMoveConcept = async () => {
    if (!moveTarget) return;
    let nextConceptId: string | undefined;
    let nextConceptName: string | undefined;

    if (moveConceptChoice === '__independent__') {
      nextConceptId = undefined;
      nextConceptName = undefined;
    } else if (moveConceptChoice === '__new__') {
      const name = moveNewConceptName.trim();
      if (!name) return;
      nextConceptId = generateId();
      nextConceptName = name;
    } else {
      const existing = conceptOptions.find((option) => option.id === moveConceptChoice);
      if (!existing) return;
      nextConceptId = existing.id;
      nextConceptName = existing.name;
    }

    const updatedPlay: Play = {
      ...moveTarget,
      conceptId: nextConceptId,
      conceptName: nextConceptName
    };

    setSavedPlays((prev) => prev.map((play) => (play.id === moveTarget.id ? updatedPlay : play)));

    if (isFirestoreEnabled()) {
      try {
        await savePlayToFirestore(updatedPlay);
      } catch (error) {
        console.error('Failed to update play concept in Firestore', error);
      }
    }

    setMoveTarget(null);
    setMoveConceptChoice('__independent__');
    setMoveNewConceptName('');
  };

  const playConcepts = useMemo(() => {
    if (savedPlays.length === 0) return [];

    const conceptMap = new Map<string, Play[]>();
    savedPlays.forEach((play) => {
      const key = play.conceptId?.trim() || '__independent__';
      const list = conceptMap.get(key) || [];
      list.push(play);
      conceptMap.set(key, list);
    });

    const sortByName = (a: Play, b: Play) => a.name.localeCompare(b.name);

    return Array.from(conceptMap.entries())
      .map(([conceptId, plays]) => {
        const conceptIds = new Set(plays.map((play) => play.id));
        const childrenByParent = new Map<string, Play[]>();
        const roots: Play[] = [];

        plays.forEach((play) => {
          if (play.startFromPlayId && conceptIds.has(play.startFromPlayId)) {
            const children = childrenByParent.get(play.startFromPlayId) || [];
            children.push(play);
            childrenByParent.set(play.startFromPlayId, children);
          } else {
            roots.push(play);
          }
        });

        roots.sort(sortByName);
        childrenByParent.forEach((children) => children.sort(sortByName));

        const isIndependent = conceptId === '__independent__';
        const conceptName = isIndependent
          ? 'Isolated Plays'
          : (plays.find((play) => play.conceptName?.trim())?.conceptName?.trim() || 'Untitled Concept');
        const sequences: Play[][] = [];
        const buildSequences = (node: Play, path: Play[]) => {
          const nextPath = [...path, node];
          const children = childrenByParent.get(node.id) || [];
          if (children.length === 0) {
            sequences.push(nextPath);
            return;
          }
          children.forEach((child) => buildSequences(child, nextPath));
        };
        roots.forEach((root) => buildSequences(root, []));
        const orderedSequences = sequences
          .map((sequence, index) => ({ sequence, index }))
          .sort((a, b) => {
            const leafA = a.sequence[a.sequence.length - 1];
            const leafB = b.sequence[b.sequence.length - 1];
            const orderA = typeof leafA?.sequenceOrder === 'number' ? leafA.sequenceOrder : a.index;
            const orderB = typeof leafB?.sequenceOrder === 'number' ? leafB.sequenceOrder : b.index;
            if (orderA !== orderB) return orderA - orderB;
            return a.sequence.map((play) => play.name).join(' > ').localeCompare(b.sequence.map((play) => play.name).join(' > '));
          })
          .map((entry) => entry.sequence);

        return {
          id: conceptId,
          isIndependent,
          name: conceptName,
          playCount: plays.length,
          sequences: orderedSequences
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [savedPlays]);

  useEffect(() => {
    setExpandedConcepts((prev) => {
      const next: Record<string, boolean> = {};
      playConcepts.forEach((concept) => {
        next[concept.id] = prev[concept.id] ?? true;
      });
      return next;
    });
    setSequenceNameDrafts((prev) => {
      const next = { ...prev };
      playConcepts.forEach((concept) => {
        concept.sequences.forEach((sequence, idx) => {
          const key = getSequenceKey(concept.id, sequence, idx);
          if (!(key in next)) {
            next[key] = getSequenceDisplayName(sequence, idx);
          }
        });
      });
      return next;
    });
  }, [playConcepts]);

  useEffect(() => {
    return () => {
      Object.values(sequenceNameSaveTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, []);

  const toggleConcept = (conceptId: string) => {
    setExpandedConcepts((prev) => ({ ...prev, [conceptId]: !prev[conceptId] }));
  };

  const getSequenceDisplayName = useCallback((sequence: Play[], sequenceIndex: number) => {
    const named = [...sequence].reverse().find((play) => (play.sequenceName || '').trim().length > 0);
    return named?.sequenceName?.trim() || `Sequence ${sequenceIndex + 1}`;
  }, []);

  const getSequenceKey = (conceptId: string, sequence: Play[], sequenceIndex: number) =>
    `${conceptId}::${sequence[sequence.length - 1]?.id || sequenceIndex}`;

  const persistSequenceName = async (conceptId: string, sequenceIndex: number, nextName: string) => {
    const concept = playConcepts.find((entry) => entry.id === conceptId);
    if (!concept) return;
    const sequence = concept.sequences[sequenceIndex];
    if (!sequence || sequence.length === 0) return;
    const trimmed = nextName.trim();
    const occurrence = new Map<string, number>();
    concept.sequences.forEach((seq) => {
      seq.forEach((play) => {
        occurrence.set(play.id, (occurrence.get(play.id) || 0) + 1);
      });
    });
    const targetIds = new Set(
      sequence
        .filter((play, idx) => sequence.length === 1 || occurrence.get(play.id) === 1 || idx === sequence.length - 1)
        .map((play) => play.id)
    );
    const updatedPlays = savedPlays.map((play) => (
      targetIds.has(play.id)
        ? { ...play, sequenceName: trimmed || undefined }
        : play
    ));
    setSavedPlays(updatedPlays);
    if (isFirestoreEnabled()) {
      await Promise.all(
        updatedPlays
          .filter((play) => targetIds.has(play.id))
          .map((play) => savePlayToFirestore(play).catch((error) => {
            console.error('Failed to update sequence name in Firestore', error);
          }))
      );
    }
  };

  const updateSequenceNameDraft = (conceptId: string, sequenceIndex: number, sequence: Play[], nextName: string) => {
    const key = getSequenceKey(conceptId, sequence, sequenceIndex);
    setSequenceNameDrafts((prev) => ({ ...prev, [key]: nextName }));
    const existingTimer = sequenceNameSaveTimersRef.current[key];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    sequenceNameSaveTimersRef.current[key] = window.setTimeout(() => {
      persistSequenceName(conceptId, sequenceIndex, nextName);
      delete sequenceNameSaveTimersRef.current[key];
    }, 450);
  };

  const reorderSequenceOrder = async (conceptId: string, fromIndex: number, toIndex: number) => {
    const concept = playConcepts.find((entry) => entry.id === conceptId);
    if (!concept) return;
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= concept.sequences.length || toIndex >= concept.sequences.length) return;

    const reordered = [...concept.sequences];
    const [moved] = reordered.splice(fromIndex, 1);
    if (!moved) return;
    reordered.splice(toIndex, 0, moved);

    const leafOrder = new Map<string, number>();
    reordered.forEach((sequence, idx) => {
      const leaf = sequence[sequence.length - 1];
      if (leaf) leafOrder.set(leaf.id, idx);
    });

    const playsToPersist: Play[] = [];
    const updatedPlays = savedPlays.map((play) => {
      const nextOrder = leafOrder.get(play.id);
      if (typeof nextOrder !== 'number') return play;
      if (play.sequenceOrder === nextOrder) return play;
      const updated = { ...play, sequenceOrder: nextOrder };
      playsToPersist.push(updated);
      return updated;
    });
    setSavedPlays(updatedPlays);

    if (isFirestoreEnabled() && playsToPersist.length > 0) {
      await Promise.all(
        playsToPersist.map((play) =>
          savePlayToFirestore(play).catch((error) => {
            console.error('Failed to update sequence order in Firestore', error);
          })
        )
      );
    }
  };

  const moveSequenceOrder = async (conceptId: string, sequenceIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? sequenceIndex - 1 : sequenceIndex + 1;
    await reorderSequenceOrder(conceptId, sequenceIndex, targetIndex);
  };

  const renderPlayCard = (play: Play, branchRootId?: string, branchChildId?: string): React.ReactNode => {
    const snapshotWidth = 135;
    const snapshotHeight = 371;
    const fieldWidth = 40;
    const fieldHeight = 110;
    const offense = play.players.filter((p) => p.team === 'offense');
    const defense = play.players.filter((p) => p.team === 'defense');
    const holderId = offense.find((p) => p.hasDisc)?.id;
    const allPlayers = play.players;

    const toSnapshot = (x: number, y: number) => ({
      x: (x / fieldWidth) * snapshotWidth,
      y: (y / fieldHeight) * snapshotHeight
    });

    const getThrowSpeed = (power: 'soft' | 'medium' | 'hard') => {
      if (power === 'soft') return 8;
      if (power === 'hard') return 16;
      return 12;
    };

    const getPlayerPositionAtTime = (player: Play['players'][number], time: number) => {
      const startOffset = player.team === 'offense' ? Math.max(0, player.pathStartOffset ?? 0) : 0;
      const adjustedTime = time - startOffset;
      if (player.path.length === 0 || adjustedTime <= 0) return { x: player.x, y: player.y };
      const acc = Math.max(0.1, player.acceleration || 0.1);
      const topSpeed = Math.max(0.1, player.speed || 0.1);
      const dec = acc * 2.0;
      const points = [{ x: player.x, y: player.y }, ...player.path];
      const vertexSpeeds = [0];
      for (let i = 1; i < points.length - 1; i++) {
        const pPrev = points[i - 1];
        const pCurr = points[i];
        const pNext = points[i + 1];
        const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
        const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
        const mag1 = Math.hypot(v1.x, v1.y);
        const mag2 = Math.hypot(v2.x, v2.y);
        if (mag1 === 0 || mag2 === 0) {
          vertexSpeeds.push(0);
          continue;
        }
        const cosTheta = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
        const speedFactor = Math.max(0, (1 + cosTheta) / 2);
        vertexSpeeds.push(topSpeed * speedFactor);
      }
      vertexSpeeds.push(0);

      let tRem = adjustedTime;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) continue;
        const v0 = vertexSpeeds[i];
        const v1 = vertexSpeeds[i + 1];
        const dAccToTop = (topSpeed ** 2 - v0 ** 2) / (2 * acc);
        const dDecToV1 = (topSpeed ** 2 - v1 ** 2) / (2 * dec);
        let tSegTotal = 0;
        let distAtTRem = 0;
        if (dAccToTop + dDecToV1 <= len) {
          const tAcc = (topSpeed - v0) / acc;
          const tDec = (topSpeed - v1) / dec;
          const dCruise = len - dAccToTop - dDecToV1;
          const tCruise = dCruise / topSpeed;
          tSegTotal = tAcc + tCruise + tDec;
          if (tRem <= tSegTotal) {
            if (tRem <= tAcc) {
              distAtTRem = v0 * tRem + 0.5 * acc * tRem ** 2;
            } else if (tRem <= tAcc + tCruise) {
              distAtTRem = dAccToTop + topSpeed * (tRem - tAcc);
            } else {
              const tr = tRem - tAcc - tCruise;
              distAtTRem = dAccToTop + dCruise + (topSpeed * tr - 0.5 * dec * tr ** 2);
            }
            const r = distAtTRem / len;
            return { x: p1.x + dx * r, y: p1.y + dy * r };
          }
        } else {
          const vPeakSq = (2 * len + v0 ** 2 / acc + v1 ** 2 / dec) / (1 / acc + 1 / dec);
          const vPeak = Math.sqrt(vPeakSq);
          const tAcc = (vPeak - v0) / acc;
          const tDec = (vPeak - v1) / dec;
          tSegTotal = tAcc + tDec;
          if (tRem <= tSegTotal) {
            if (tRem <= tAcc) {
              distAtTRem = v0 * tRem + 0.5 * acc * tRem ** 2;
            } else {
              const tr = tRem - tAcc;
              distAtTRem = (v0 * tAcc + 0.5 * acc * tAcc ** 2) + (vPeak * tr - 0.5 * dec * tr ** 2);
            }
            const r = distAtTRem / len;
            return { x: p1.x + dx * r, y: p1.y + dy * r };
          }
        }
        tRem -= tSegTotal;
      }
      return points[points.length - 1];
    };

    const throwPaths = (play.throws || []).map((thr) => {
      const thrower = allPlayers.find((p) => p.id === thr.throwerId);
      if (!thrower) return null;
      const throwMode = thr.mode === 'space' ? 'space' : 'receiver';
      const receiver = thr.receiverId ? allPlayers.find((p) => p.id === thr.receiverId) : null;
      const throwerAtRelease = getPlayerPositionAtTime(thrower, thr.releaseTime);
      const start = { x: throwerAtRelease.x + 1.2, y: throwerAtRelease.y - 1.2 };
      const receiverAtRelease = throwMode === 'space'
        ? (thr.targetPoint ? { x: thr.targetPoint.x, y: thr.targetPoint.y } : null)
        : (receiver ? getPlayerPositionAtTime(receiver, thr.releaseTime) : null);
      if (!receiverAtRelease) return null;
      const speed = getThrowSpeed(thr.power);
      const dx = receiverAtRelease.x - start.x;
      const dy = receiverAtRelease.y - start.y;
      const dist = Math.hypot(dx, dy);
      const minTravel = 0.5;
      const dirX = dist > 0 ? dx / dist : 0;
      const dirY = dist > 0 ? dy / dist : 1;
      const travelDist = Math.max(minTravel, dist);
      const duration = Math.max(0.2, travelDist / speed);
      const end = throwMode === 'space'
        ? { x: receiverAtRelease.x, y: receiverAtRelease.y }
        : (dist < minTravel
          ? { x: start.x + dirX * minTravel, y: start.y + dirY * minTravel }
          : getPlayerPositionAtTime(receiver as Play['players'][number], thr.releaseTime + duration));
      const samples = 20;
      const points = Array.from({ length: samples + 1 }, (_, i) => {
        const t = i / samples;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const px = -uy;
        const py = ux;
        const curve = thr.angle * dist * 0.15 * Math.sin(Math.PI * t);
        return {
          x: start.x + dx * t + px * curve,
          y: start.y + dy * t + py * curve
        };
      });
      return points.map((p) => toSnapshot(p.x, p.y));
    }).filter((p): p is Array<{ x: number; y: number }> => Boolean(p));

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openPlay(play.id, branchRootId, branchChildId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPlay(play.id, branchRootId, branchChildId);
          }
        }}
        className="rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 transition-colors cursor-pointer p-3"
      >
        <div className="mb-3">
          <h3 className="text-sm font-bold text-sky-200 truncate" title={play.name}>{play.name}</h3>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deletePlayStepOnly(play.id);
              }}
              className="rounded border border-slate-700 bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-300 hover:bg-slate-800 hover:text-white"
              title="Delete this step only and relink following steps"
            >
              Delete Step
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                deletePlaySubtree(play.id);
              }}
              className="rounded border border-red-900/60 bg-red-950/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-red-300 hover:bg-red-900/40 hover:text-red-100"
              title="Delete this play and downstream plays"
            >
              Delete Play
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-emerald-950/70 overflow-hidden">
          <svg width={snapshotWidth} height={snapshotHeight} viewBox={`0 0 ${snapshotWidth} ${snapshotHeight}`} className="block w-full h-auto">
            <rect x="0" y="0" width={snapshotWidth} height={snapshotHeight} fill="#065f46" />
            <rect x="0" y="0" width={snapshotWidth} height={snapshotHeight} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
            <line x1="0" y1={(20 / 110) * snapshotHeight} x2={snapshotWidth} y2={(20 / 110) * snapshotHeight} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            <line x1="0" y1={(90 / 110) * snapshotHeight} x2={snapshotWidth} y2={(90 / 110) * snapshotHeight} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
            {allPlayers.map((p) => {
              const pts = [{ x: p.x, y: p.y }, ...p.path].map((q) => toSnapshot(q.x, q.y));
              if (pts.length <= 1) return null;
              return (
                <polyline
                  key={`snap-route-${p.id}`}
                  points={pts.map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none"
                  stroke={p.team === 'offense' ? 'rgba(96,165,250,0.7)' : 'rgba(248,113,113,0.7)'}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
              );
            })}
            {throwPaths.map((path, index) => (
              <polyline
                key={`snap-throw-${index}`}
                points={path.map((q) => `${q.x},${q.y}`).join(' ')}
                fill="none"
                stroke="rgba(250,204,21,0.95)"
                strokeWidth="1.5"
                strokeDasharray="5 3"
              />
            ))}
            {offense.map((p) => {
              const pos = toSnapshot(p.x, p.y);
              return (
                <g key={`snap-off-${p.id}`} transform={`translate(${pos.x},${pos.y})`}>
                  <circle r="4.2" fill="#2563eb" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                  {holderId === p.id && <circle cx="5.8" cy="-5.8" r="2.2" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />}
                </g>
              );
            })}
            {defense.map((p) => {
              const pos = toSnapshot(p.x, p.y);
              return <circle key={`snap-def-${p.id}`} cx={pos.x} cy={pos.y} r="4.2" fill="#dc2626" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />;
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <HeaderBar
        onManageTeams={() => {
          setShowTeamModal(true);
          clearPendingManageTeams();
        }}
        onManageAccount={() => {
          setShowAccountModal(true);
        }}
        onStartTour={() => {
          startTour();
        }}
        onShareApp={() => {
          shareApp();
        }}
        onOpenAuth={() => {
          setShowAuthModal(true);
        }}
        sublabel="Playbook"
        user={user}
      />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Your playbook</h1>
            <p className="text-sm text-slate-400">Browse saved plays, then open them in the builder.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewConceptModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30"
            >
              New Concept
            </button>
            <button
              onClick={createNewPlay}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-sky-500 text-sky-950 hover:bg-sky-400 shadow-lg shadow-sky-500/30"
            >
              New Isolated Play
            </button>
          </div>
        </div>

        <section className="mt-8 flex gap-6">
          {playConcepts.length > 0 && (
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 max-h-[calc(100vh-9rem)] overflow-y-auto">
                <div className="space-y-2">
                  {playConcepts.map((concept) => {
                    const conceptOpen = expandedConcepts[concept.id] ?? true;
                    return (
                      <div key={`nav-${concept.id}`} className="rounded-lg border border-slate-800 bg-slate-950/40">
                        <button
                          type="button"
                          onClick={() => toggleConcept(concept.id)}
                          className="w-full flex items-center justify-between px-2.5 py-2 text-left"
                        >
                          <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${concept.isIndependent ? 'text-slate-300' : 'text-emerald-300'}`}>{concept.name}</span>
                          {conceptOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                        </button>
                        {!concept.isIndependent && (
                          <div className="px-2.5 pb-1.5">
                            <button
                              type="button"
                              onClick={() => createNewSequenceInConcept(concept.id, concept.name)}
                              className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                            >
                              New Sequence
                            </button>
                          </div>
                        )}
                        {conceptOpen && (
                          <div className="pb-2 px-1.5 space-y-1">
                            {concept.sequences.map((sequence, sequenceIndex) => {
                              const sequenceKey = `${concept.id}::${sequenceIndex}`;
                              const sequenceName = getSequenceDisplayName(sequence, sequenceIndex);
                              const draftKey = getSequenceKey(concept.id, sequence, sequenceIndex);
                              const draftName = sequenceNameDrafts[draftKey] ?? sequenceName;
                              return (
                                <div
                                  key={`nav-seq-${concept.id}-${sequenceIndex}`}
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggingSequence({ conceptId: concept.id, sequenceIndex });
                                    e.dataTransfer.setData('text/plain', sequenceKey);
                                    e.dataTransfer.effectAllowed = 'move';
                                  }}
                                  onDragOver={(e) => {
                                    if (!draggingSequence) return;
                                    if (draggingSequence.conceptId !== concept.id) return;
                                    if (draggingSequence.sequenceIndex === sequenceIndex) return;
                                    e.preventDefault();
                                    setDragOverSequenceKey(sequenceKey);
                                  }}
                                  onDrop={async (e) => {
                                    e.preventDefault();
                                    if (!draggingSequence) return;
                                    if (draggingSequence.conceptId !== concept.id) return;
                                    await reorderSequenceOrder(concept.id, draggingSequence.sequenceIndex, sequenceIndex);
                                    setDraggingSequence(null);
                                    setDragOverSequenceKey(null);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingSequence(null);
                                    setDragOverSequenceKey(null);
                                  }}
                                  className={`rounded-md border bg-slate-900/30 ${dragOverSequenceKey === sequenceKey ? 'border-emerald-500/70' : 'border-slate-800/80'}`}
                                >
                                  <div className="w-full flex items-center justify-between gap-1 px-2 py-1.5 text-left">
                                    <div className="shrink-0 text-slate-500 cursor-grab">
                                      <GripVertical size={12} />
                                    </div>
                                    <input
                                      value={draftName}
                                      onChange={(e) => updateSequenceNameDraft(concept.id, sequenceIndex, sequence, e.target.value)}
                                      className="min-w-0 flex-1 bg-transparent border border-transparent hover:border-slate-700/70 focus:border-indigo-500/60 rounded px-1 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300 font-bold focus:outline-none"
                                    />
                                    <div className="w-4" />
                                  </div>
                                  <div className="px-2 pb-1">
                                    <div className="h-1" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}
          <div className="flex-1 min-w-0">
            {playConcepts.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic">No plays saved yet.</div>
            ) : (
              <div className="space-y-6">
                {playConcepts.map((concept) => (
                  <div key={concept.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={`text-sm font-extrabold uppercase tracking-[0.18em] ${concept.isIndependent ? 'text-slate-300' : 'text-emerald-300'}`}>
                      {concept.name}
                    </h2>
                    {!concept.isIndependent && (
                      <button
                        type="button"
                        onClick={() => createNewSequenceInConcept(concept.id, concept.name)}
                        className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-900/70 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                      >
                        New Sequence
                      </button>
                    )}
                  </div>
                    <div className="mt-3 space-y-3">
                      {concept.sequences.map((sequence, sequenceIndex) => (
                        <div key={`${concept.id}-sequence-${sequenceIndex}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                          {(() => {
                            const sequenceName = getSequenceDisplayName(sequence, sequenceIndex);
                            const draftKey = getSequenceKey(concept.id, sequence, sequenceIndex);
                            const draftName = sequenceNameDrafts[draftKey] ?? sequenceName;
                            return (
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <input
                              value={draftName}
                              onChange={(e) => updateSequenceNameDraft(concept.id, sequenceIndex, sequence, e.target.value)}
                              className="min-w-0 flex-1 bg-transparent border border-transparent hover:border-slate-700/70 focus:border-indigo-500/60 rounded px-1 py-0.5 text-[10px] uppercase tracking-widest text-slate-300 font-bold focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => deleteSequenceBranch(sequence, concept.sequences)}
                              className="rounded border border-red-900/60 bg-red-950/30 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-red-300 hover:bg-red-900/40 hover:text-red-100"
                              title="Delete this sequence branch"
                            >
                              Delete Sequence
                            </button>
                          </div>
                            );
                          })()}
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            {sequence.map((play, stepIndex) => (
                              <div key={`${concept.id}-${sequenceIndex}-${play.id}-${stepIndex}`} className="flex items-center gap-2">
                                <div className="min-w-[170px] max-w-[190px]">
                                  {renderPlayCard(play, sequence[0]?.id, sequence[1]?.id)}
                                </div>
                                {stepIndex < sequence.length - 1 && (
                                  <div className="text-slate-500 text-[12px] font-bold px-1">→</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <AccountModal
          isOpen={showAccountModal}
          onClose={() => { if (!isDeletingAccount) setShowAccountModal(false); }}
          onConfirmDelete={handleDeleteAccount}
          isDeleting={isDeletingAccount}
          error={deleteAccountError}
          userEmail={user?.email || null}
        />

        <OnboardingIntroModal
          isOpen={showOnboardingIntro}
          onStart={startTour}
          onClose={closeIntro}
        />

        <ShareModal
          isOpen={showShareModal}
          shareUrl={shareUrl}
          onClose={() => setShowShareModal(false)}
          onCopy={copyShareLink}
          copyStatus={shareStatus}
        />

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />

        {showTeamModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
                <h2 className="text-base font-bold flex items-center gap-2"><Users size={16} className="text-emerald-400" /> Teams</h2>
                <button onClick={() => setShowTeamModal(false)} className="text-slate-500 hover:text-white transition-colors">X</button>
              </div>
              <div className="p-6 space-y-4">
                {teams.length === 0 ? (
                  <div className="text-sm text-slate-400">You are not on any teams yet.</div>
                ) : (
                  <div className="space-y-2">
                    {teams.map((team) => (
                      <div key={team.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
                        <span>{team.name}</span>
                        {team.ownerId === user?.uid && (
                          <span className="text-[10px] uppercase tracking-widest text-emerald-300">Owner</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-800 pt-4">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Create a team</div>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Team name"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    />
                    <button
                      onClick={handleCreateTeam}
                      className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showNewConceptModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
                <h2 className="text-base font-bold">Create Concept</h2>
                <button onClick={() => setShowNewConceptModal(false)} className="text-slate-500 hover:text-white transition-colors">X</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Concept Name</label>
                  <input
                    autoFocus
                    value={newConceptName}
                    onChange={(e) => setNewConceptName(e.target.value)}
                    placeholder="e.g. Horizontal Base"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowNewConceptModal(false);
                      setNewConceptName('');
                    }}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createNewConcept}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    Create Concept
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {moveTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
                <h2 className="text-base font-bold">Move To Concept</h2>
                <button onClick={() => setMoveTarget(null)} className="text-slate-500 hover:text-white transition-colors">X</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="text-sm text-slate-300 truncate" title={moveTarget.name}>{moveTarget.name}</div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Concept</label>
                  <select
                    value={moveConceptChoice}
                    onChange={(e) => setMoveConceptChoice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="__independent__">Isolated Plays</option>
                    {conceptOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                    <option value="__new__">Create New Concept...</option>
                  </select>
                </div>
                {moveConceptChoice === '__new__' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">New Concept Name</label>
                    <input
                      autoFocus
                      value={moveNewConceptName}
                      onChange={(e) => setMoveNewConceptName(e.target.value)}
                      placeholder="e.g. Horizontal Counter Set"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setMoveTarget(null)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveMoveConcept}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
                  >
                    Move
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {sharingTarget && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
                <h2 className="text-base font-bold flex items-center gap-2"><Share2 size={16} className="text-emerald-400" /> Share</h2>
                <button onClick={() => setSharingTarget(null)} className="text-slate-500 hover:text-white transition-colors">X</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">Visibility</div>
                  <select
                    value={sharingVisibility}
                    onChange={(e) => setSharingVisibility(e.target.value as 'private' | 'team' | 'public')}
                    className="mt-2 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <option value="private">Private</option>
                    <option value="team">Team</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                {sharingVisibility === 'team' && (
                  <div className="space-y-2">
                    {teams.length === 0 ? (
                      <div className="text-xs text-slate-400">Create or join a team to share.</div>
                    ) : (
                      teams.map((team) => (
                        <label key={team.id} className="flex items-center gap-2 text-sm text-slate-200">
                          <input
                            type="checkbox"
                            checked={sharingTeamIds.includes(team.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSharingTeamIds([...sharingTeamIds, team.id]);
                              } else {
                                setSharingTeamIds(sharingTeamIds.filter((id) => id !== team.id));
                              }
                            }}
                            className="accent-emerald-400"
                          />
                          <span>{team.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSharingTarget(null)}
                    className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveSharing}
                    className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlaybookPage;
