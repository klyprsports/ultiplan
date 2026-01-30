import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, BookOpen, LayoutGrid, Menu, Copy, Share2, Users, Plus, Library, LogOut, LogIn } from 'lucide-react';
import { Formation, Play, Player, TeamInfo } from './types';
import {
  loadFormationsFromStorage,
  loadPlaysFromStorage,
  saveFormationsToStorage,
  savePlaysToStorage,
  setPendingSelection,
  loadPendingManageTeams,
  clearPendingManageTeams
} from './services/storage';
import { signInWithGoogle, signOutUser, subscribeToAuth, getCurrentUser } from './services/auth';
import { createTeam, deleteFormationFromFirestore, deletePlayFromFirestore, fetchFormationsForUser, fetchPlaysForUser, fetchTeamsForUser, isFirestoreEnabled, saveFormationToFirestore, savePlayToFirestore } from './services/firestore';
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
    <svg viewBox={viewBox} className="w-full h-40 rounded-lg overflow-hidden bg-slate-950">
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

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

const PlaybookPage: React.FC = () => {
  const [tab, setTab] = useState<'plays' | 'formations'>('plays');
  const [savedPlays, setSavedPlays] = useState<Play[]>([]);
  const [savedFormations, setSavedFormations] = useState<Formation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [sharingTarget, setSharingTarget] = useState<{ type: 'play' | 'formation'; item: Play | Formation } | null>(null);
  const [sharingVisibility, setSharingVisibility] = useState<'private' | 'team' | 'public'>('private');
  const [sharingTeamIds, setSharingTeamIds] = useState<string[]>([]);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

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

  const clonePlay = async (play: Play) => {
    try {
      await ensureSignedInForWrite();
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const newPlay: Play = {
        ...play,
        id: generateId(),
        ownerId: currentUser.uid,
        visibility: 'private',
        sharedTeamIds: [],
        createdBy: currentUser.uid,
        lastEditedBy: currentUser.uid,
        sourcePlayId: play.id,
        name: `${play.name} (Copy)`
      };
      setSavedPlays((prev) => [newPlay, ...prev]);
      if (isFirestoreEnabled()) {
        await savePlayToFirestore(newPlay);
      }
    } catch (error) {
      console.error('Failed to clone play', error);
    }
  };

  const cloneFormation = async (formation: Formation) => {
    try {
      await ensureSignedInForWrite();
      const currentUser = getCurrentUser();
      if (!currentUser) return;
      const newFormation: Formation = {
        ...formation,
        id: generateId(),
        ownerId: currentUser.uid,
        visibility: 'private',
        sharedTeamIds: [],
        createdBy: currentUser.uid,
        lastEditedBy: currentUser.uid,
        sourceFormationId: formation.id,
        name: `${formation.name} (Copy)`
      };
      setSavedFormations((prev) => [newFormation, ...prev]);
      if (isFirestoreEnabled()) {
        await saveFormationToFirestore(newFormation);
      }
    } catch (error) {
      console.error('Failed to clone formation', error);
    }
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
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-950 rounded-lg flex items-center justify-center shadow-indigo-500/10 shadow-sm overflow-hidden">
            <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight text-white">Ultiplan</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <BookOpen size={12} className="text-emerald-400" />
              Playbook
            </div>
          </div>
        </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1 text-[11px] font-bold uppercase tracking-widest">
              <button
                onClick={() => navigate('/playbook')}
                className="px-3 py-2 rounded-lg flex items-center gap-2 bg-emerald-500 text-emerald-950"
                aria-current="page"
              >
                <Library size={14} /> Playbook
              </button>
              <button
                onClick={() => navigate('/builder')}
                className="px-3 py-2 rounded-lg flex items-center gap-2 text-slate-400 hover:text-slate-200"
              >
                <LayoutGrid size={14} /> Builder
              </button>
            </div>
            {user && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || user.email || 'User'} className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-slate-800 text-[10px] font-bold text-slate-200 flex items-center justify-center">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-slate-200 max-w-[140px] truncate">
                  {user.displayName || user.email || 'Google user'}
                </span>
              </div>
            )}
            <div className="relative">
              <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-200 flex items-center justify-center shadow-sm transition-colors"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden">
                {user ? (
                  <div className="px-4 py-3 border-b border-slate-800">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Signed in</div>
                    <div className="text-xs text-slate-200 truncate">{user.displayName || user.email || 'Google user'}</div>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-b border-slate-800 text-xs text-slate-400">Not signed in</div>
                )}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate('/builder');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <LayoutGrid size={14} />
                  Builder
                </button>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setShowTeamModal(true);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Users size={14} />
                  Manage Teams
                </button>
                <div className="border-t border-slate-800/70" />
                {user ? (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      signOutUser().catch((error) => console.error('Failed to sign out', error));
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-red-300 hover:bg-slate-800"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      signInWithGoogle().catch((error) => console.error('Failed to sign in', error));
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <LogIn size={14} />
                    Sign in with Google
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

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
              <div className="grid gap-6 md:grid-cols-2">
                {savedPlays.map((play) => (
                  <div key={play.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
                    <MiniField players={play.players} showPaths />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">{play.name}</h3>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">
                          {play.players.length} Players · {play.force} Force
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-widest">
                          <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300">{play.visibility || 'private'}</span>
                          {play.ownerId && play.ownerId !== user?.uid && (
                            <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200">Shared</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {play.ownerId === user?.uid && (
                          <button
                            onClick={() => openSharing({ type: 'play', item: play })}
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                            aria-label="Sharing settings"
                          >
                            <Share2 size={16} />
                          </button>
                        )}
                        {play.ownerId === user?.uid && (
                          <button
                            onClick={() => deletePlay(play.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            aria-label="Delete play"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openPlay(play.id)}
                        className="w-full py-2 rounded-xl bg-emerald-500 text-emerald-950 font-bold uppercase tracking-widest text-xs hover:bg-emerald-400 transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => clonePlay(play)}
                        className="w-full py-2 rounded-xl bg-slate-800 text-slate-200 font-bold uppercase tracking-widest text-xs hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Copy size={14} />
                        Clone
                      </button>
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
              <div className="grid gap-6 md:grid-cols-2">
                {savedFormations.map((formation) => (
                  <div key={formation.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
                    <MiniField players={formation.players} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">{formation.name}</h3>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">
                          {formation.players.filter((p) => p.team === 'offense').length} O · {formation.players.filter((p) => p.team === 'defense').length} D
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-widest">
                          <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300">{formation.visibility || 'private'}</span>
                          {formation.ownerId && formation.ownerId !== user?.uid && (
                            <span className="px-2 py-1 rounded-full bg-indigo-500/20 text-indigo-200">Shared</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {formation.ownerId === user?.uid && (
                          <button
                            onClick={() => openSharing({ type: 'formation', item: formation })}
                            className="p-2 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-slate-800 transition-colors"
                            aria-label="Sharing settings"
                          >
                            <Share2 size={16} />
                          </button>
                        )}
                        {formation.ownerId === user?.uid && (
                          <button
                            onClick={() => deleteFormation(formation.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            aria-label="Delete formation"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openFormation(formation.id)}
                        className="w-full py-2 rounded-xl bg-indigo-500 text-white font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 transition-colors"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => cloneFormation(formation)}
                        className="w-full py-2 rounded-xl bg-slate-800 text-slate-200 font-bold uppercase tracking-widest text-xs hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Copy size={14} />
                        Clone
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

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
                <h2 className="text-base font-bold flex items-center gap-2"><Share2 size={16} className="text-emerald-400" /> Sharing</h2>
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
