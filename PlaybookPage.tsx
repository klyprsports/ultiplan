import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, LayoutGrid, Share2, Users, Plus } from 'lucide-react';
import { Formation, Play, Player, TeamInfo } from './types';
import {
  loadFormationsFromStorage,
  loadPlaysFromStorage,
  saveFormationsToStorage,
  savePlaysToStorage,
  setPendingSelection,
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
import { createTeam, deleteAccountData, deleteFormationFromFirestore, deletePlayFromFirestore, fetchFormationsForUser, fetchPlaysForUser, fetchTeamsForUser, isFirestoreEnabled, saveFormationToFirestore, savePlayToFirestore } from './services/firestore';
import { User } from 'firebase/auth';

const FIELD_WIDTH = 40;
const FIELD_HEIGHT = 110;
const ENDZONE_DEPTH = 20;

const MiniField: React.FC<{ players: Player[]; showPaths?: boolean }> = ({ players, showPaths = false }) => {
  const viewBox = `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`;
  const endzoneTop = ENDZONE_DEPTH;
  const endzoneBottom = FIELD_HEIGHT - ENDZONE_DEPTH;

  const yardLines = useMemo(
    () => Array.from({ length: Math.floor(FIELD_HEIGHT / 10) + 1 }, (_, i) => i * 10)
      .filter((yard) => yard > ENDZONE_DEPTH && yard < FIELD_HEIGHT - ENDZONE_DEPTH),
    []
  );

  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="w-full h-full rounded-lg overflow-hidden">
      <rect width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="#065f46" />
      <rect x="0" y="0" width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      <line x1="0" y1={endzoneTop} x2={FIELD_WIDTH} y2={endzoneTop} stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <line x1="0" y1={endzoneBottom} x2={FIELD_WIDTH} y2={endzoneBottom} stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      {yardLines.map((yard) => (
        <line
          key={`yard-${yard}`}
          x1="0"
          y1={yard}
          x2={FIELD_WIDTH}
          y2={yard}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.3"
        />
      ))}
      {showPaths && players.map((player) => {
        const pts = [{ x: player.x, y: player.y }, ...player.path];
        if (pts.length <= 1) return null;
        return (
          <polyline
            key={`path-${player.id}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={player.team === 'offense' ? '#60a5fa' : '#f87171'}
            strokeWidth="0.35"
            strokeDasharray="2 1"
            opacity="0.8"
          />
        );
      })}
      {players.map((player) => (
        <g key={player.id} transform={`translate(${player.x}, ${player.y})`}>
          <circle
            r={1.4}
            fill={player.team === 'offense' ? '#2563eb' : '#dc2626'}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.2"
          />
          {player.hasDisc && (
            <circle
              cx={1.4}
              cy={-1.4}
              r={0.6}
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth="0.2"
            />
          )}
        </g>
      ))}
    </svg>
  );
};

const PlaybookPage: React.FC = () => {
  const [tab, setTab] = useState<'plays' | 'formations'>('plays');
  const [savedPlays, setSavedPlays] = useState<Play[]>([]);
  const [savedFormations, setSavedFormations] = useState<Formation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [sharingTarget, setSharingTarget] = useState<{ type: 'play' | 'formation'; item: Play | Formation } | null>(null);
  const [sharingVisibility, setSharingVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [sharingTeamIds, setSharingTeamIds] = useState<string[]>([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [showOnboardingIntro, setShowOnboardingIntro] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
    setSavedFormations(loadFormationsFromStorage());
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
    saveFormationsToStorage(savedFormations);
  }, [savedFormations]);

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
        const [remotePlays, remoteFormations] = await Promise.all([
          fetchPlaysForUser(teamIds).catch((error) => {
            console.error('Failed to fetch plays from Firestore', error);
            throw error;
          }),
          fetchFormationsForUser(teamIds).catch((error) => {
            console.error('Failed to fetch formations from Firestore', error);
            throw error;
          })
        ]);
        if (cancelled) return;
        if (remotePlays.length > 0 || remoteFormations.length > 0) {
          setSavedPlays(remotePlays);
          setSavedFormations(remoteFormations);
        } else {
          const localPlays = loadPlaysFromStorage();
          const localFormations = loadFormationsFromStorage();
          if (localPlays.length > 0 || localFormations.length > 0) {
            const uid = getCurrentUser()?.uid;
            await Promise.all([
              ...localPlays.map((play) => savePlayToFirestore({ ...play, ownerId: play.ownerId || uid, visibility: play.visibility || 'private', sharedTeamIds: play.sharedTeamIds || [] })),
              ...localFormations.map((formation) => saveFormationToFirestore({ ...formation, ownerId: formation.ownerId || uid, visibility: formation.visibility || 'private', sharedTeamIds: formation.sharedTeamIds || [] }))
            ]);
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

  const deleteFormation = (id: string) => {
    setSavedFormations((prev) => prev.filter((f) => f.id !== id));
    if (isFirestoreEnabled()) {
      deleteFormationFromFirestore(id).catch((error) => console.error('Failed to delete formation from Firestore', error));
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
      setSavedFormations([]);
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

  const openFormation = (id: string) => {
    setPendingSelection({ type: 'formation', id });
    navigate('/builder');
  };

  const createNewPlay = () => {
    setPendingSelection({ type: 'new-play' });
    navigate('/builder');
  };

  const openSharing = (target: { type: 'play' | 'formation'; item: Play | Formation }) => {
    setSharingTarget(target);
    setSharingVisibility(target.item.visibility || 'private');
    setSharingTeamIds(target.item.sharedTeamIds || []);
  };

  const saveSharing = async () => {
    if (!sharingTarget) return;
    await ensureSignedInForWrite();
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const visibility = sharingVisibility;
    if (sharingTarget.type === 'play') {
      const play = sharingTarget.item as Play;
      const updated: Play = {
        ...play,
        visibility,
        sharedTeamIds: visibility === 'team' ? sharingTeamIds : []
      };
      setSavedPlays((prev) => prev.map((p) => (p.id === play.id ? updated : p)));
      if (isFirestoreEnabled()) {
        await savePlayToFirestore(updated);
      }
    } else {
      const formation = sharingTarget.item as Formation;
      const updated: Formation = {
        ...formation,
        visibility,
        sharedTeamIds: visibility === 'team' ? sharingTeamIds : []
      };
      setSavedFormations((prev) => prev.map((f) => (f.id === formation.id ? updated : f)));
      if (isFirestoreEnabled()) {
        await saveFormationToFirestore(updated);
      }
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
            <p className="text-sm text-slate-400">Browse saved plays and formations, then open them in the builder.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={createNewPlay}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30"
            >
              New Play
            </button>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1 text-[11px] font-bold uppercase tracking-widest">
              <button
                onClick={() => setTab('plays')}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 ${tab === 'plays' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <LayoutGrid size={14} /> Plays
              </button>
              <button
                onClick={() => setTab('formations')}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 ${tab === 'formations' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Formations
              </button>
            </div>
          </div>
        </div>

        {tab === 'plays' && (
          <section className="mt-8">
            {savedPlays.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic">No plays saved yet.</div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {savedPlays.map((play) => (
                  <div
                    key={play.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPlay(play.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPlay(play.id);
                      }
                    }}
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg w-full overflow-hidden cursor-pointer hover:border-emerald-500/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight break-words" title={play.name}>
                          {play.name}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-widest">
                          {play.ownerId === user?.uid ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openSharing({ type: 'play', item: play });
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
                          {play.ownerId && play.ownerId !== user?.uid && (
                            <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200">Shared</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {play.ownerId === user?.uid && (
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
                        )}
                      </div>
                    </div>
                    <div className="mt-2 w-full max-w-[180px] aspect-[4/11] rounded-lg overflow-hidden bg-slate-950/40 border border-slate-800/80 self-center">
                      <MiniField players={play.players} showPaths />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'formations' && (
          <section className="mt-8">
            {savedFormations.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic">No formations saved yet.</div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {savedFormations.map((formation) => (
                  <div
                    key={formation.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFormation(formation.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openFormation(formation.id);
                      }
                    }}
                    className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg w-full overflow-hidden cursor-pointer hover:border-indigo-500/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base sm:text-lg font-extrabold text-white leading-tight break-words" title={formation.name}>
                          {formation.name}
                        </h3>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300 font-bold mt-1 w-full truncate">
                          {formation.players.filter((p) => p.team === 'offense').length} O - {formation.players.filter((p) => p.team === 'defense').length} D
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-widest">
                          {formation.ownerId === user?.uid ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openSharing({ type: 'formation', item: formation });
                              }}
                              className="px-2 py-1 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
                              aria-label="Change sharing level"
                              title="Change sharing level"
                            >
                              {formation.visibility || 'private'}
                            </button>
                          ) : (
                            <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300">{formation.visibility || 'private'}</span>
                          )}
                          {formation.ownerId && formation.ownerId !== user?.uid && (
                            <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200">Shared</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {formation.ownerId === user?.uid && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteFormation(formation.id);
                            }}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            aria-label="Delete formation"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 w-full max-w-[180px] aspect-[4/11] rounded-lg overflow-hidden bg-slate-950/40 border border-slate-800/80 self-center">
                      <MiniField players={formation.players} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

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
