import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, Share2, Users, Plus } from 'lucide-react';
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

  const deletePlay = (id: string) => {
    setSavedPlays((prev) => prev.filter((p) => p.id !== id));
    if (isFirestoreEnabled()) {
      deletePlayFromFirestore(id).catch((error) => console.error('Failed to delete play from Firestore', error));
    }
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

        return {
          id: conceptId,
          isIndependent,
          name: conceptName,
          playCount: plays.length,
          sequences
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [savedPlays]);

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
        <h3 className="text-sm font-bold text-sky-200 truncate mb-3" title={play.name}>{play.name}</h3>
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

        <section className="mt-8">
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
                  </div>
                  <div className="mt-3 space-y-3">
                    {concept.sequences.map((sequence, sequenceIndex) => (
                      <div key={`${concept.id}-sequence-${sequenceIndex}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">
                          Sequence {sequenceIndex + 1}
                        </div>
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
