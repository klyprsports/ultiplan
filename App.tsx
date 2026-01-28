
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { 
  Trash2, 
  Users, 
  PenTool, 
  MousePointer2, 
  Play as PlayIcon, 
  Square,
  ShieldAlert,
  Pause as PauseIcon,
  Plus,
  X,
  ChevronRight,
  Save,
  Library,
  CheckCircle2,
  Edit3,
  Loader2
} from 'lucide-react';
import Field from './components/Field';
import Sidebar from './components/Sidebar';
import { Player, InteractionMode, Play, Team, Point, Force, Formation } from './types';

const DEFAULT_SPEED = 8.5; 
const DEFAULT_ACCELERATION = 7.0; 
const STORAGE_KEY = 'ultiplan_saved_plays_v1';
const FORMATIONS_STORAGE_KEY = 'ultiplan_saved_formations_v1';
const MAX_PLAYERS_PER_TEAM = 7;
const FIELD_WIDTH = 40;
const FIELD_HEIGHT = 110;
const ENDZONE_DEPTH = 20;

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
  const playNameInputRef = useRef<HTMLInputElement>(null);

  const [showNewPlayModal, setShowNewPlayModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [tempPlayName, setTempPlayName] = useState('');
  const [showFormationMenu, setShowFormationMenu] = useState(false);
  const [activeFormation, setActiveFormation] = useState<'vertical' | 'side' | 'ho' | 'custom' | null>(null);
  const [showSaveFormationModal, setShowSaveFormationModal] = useState(false);
  const [tempFormationName, setTempFormationName] = useState('');
  const [formationNameError, setFormationNameError] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<'plays' | 'formations'>('plays');

  const isAnimationActive = animationState !== 'IDLE';

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setSavedPlays(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved plays", e);
      }
    }
    const savedFormationsRaw = localStorage.getItem(FORMATIONS_STORAGE_KEY);
    if (savedFormationsRaw) {
      try {
        setSavedFormations(JSON.parse(savedFormationsRaw));
      } catch (e) {
        console.error("Failed to load saved formations", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPlays));
  }, [savedPlays]);

  useEffect(() => {
    localStorage.setItem(FORMATIONS_STORAGE_KEY, JSON.stringify(savedFormations));
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

  const savePlay = () => {
    setSaveStatus('saving');
    const newPlay: Play = {
      id: editingPlayId || generateId(),
      name: playName,
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
    setShowFormationMenu(false);
  };

  const deleteSavedFormation = (id: string) => {
    setSavedFormations(prev => prev.filter(f => f.id !== id));
  };

  const getDumpOffsetX = (currentForce: Force) => {
    if (currentForce === 'home') return 8;
    if (currentForce === 'away') return -8;
    if (currentForce === 'middle') return 12;
    return 0;
  };

  const buildPresetFormation = (formation: 'vertical' | 'side' | 'ho', currentForce: Force, makeId?: (idx: number) => string): Player[] => {
    const endzoneLine = FIELD_HEIGHT - ENDZONE_DEPTH;
    const cuttersY = [endzoneLine - 8, endzoneLine - 13, endzoneLine - 18, endzoneLine - 23, endzoneLine - 28];
    const handlersY = [endzoneLine - 2, endzoneLine - 4, endzoneLine - 6];
    let positions: { x: number; y: number }[] = [];

    if (formation === 'vertical') {
      const stackX = FIELD_WIDTH / 2;
      const dumpOffsetX = getDumpOffsetX(currentForce);
      const centerHandler = { x: stackX, y: endzoneLine - 2 };
      const dumpHandler = { x: stackX + dumpOffsetX, y: endzoneLine + 3 };
      const cutterYs = [
        endzoneLine - 12,
        endzoneLine - 16,
        endzoneLine - 20,
        endzoneLine - 24,
        endzoneLine - 28
      ];
      positions = [
        ...cutterYs.map(y => ({ x: stackX, y })),
        centerHandler,
        dumpHandler
      ];
    } else if (formation === 'side') {
      const stackX = FIELD_WIDTH - 6;
      const handlerXs = [16, 22];
      positions = [
        ...cuttersY.map(y => ({ x: stackX, y })),
        ...handlerXs.map((x, i) => ({ x, y: handlersY[i] }))
      ];
    } else if (formation === 'ho') {
      const handlerXs = [FIELD_WIDTH / 2 - 12, FIELD_WIDTH / 2, FIELD_WIDTH / 2 + 12];
      const cutterXs = [6, 14, 26, 34];
      positions = [
        ...handlerXs.map(x => ({ x, y: endzoneLine - 2 })),
        ...cutterXs.map(x => ({ x, y: endzoneLine - 20 }))
      ];
    }

    return positions.slice(0, MAX_PLAYERS_PER_TEAM).map((pos, idx) => ({
      id: makeId ? makeId(idx) : generateId(),
      team: 'offense',
      x: pos.x,
      y: pos.y,
      label: `O${idx + 1}`,
      path: [],
      speed: DEFAULT_SPEED,
      acceleration: DEFAULT_ACCELERATION,
      hasDisc: (formation === 'ho' && pos.y === endzoneLine - 2 && pos.x === FIELD_WIDTH / 2) || (formation === 'vertical' && idx === 5),
      role: formation === 'ho'
        ? (idx <= 2 ? 'handler' : 'cutter')
        : formation === 'vertical'
          ? (idx <= 4 ? 'cutter' : 'handler')
          : (idx <= 4 ? 'cutter' : 'handler')
    }));
  };

  const normalizeFormationPlayers = (formationPlayers: Player[]) => {
    return formationPlayers
      .map(p => ({
        team: p.team,
        label: p.label,
        x: p.x,
        y: p.y,
        speed: p.speed,
        acceleration: p.acceleration,
        role: p.role ?? 'cutter',
        hasDisc: !!p.hasDisc
      }))
      .sort((a, b) => {
        if (a.team !== b.team) return a.team.localeCompare(b.team);
        return a.label.localeCompare(b.label);
      });
  };

  const normalizePlayPlayers = (playPlayers: Player[]) => {
    return playPlayers
      .map(p => ({
        team: p.team,
        label: p.label,
        x: p.x,
        y: p.y,
        speed: p.speed,
        acceleration: p.acceleration,
        role: p.role ?? 'cutter',
        hasDisc: !!p.hasDisc,
        cutterDefense: p.cutterDefense ?? null,
        path: p.path.map(pt => ({ x: pt.x, y: pt.y }))
      }))
      .sort((a, b) => {
        if (a.team !== b.team) return a.team.localeCompare(b.team);
        return a.label.localeCompare(b.label);
      });
  };

  const normalizePlay = (play: { name: string; force: Force; description: string; players: Player[] }) => ({
    name: play.name.trim(),
    force: play.force,
    description: play.description.trim(),
    players: normalizePlayPlayers(play.players)
  });

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
  const playSaveReason = !players.some(p => p.team === 'offense' && p.path.length > 0)
    ? 'Add at least one route for offense before saving.'
    : !hasUnsavedPlay
      ? 'No changes from an existing saved play.'
      : '';

  const applyFormationNearOwnEndzone = (formation: 'vertical' | 'side' | 'ho') => {
    if (isAnimationActive) return;
    const offensePlayers = buildPresetFormation(formation, force);

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

      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 shadow-lg z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-indigo-500/20 shadow-lg"><PlayIcon className="fill-white text-white" size={18} /></div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1 group">
              <input 
                ref={playNameInputRef}
                type="text" 
                value={playName} 
                onChange={(e) => setPlayName(e.target.value)} 
                className="bg-transparent border-none text-lg font-bold tracking-tight text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 rounded px-1 transition-all min-w-[150px] hover:bg-slate-800/50 cursor-text" 
                placeholder="Enter Play Name"
              />
              <button 
                onClick={() => playNameInputRef.current?.focus()}
                className="p-1.5 hover:bg-slate-800 rounded-md transition-all text-slate-600 group-hover:text-indigo-400"
              >
                <Edit3 size={14} />
              </button>
            </div>
            <span className="text-[9px] uppercase tracking-[0.2em] text-indigo-400 font-bold ml-1">Strategy Designer</span>
          </div>
          <div className="flex items-center gap-1.5 ml-3 border-l border-slate-800 pl-3">
            <button onClick={() => setShowLibraryModal(true)} className="flex items-center gap-2 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md border border-slate-700 transition-colors">
              <Library size={16} />
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-300">Library</span>
            </button>
            <button
              onClick={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); }}
              disabled={!hasUnsavedFormation}
              title={formationSaveReason || 'Save current formation'}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors text-[10px] font-bold tracking-widest uppercase ${hasUnsavedFormation ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500' : 'bg-slate-800 text-slate-500 border-slate-700'} disabled:opacity-50`}
            >
              <Save size={16} />
              Save Formation
            </button>
            <button onClick={savePlay} disabled={saveStatus === 'saving' || !hasUnsavedPlay || !players.some(p => p.team === 'offense' && p.path.length > 0)} title={playSaveReason || 'Save current play'} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors text-[10px] font-bold tracking-widest uppercase ${saveStatus === 'saved' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700'} disabled:opacity-50`}>
              {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : saveStatus === 'saved' ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {saveStatus === 'saved' ? 'Saved' : 'Save Play'}
            </button>
            <button onClick={() => setShowNewPlayModal(true)} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-md border border-slate-700 transition-colors group relative">
              <Plus size={16} />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-slate-700 pointer-events-none z-50">New Play</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Step 5</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Run Play</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-bold text-slate-500 uppercase leading-none mb-1 tracking-widest">Play Clock</span>
              <div className={`text-xl font-mono font-bold leading-none tabular-nums ${animationState === 'PLAYING' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {animationTime.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50 font-sans">s</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isAnimationActive ? (
                <button onClick={startAnimation} disabled={players.length === 0} className="px-4 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"><PlayIcon size={14} fill="white" /> Run</button>
              ) : (
                <>
                  <button onClick={togglePause} className="w-8 h-8 rounded-md bg-amber-600 hover:bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-900/20 transition-all">{animationState === 'PLAYING' ? <PauseIcon size={16} fill="white" /> : <PlayIcon size={16} fill="white" />}</button>
                  <button onClick={stopAnimation} className="w-8 h-8 rounded-md bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-900/20 transition-all"><Square size={16} fill="white" /></button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-5 gap-6 shrink-0 z-10 shadow-2xl overflow-y-auto custom-scrollbar">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 1 · Select Formation</h3>
              <span className="text-[9px] text-slate-600 font-mono">{players.filter(p => p.team === 'offense').length}/{MAX_PLAYERS_PER_TEAM} O</span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowFormationMenu(prev => !prev)}
                  disabled={isAnimationActive}
                  className="w-full flex items-center justify-between gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 px-3 py-2 rounded-md text-xs font-medium transition-all shadow-sm"
                >
                  <span className="flex items-center gap-2"><ChevronRight size={14} className={`transition-transform ${showFormationMenu ? 'rotate-90' : ''}`} /> Open formation menu</span>
                  <span className="text-[9px] text-slate-500">Open</span>
                </button>
                {showFormationMenu && (
                  <div className="absolute left-0 mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50">
                    <button
                      onClick={() => { applyFormationNearOwnEndzone('vertical'); setActiveFormation('vertical'); setShowFormationMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Vertical stack
                    </button>
                    <button
                      onClick={() => { applyFormationNearOwnEndzone('side'); setActiveFormation('side'); setShowFormationMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Side stack (break)
                    </button>
                    <button
                      onClick={() => { applyFormationNearOwnEndzone('ho'); setActiveFormation('ho'); setShowFormationMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      Ho stack
                    </button>
                    <div className="h-px bg-slate-800 my-1" />
                    <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-slate-500">Saved formations</div>
                    {savedFormations.length === 0 ? (
                      <div className="px-4 pb-2 text-[10px] text-slate-600 italic">No saved formations yet.</div>
                    ) : (
                      savedFormations.slice(0, 6).map(f => (
                        <button
                          key={f.id}
                          onClick={() => { loadFormation(f); setShowFormationMenu(false); }}
                          className="w-full text-left px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                        >
                          {f.name}
                        </button>
                      ))
                    )}
                    <button
                      onClick={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); setShowFormationMenu(false); }}
                      disabled={players.length === 0 || !hasUnsavedFormation}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
                    >
                      Save current formation...
                    </button>
                    <div className="h-px bg-slate-800 my-1" />
                    <button
                      onClick={() => { setActiveFormation('custom'); setMode(InteractionMode.ADD_OFFENSE); setShowFormationMenu(false); }}
                      className="w-full text-left px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-slate-800 rounded-lg"
                    >
                      Create new formation
                    </button>
                  </div>
                )}
              </div>

              {activeFormation === 'custom' && players.filter(p => p.team === 'offense').length < MAX_PLAYERS_PER_TEAM && (
                <button
                  onClick={() => setMode(InteractionMode.ADD_OFFENSE)}
                  disabled={isAnimationActive}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border ${mode === InteractionMode.ADD_OFFENSE ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Users size={14} className="text-blue-300" /> Add O
                </button>
              )}

            </div>
          </div>

          <div className="w-full h-px bg-slate-800" />

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 2 · Select Force</h3>
            </div>
            <div className="mt-3 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold shadow-inner">
              <div className="text-slate-500 uppercase tracking-widest mb-2">Force</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setForce('home')} className={`px-2 py-1 rounded transition-all ${force === 'home' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>HOME</button>
                <button onClick={() => setForce('away')} className={`px-2 py-1 rounded transition-all ${force === 'away' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>AWAY</button>
                <button onClick={() => setForce('middle')} className={`px-2 py-1 rounded transition-all ${force === 'middle' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>MIDDLE</button>
                <button onClick={() => setForce('sideline')} className={`px-2 py-1 rounded transition-all ${force === 'sideline' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>SIDE</button>
              </div>
            </div>
          </div>

          {activeFormation && (
            <>
              <div className="w-full h-px bg-slate-800" />

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 3 · Add Defenders</h3>
                  <span className="text-[9px] text-slate-600 font-mono">{players.filter(p => p.team === 'defense').length}/{MAX_PLAYERS_PER_TEAM} D</span>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  <button onClick={() => setMode(InteractionMode.ADD_DEFENSE)} disabled={isAnimationActive || players.filter(p => p.team === 'defense').length >= MAX_PLAYERS_PER_TEAM} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border ${mode === InteractionMode.ADD_DEFENSE ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <Users size={14} className="text-red-300" /> Add D
                  </button>
                  <button onClick={autoAssignDefense} disabled={isAnimationActive || players.filter(p => p.team === 'offense').length === 0} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 px-3 py-2 rounded-md text-xs font-bold transition-all shadow-sm">
                    <ShieldAlert size={14} className="text-red-400" /> Auto-Assign Defense
                  </button>
                </div>
              </div>

              <div className="w-full h-px bg-slate-800" />

              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 4 · Draw Routes</h3>
              </div>
              <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
                Once players are on the field, select any player and click on the field to define routes.
              </p>
              
            </>
          )}
        </div>

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

const ToolButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean; badge?: number }> = ({ active, onClick, icon, label, disabled, badge }) => (
  <button onClick={onClick} disabled={disabled} className={`group relative flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all ${disabled ? 'opacity-20' : active ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
    {icon}
    {badge !== undefined && <span className={`absolute -top-1 -right-1 text-[8px] font-bold px-1 rounded-full border border-slate-950 shadow-sm ${badge >= 7 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-300'}`}>{badge}</span>}
    {!disabled && <span className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[9px] font-bold uppercase tracking-wider rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none border border-slate-700 shadow-xl">{label}</span>}
  </button>
);

export default App;
