
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Trash2, Plus, X, Save, Library } from 'lucide-react';
import Field from './components/Field';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import WorkflowSidebar from './components/WorkflowSidebar';
import { Player, InteractionMode, Play, Team, Point, Force, Formation } from './types';
import { loadPlaysFromStorage, savePlaysToStorage, loadFormationsFromStorage, saveFormationsToStorage, normalizeFormationPlayers, normalizePlay } from './services/storage';
import { DEFAULT_SPEED, DEFAULT_ACCELERATION, MAX_PLAYERS_PER_TEAM, FIELD_WIDTH, buildPresetFormation, getDumpOffsetX } from './services/formations';

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
};

type AnimationState = 'IDLE' | 'PLAYING' | 'PAUSED';

const App: React.FC = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [mode, setMode] = useState<InteractionMode>(InteractionMode.SELECT);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [force, setForce] = useState<Force>('home');
  const [playName, setPlayName] = useState('New Play');
  const [playDescription, setPlayDescription] = useState('');
  const [savedPlays, setSavedPlays] = useState<Play[]>([]);
  const [savedFormations, setSavedFormations] = useState<Formation[]>([]);
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  const [animationState, setAnimationState] = useState<AnimationState>('IDLE');
  const [animationTime, setAnimationTime] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const [showNewPlayModal, setShowNewPlayModal] = useState(false);
  const [showSavePlayModal, setShowSavePlayModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [tempPlayName, setTempPlayName] = useState('');
  const [tempSavePlayName, setTempSavePlayName] = useState('');
  const [activeFormation, setActiveFormation] = useState<'vertical' | 'side' | 'ho' | 'custom' | null>(null);
  const [showSaveFormationModal, setShowSaveFormationModal] = useState(false);
  const [tempFormationName, setTempFormationName] = useState('');
  const [formationNameError, setFormationNameError] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<'plays' | 'formations'>('plays');

  const isAnimationActive = animationState !== 'IDLE';

  useEffect(() => {
    setSavedPlays(loadPlaysFromStorage());
    setSavedFormations(loadFormationsFromStorage());
  }, []);

  useEffect(() => {
    savePlaysToStorage(savedPlays);
  }, [savedPlays]);

  useEffect(() => {
    saveFormationsToStorage(savedFormations);
  }, [savedFormations]);

  const maxPlayDuration = useMemo(() => {
    let maxDur = 0;
    players.forEach(player => {
      if (player.path.length === 0) return;
      const points = [{ x: player.x, y: player.y }, ...player.path];
      let totalTime = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const L = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        totalTime += L / (player.speed * 0.9);
      }
      if (totalTime > maxDur) maxDur = totalTime;
    });
    return maxDur + 1.5;
  }, [players]);

  const addPlayer = (team: Team, x: number, y: number) => {
    const teamPlayers = players.filter(p => p.team === team);
    if (teamPlayers.length >= MAX_PLAYERS_PER_TEAM) return;

    const id = generateId();
    const existingNums = teamPlayers.map(p => {
        const match = p.label.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
    }).sort((a, b) => a - b);
    
    let nextNum = 1;
    for (const n of existingNums) {
      if (n === nextNum) nextNum++;
      else if (n > nextNum) break;
    }
    
    const newPlayer: Player = {
      id, team, x, y,
      label: team === 'offense' ? `O${nextNum}` : `D${nextNum}`,
      path: [], speed: DEFAULT_SPEED, acceleration: DEFAULT_ACCELERATION, hasDisc: false,
      role: team === 'offense' ? 'cutter' : undefined
    };
    setPlayers(prev => [...prev, newPlayer]);
    setSelectedPlayerId(id);
  };

  const updatePlayerPosition = (id: string, x: number, y: number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p));
  };

  const updatePlayerSpeed = (id: string, speed: number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, speed } : p));
  };

  const updatePlayerAcceleration = (id: string, acceleration: number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, acceleration } : p));
  };

  const updatePlayerRole = (id: string, role: 'handler' | 'cutter') => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, role } : p));
  };

  const updateCutterDefense = (id: string, cutterDefense: 'under' | 'deep') => {
    setPlayers(prev => {
      const offense = prev.filter(p => p.team === 'offense');
      const discHolder = offense.find(p => p.hasDisc) || offense[0];
      return prev.map(p => {
        if (p.id !== id) return p;
        const next = { ...p, cutterDefense };
        if (p.team !== 'defense' || !p.coversOffenseId) return next;
        const covered = offense.find(op => op.id === p.coversOffenseId);
        if (!covered) return next;
        const nextPos = computeDefenderPosition(covered, discHolder, force, next);
        return { ...next, x: nextPos.x, y: nextPos.y };
      });
    });
  };

  const getForceXOffset = useCallback((p: Player, currentForce: Force) => {
    const fieldMidX = FIELD_WIDTH / 2;
    if (currentForce === 'home') return -3;
    if (currentForce === 'away') return 3;
    if (currentForce === 'middle') return p.x < fieldMidX ? 3 : -3;
    return p.x < fieldMidX ? -3 : 3;
  }, []);

  const getBreakXOffset = useCallback((p: Player, magnitude: number, currentForce: Force) => {
    const fieldMidX = FIELD_WIDTH / 2;
    if (currentForce === 'home') return magnitude;
    if (currentForce === 'away') return -magnitude;
    if (currentForce === 'middle') return p.x < fieldMidX ? -magnitude : magnitude;
    return p.x < fieldMidX ? magnitude : -magnitude;
  }, []);

  const computeDefenderPosition = useCallback((op: Player, discHolder: Player | undefined, currentForce: Force, defender?: Player) => {
    const role = op.role ?? 'cutter';
    if (discHolder && op.id === discHolder.id) {
      return {
        x: op.x + getBreakXOffset(op, 2, currentForce),
        y: op.y - 2
      };
    }
    if (role === 'handler' && discHolder) {
      const dx = discHolder.x - op.x;
      const dy = discHolder.y - op.y;
      return {
        x: op.x + dx * 0.25,
        y: op.y + dy * 0.25 - 3
      };
    }
    const cutterDepth = defender?.cutterDefense === 'deep' ? -3 : 3;
    return {
      x: op.x + getForceXOffset(op, currentForce),
      y: op.y + cutterDepth
    };
  }, [getBreakXOffset, getForceXOffset]);

  const autoAssignDefense = () => {
    const offense = players.filter(p => p.team === 'offense');
    if (offense.length === 0) return;
    const discHolder = offense.find(p => p.hasDisc) || offense[0];
    const existingDefense = players.filter(p => p.team === 'defense');
    const manualDefense = existingDefense.filter(p => !p.autoAssigned);
    const toAdd = Math.min(offense.length, MAX_PLAYERS_PER_TEAM - manualDefense.length);
    const newDefenders = offense.slice(0, toAdd).map((op, idx) => {
      const { x, y } = computeDefenderPosition(op, discHolder, force);
      return {
        id: generateId(),
        team: 'defense' as Team,
        x,
        y,
        label: `D${manualDefense.length + idx + 1}`,
        path: [],
        speed: op.speed,
        acceleration: op.acceleration,
        hasDisc: false,
        autoAssigned: true,
        coversOffenseId: op.id,
        cutterDefense: (op.role ?? 'cutter') === 'cutter' ? 'under' : undefined
      };
    });
    setPlayers([...players.filter(p => p.team !== 'defense'), ...manualDefense, ...newDefenders]);
  };

  const addPathPoint = (id: string, point: Point) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, path: [...p.path, point] } : p));
  };

  const undoLastPathPoint = (id: string) => {
    setPlayers(prev => prev.map(p => {
      if (p.id === id && p.path.length > 0) return { ...p, path: p.path.slice(0, -1) };
      return p;
    }));
  };

  const clearPath = (id: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, path: [] } : p));
  };

  const assignDisc = (id: string) => {
    setPlayers(prev => prev.map(p => ({
      ...p,
      hasDisc: p.id === id ? !p.hasDisc : false
    })));
  };

  const removePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
    if (selectedPlayerId === id) setSelectedPlayerId(null);
  };

  const startAnimation = () => {
    if (players.length === 0) return;
    setAnimationState('PLAYING');
    setAnimationTime(0);
    lastTickRef.current = performance.now();
    animationRef.current = requestAnimationFrame(animate);
  };

  const togglePause = () => {
    if (animationState === 'PLAYING') {
      setAnimationState('PAUSED');
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    } else if (animationState === 'PAUSED') {
      setAnimationState('PLAYING');
      lastTickRef.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
    }
  };

  const stopAnimation = () => {
    setAnimationState('IDLE');
    setAnimationTime(0);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const animate = (now: number) => {
    const deltaTime = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    setAnimationTime(prev => {
      const nextTime = prev + deltaTime;
      if (maxPlayDuration > 0 && nextTime >= maxPlayDuration + 1) {
        setAnimationState('IDLE');
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return 0;
      }
      return nextTime;
    });
    animationRef.current = requestAnimationFrame(animate);
  };

  const handleFieldClick = (x: number, y: number) => {
    if (isAnimationActive) return;
    if (mode === InteractionMode.ADD_OFFENSE) addPlayer('offense', x, y);
    else if (mode === InteractionMode.ADD_DEFENSE) addPlayer('defense', x, y);
    else if ((mode === InteractionMode.DRAW || mode === InteractionMode.SELECT) && selectedPlayerId) {
      const selected = players.find(p => p.id === selectedPlayerId);
      if (selected?.team === 'offense') addPathPoint(selectedPlayerId, { x, y });
    }
    else if (mode === InteractionMode.SELECT) setSelectedPlayerId(null);
  };

  // PERSISTENCE
  const buildFormationPlayers = () => {
    return players.map(p => ({
      ...p,
      path: [],
      hasDisc: p.team === 'offense' ? !!p.hasDisc : false,
      autoAssigned: false,
      coversOffenseId: undefined
    }));
  };

  const savePlay = (overrideName?: string) => {
    const finalName = (overrideName ?? playName).trim();
    if (finalName.toLowerCase() === 'new play') {
      setTempSavePlayName('');
      setShowSavePlayModal(true);
      return;
    }
    setSaveStatus('saving');
    const newPlay: Play = {
      id: editingPlayId || generateId(),
      name: finalName,
      players,
      force,
      description: playDescription
    };
    setSavedPlays(prev => {
      const existing = prev.findIndex(p => p.id === newPlay.id);
      if (existing !== -1) {
        const next = [...prev];
        next[existing] = newPlay;
        return next;
      }
      return [...prev, newPlay];
    });
    setEditingPlayId(newPlay.id);
    setPlayName(finalName);
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 600);
  };

  const loadPlay = (play: Play) => {
    setPlayers(play.players);
    setPlayName(play.name);
    setForce(play.force);
    setPlayDescription(play.description || '');
    setEditingPlayId(play.id);
    setShowLibraryModal(false);
  };

  const deleteSavedPlay = (id: string) => {
    setSavedPlays(prev => prev.filter(p => p.id !== id));
    if (editingPlayId === id) setEditingPlayId(null);
  };

  const saveFormation = () => {
    const name = (tempFormationName || 'New Formation').trim();
    const exists = savedFormations.some(f => f.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      setFormationNameError('A formation with this name already exists.');
      return;
    }
    const newFormation: Formation = {
      id: generateId(),
      name,
      players: buildFormationPlayers()
    };
    setSavedFormations(prev => [newFormation, ...prev]);
    setTempFormationName('');
    setFormationNameError(null);
    setShowSaveFormationModal(false);
  };

  const loadFormation = (formation: Formation) => {
    setPlayers(formation.players);
    setActiveFormation('custom');
    setShowLibraryModal(false);
  };

  const deleteSavedFormation = (id: string) => {
    setSavedFormations(prev => prev.filter(f => f.id !== id));
  };

  // storage + formation helpers are imported

  const hasUnsavedFormation = useMemo(() => {
    if (players.length === 0) return false;
    const current = normalizeFormationPlayers(buildFormationPlayers());
    const matchesFormation = (formationPlayers: Player[]) => {
      const saved = normalizeFormationPlayers(formationPlayers);
      if (saved.length !== current.length) return false;
      for (let i = 0; i < saved.length; i++) {
        const a = saved[i];
        const b = current[i];
        if (
          a.team !== b.team ||
          a.label !== b.label ||
          a.x !== b.x ||
          a.y !== b.y ||
          a.speed !== b.speed ||
          a.acceleration !== b.acceleration ||
          a.role !== b.role ||
          a.hasDisc !== b.hasDisc
        ) {
          return false;
        }
      }
      return true;
    };

    const matchesSaved = savedFormations.some(f => matchesFormation(f.players));
    const matchesPreset = (['vertical', 'side', 'ho'] as const).some(preset =>
      matchesFormation(buildPresetFormation(preset, force, (idx) => `preset-${preset}-${idx}`))
    );

    return !(matchesSaved || matchesPreset);
  }, [players, savedFormations, force]);

  const hasUnsavedPlay = useMemo(() => {
    if (players.length === 0) return false;
    const current = normalizePlay({ name: playName, force, description: playDescription, players });
    return !savedPlays.some(p => {
      const saved = normalizePlay({ name: p.name, force: p.force, description: p.description || '', players: p.players });
      return JSON.stringify(saved) === JSON.stringify(current);
    });
  }, [players, playName, force, playDescription, savedPlays]);

  const formationSaveReason = hasUnsavedFormation ? '' : 'No changes from an existing or preset formation.';
  const playSaveReason = !players.some(p => p.team === 'offense')
    ? 'Add at least one offensive player before saving.'
    : !hasUnsavedPlay
      ? 'No changes from an existing saved play.'
      : '';

  const applyFormationNearOwnEndzone = (formation: 'vertical' | 'side' | 'ho') => {
    if (isAnimationActive) return;
    const offensePlayers = buildPresetFormation(formation, force, () => generateId());

    setPlayers(prev => {
      const defenseOnly = prev.filter(p => p.team !== 'offense');
      return [...defenseOnly, ...offensePlayers];
    });
    setSelectedPlayerId(offensePlayers[0]?.id ?? null);
    setActiveFormation(formation);
  };

  useEffect(() => {
    if (activeFormation !== 'vertical') return;
    const stackX = FIELD_WIDTH / 2;
    const dumpOffsetX = getDumpOffsetX(force);
    setPlayers(prev => prev.map(p => {
      if (p.team !== 'offense' || p.label !== 'O7') return p;
      return { ...p, x: stackX + dumpOffsetX };
    }));
  }, [force, activeFormation]);

  useEffect(() => {
    setPlayers(prev => {
      const offense = prev.filter(p => p.team === 'offense');
      const discHolder = offense.find(p => p.hasDisc) || offense[0];
      let changed = false;
      const next = prev.map(p => {
        if (p.team !== 'defense' || !p.autoAssigned || !p.coversOffenseId) return p;
        const covered = offense.find(op => op.id === p.coversOffenseId);
        if (!covered) return p;
        const nextPos = computeDefenderPosition(covered, discHolder, force, p);
        if (p.x === nextPos.x && p.y === nextPos.y) return p;
        changed = true;
        return { ...p, x: nextPos.x, y: nextPos.y };
      });
      return changed ? next : prev;
    });
  }, [force, computeDefenderPosition]);

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* New Play Modal */}
      {showNewPlayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <h2 className="text-lg font-bold flex items-center gap-2"><Plus size={20} className="text-indigo-400" /> Start New Play</h2>
              <button onClick={() => setShowNewPlayModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Play Name</label>
                <input autoFocus type="text" value={tempPlayName} onChange={(e) => setTempPlayName(e.target.value)} placeholder="e.g. Vert Stack Deep Look" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            </div>
            <div className="p-6 bg-slate-800/30 flex gap-3">
              <button onClick={() => setShowNewPlayModal(false)} className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={() => { setPlayers([]); setPlayName(tempPlayName || 'New Play'); setEditingPlayId(null); setPlayDescription(''); setShowNewPlayModal(false); stopAnimation(); }} className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Formation Modal */}
      {showSaveFormationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <h2 className="text-lg font-bold flex items-center gap-2"><Save size={20} className="text-emerald-400" /> Save Formation</h2>
              <button onClick={() => setShowSaveFormationModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Formation Name</label>
                <input autoFocus type="text" value={tempFormationName} onChange={(e) => { setTempFormationName(e.target.value); setFormationNameError(null); }} placeholder="e.g. Vert Stack Set" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                {formationNameError && (
                  <div className="mt-2 text-[10px] text-red-400 font-medium">{formationNameError}</div>
                )}
              </div>
            </div>
            <div className="p-6 bg-slate-800/30 flex gap-3">
              <button onClick={() => setShowSaveFormationModal(false)} className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={saveFormation} className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Save Play Modal */}
      {showSavePlayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <h2 className="text-lg font-bold flex items-center gap-2"><Save size={20} className="text-indigo-400" /> Name your play</h2>
              <button onClick={() => setShowSavePlayModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Play Name</label>
                <input
                  autoFocus
                  type="text"
                  value={tempSavePlayName}
                  onChange={(e) => setTempSavePlayName(e.target.value)}
                  placeholder="e.g. Vert Stack Deep Look"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>
            </div>
            <div className="p-6 bg-slate-800/30 flex gap-3">
              <button onClick={() => setShowSavePlayModal(false)} className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all">Cancel</button>
              <button
                onClick={() => {
                  const name = tempSavePlayName.trim();
                  if (!name) return;
                  setShowSavePlayModal(false);
                  savePlay(name);
                }}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all"
              >
                Save Play
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold flex items-center gap-2"><Library size={20} className="text-indigo-400" /> Library</h2>
                <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-lg p-1 text-[10px] font-bold">
                  <button onClick={() => setLibraryTab('plays')} className={`px-2 py-1 rounded ${libraryTab === 'plays' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Plays</button>
                  <button onClick={() => setLibraryTab('formations')} className={`px-2 py-1 rounded ${libraryTab === 'formations' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>Formations</button>
                </div>
              </div>
              <button onClick={() => setShowLibraryModal(false)} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 custom-scrollbar">
              {libraryTab === 'plays' && (
                savedPlays.length === 0 ? (
                  <div className="col-span-2 py-20 text-center text-slate-500 italic">No plays saved yet.</div>
                ) : (
                  savedPlays.map(p => (
                    <div key={p.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 group hover:border-indigo-500/50 transition-all shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <h3 className="font-bold text-slate-100">{p.name}</h3>
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{p.players.length} Players • {p.force} Force</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteSavedPlay(p.id); }} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                      </div>
                      <button onClick={() => loadPlay(p)} className="w-full py-2 bg-slate-700 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-all">Load Play</button>
                    </div>
                  ))
                )
              )}
              {libraryTab === 'formations' && (
                savedFormations.length === 0 ? (
                  <div className="col-span-2 py-20 text-center text-slate-500 italic">No formations saved yet.</div>
                ) : (
                  savedFormations.map(f => (
                    <div key={f.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-3 group hover:border-emerald-500/50 transition-all shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <h3 className="font-bold text-slate-100">{f.name}</h3>
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{f.players.filter(p => p.team === 'offense').length} O • {f.players.filter(p => p.team === 'defense').length} D</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteSavedFormation(f.id); }} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                      </div>
                      <button onClick={() => loadFormation(f)} className="w-full py-2 bg-slate-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all">Load Formation</button>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}

      
      <HeaderBar
        playName={playName}
        onPlayNameChange={setPlayName}
        onOpenLibrary={() => setShowLibraryModal(true)}
        onSaveFormation={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); }}
        canSaveFormation={hasUnsavedFormation}
        formationSaveReason={formationSaveReason}
        onSavePlay={savePlay}
        canSavePlay={players.some(p => p.team === 'offense')}
        playSaveReason={playSaveReason}
        saveStatus={saveStatus}
        animationState={animationState}
        animationTime={animationTime}
        onStartAnimation={startAnimation}
        onTogglePause={togglePause}
        onStopAnimation={stopAnimation}
        hasPlayers={players.length > 0}
      />


      <div className="flex flex-1 overflow-hidden relative">
        
        <WorkflowSidebar
          players={players}
          mode={mode}
          isAnimationActive={isAnimationActive}
          activeFormation={activeFormation}
          setActiveFormation={setActiveFormation}
          setMode={setMode}
          force={force}
          onForceChange={setForce}
          savedFormations={savedFormations}
          onLoadFormation={loadFormation}
          onApplyPresetFormation={applyFormationNearOwnEndzone}
          onCreateCustomFormation={() => { setActiveFormation('custom'); setMode(InteractionMode.ADD_OFFENSE); }}
          onOpenSaveFormationModal={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); }}
          hasUnsavedFormation={hasUnsavedFormation}
          onAutoAssignDefense={autoAssignDefense}
          maxPlayersPerTeam={MAX_PLAYERS_PER_TEAM}
        />

        <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center overflow-auto p-8 relative">
          <Field players={players} mode={mode} selectedPlayerId={selectedPlayerId} onFieldClick={handleFieldClick} onUpdatePlayer={updatePlayerPosition} onAddPathPoint={addPathPoint} onSelectPlayer={setSelectedPlayerId} animationTime={isAnimationActive ? animationTime : null} force={force} />
        </div>

        <Sidebar 
          players={players} 
          selectedPlayerId={selectedPlayerId} 
          onDeletePlayer={removePlayer} 
          onClearPath={clearPath} 
          onUndoPathPoint={undoLastPathPoint} 
          onAssignDisc={assignDisc} 
          onUpdateSpeed={updatePlayerSpeed} 
          onUpdateAcceleration={updatePlayerAcceleration} 
          onUpdateRole={updatePlayerRole}
          onUpdateCutterDefense={updateCutterDefense}
          isPlaying={isAnimationActive} 
          description={playDescription}
          onUpdateDescription={setPlayDescription}
        />
      </div>
    </div>
  );
};

export default App;
