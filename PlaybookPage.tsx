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

  const openPlay = (id: string) => {
    setPendingSelection({ type: 'play', id });
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
          ? 'No Concept'
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

  const renderPlayCard = (play: Play): React.ReactNode => {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openPlay(play.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPlay(play.id);
          }
        }}
        className="rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-sky-200 truncate" title={play.name}>{play.name}</h3>
            <div className="mt-1 flex items-center gap-2 text-[9px] uppercase tracking-widest">
              {play.ownerId === user?.uid ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                                openSharing(play);
                  }}
                  className="px-2 py-1 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                  aria-label="Change sharing level"
                  title="Change sharing level"
                >
                  {play.visibility || 'private'}
                </button>
              ) : (
                <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300">{play.visibility || 'private'}</span>
              )}
            </div>
          </div>
          {play.ownerId === user?.uid && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openMoveConceptModal(play);
                }}
                className="px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Move
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePlay(play.id);
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                aria-label="Delete play"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
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
              New Play
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
                  <div className="mt-3 overflow-x-auto">
                    <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-4 pb-1">
                      {concept.sequences.map((sequence, sequenceIndex) => (
                        <div key={`${concept.id}-sequence-${sequenceIndex}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">
                            Sequence {sequenceIndex + 1}
                          </div>
                          <div className="space-y-2">
                            {sequence.map((play, stepIndex) => (
                              <div key={`${concept.id}-${sequenceIndex}-${play.id}-${stepIndex}`} className="space-y-2">
                                {renderPlayCard(play)}
                                {stepIndex < sequence.length - 1 && (
                                  <div className="text-center text-slate-600 text-[10px] uppercase tracking-widest">then</div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
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
                    <option value="__independent__">No Concept</option>
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
