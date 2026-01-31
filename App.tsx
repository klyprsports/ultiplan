
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Plus, X, Save } from 'lucide-react';
import Field from './components/Field';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import WorkflowSidebar from './components/WorkflowSidebar';
import AccountModal from './components/AccountModal';
import ShareModal from './components/ShareModal';
import { Player, InteractionMode, Play, Team, Point, Force, Formation } from './types';
import { loadPlaysFromStorage, savePlaysToStorage, loadFormationsFromStorage, saveFormationsToStorage, normalizeFormationPlayers, normalizePlay, loadPendingSelection, clearPendingSelection, setPendingManageTeams, clearPlaybookStorage, hasSeenOnboarding, setSeenOnboarding, consumePendingTour } from './services/storage';
import { signInWithGoogle, getCurrentUser, subscribeToAuth, deleteCurrentUser } from './services/auth';
import { isFirestoreEnabled, ensureUserDocument, fetchFormationsForUser, fetchPlaysForUser, fetchTeamsForUser, savePlayToFirestore, saveFormationToFirestore, deleteAccountData } from './services/firestore';
import { DEFAULT_SPEED, DEFAULT_ACCELERATION, MAX_PLAYERS_PER_TEAM, FIELD_WIDTH, buildPresetFormation, getDumpOffsetX } from './services/formations';
import OnboardingIntroModal from './components/OnboardingIntroModal';
import OnboardingTour, { OnboardingStep } from './components/OnboardingTour';

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
  const [draggingToken, setDraggingToken] = useState<{ team: 'offense' | 'defense'; labelNum: number } | null>(null);
  
  const [animationState, setAnimationState] = useState<AnimationState>('IDLE');
  const [animationTime, setAnimationTime] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const [showNewPlayModal, setShowNewPlayModal] = useState(false);
  const [showSavePlayModal, setShowSavePlayModal] = useState(false);
  const [tempPlayName, setTempPlayName] = useState('');
  const [tempSavePlayName, setTempSavePlayName] = useState('');
  const [activeFormation, setActiveFormation] = useState<'vertical' | 'side' | 'ho' | 'custom' | null>(null);
  const [showSaveFormationModal, setShowSaveFormationModal] = useState(false);
  const [tempFormationName, setTempFormationName] = useState('');
  const [formationNameError, setFormationNameError] = useState<string | null>(null);
  const [playbookLoaded, setPlaybookLoaded] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<null | { type: 'play'; name?: string } | { type: 'formation' }>(null);
  const [authUser, setAuthUser] = useState<ReturnType<typeof getCurrentUser>>(getCurrentUser());
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [showOnboardingIntro, setShowOnboardingIntro] = useState(false);
  const [isTourActive, setIsTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [selectionStepTriggered, setSelectionStepTriggered] = useState(false);
  const [playOwnerId, setPlayOwnerId] = useState<string | null>(null);
  const [playCreatedBy, setPlayCreatedBy] = useState<string | null>(null);
  const [playSourceId, setPlaySourceId] = useState<string | null>(null);
  const [formationOwnerId, setFormationOwnerId] = useState<string | null>(null);
  const [formationCreatedBy, setFormationCreatedBy] = useState<string | null>(null);
  const [formationSourceId, setFormationSourceId] = useState<string | null>(null);

  const isAnimationActive = animationState !== 'IDLE';

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
  }, [authUser?.uid]);

  useEffect(() => {
    savePlaysToStorage(savedPlays);
  }, [savedPlays]);

  useEffect(() => {
    saveFormationsToStorage(savedFormations);
  }, [savedFormations]);

  useEffect(() => {
    let cancelled = false;
    const loadRemote = async () => {
      if (!isFirestoreEnabled()) {
        setPlaybookLoaded(true);
        return;
      }
      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.isAnonymous) {
        setPlaybookLoaded(true);
        return;
      }
      try {
        const remoteTeams = await fetchTeamsForUser();
        if (cancelled) return;
        const teamIds = remoteTeams.map((team) => team.id);
        const [remotePlays, remoteFormations] = await Promise.all([
          fetchPlaysForUser(teamIds),
          fetchFormationsForUser(teamIds)
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
      } finally {
        if (!cancelled) setPlaybookLoaded(true);
      }
    };
    loadRemote();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuth(setAuthUser);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser || authUser.isAnonymous) return;
    const uid = authUser.uid;
    const pendingTour = consumePendingTour();
    if (pendingTour) {
      setShowOnboardingIntro(false);
      setIsTourActive(true);
      setTourStep(0);
      setSeenOnboarding(uid);
      return;
    }
    if (!hasSeenOnboarding(uid)) {
      setShowOnboardingIntro(true);
    }
  }, [authUser?.uid]);

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

  const tourSteps: OnboardingStep[] = useMemo(() => ([
    {
      id: 'play-name',
      title: 'Name your play',
      body: 'Give your play a name so you can save and find it later.',
      target: '[data-tour-id="workflow-play"]'
    },
    {
      id: 'add-players',
      title: 'Add offense',
      body: 'Drag an offensive player token to the field or pick a formation.',
      target: '[data-tour-id="workflow-offense"]'
    },
    {
      id: 'select-force',
      title: 'Select a force',
      body: 'Choose the force direction. Auto-defense placement uses this setting.',
      target: '[data-tour-id="workflow-force"]'
    },
    {
      id: 'add-defense',
      title: 'Add defense',
      body: 'Drag defensive players in or auto-assign matchups.',
      target: '[data-tour-id="workflow-defense"]'
    },
    {
      id: 'field',
      title: 'Place players on the field',
      body: 'Drag players to position them on the field.',
      target: '[data-tour-id="field"]'
    },
    {
      id: 'selection-details',
      title: 'Selection details',
      body: 'Select a player to edit role, speed, and routes.',
      target: '[data-tour-id="selection-details"]'
    },
    {
      id: 'draw-routes',
      title: 'Draw routes',
      body: 'Select an offensive player and click the field to add route points.',
      target: '[data-tour-id="workflow-draw"]'
    },
    {
      id: 'tactical-notes',
      title: 'Tactical notes',
      body: 'Add notes so teammates understand timing and intent.',
      target: '[data-tour-id="tactical-notes"]'
    },
    {
      id: 'run-play',
      title: 'Run the play',
      body: 'Animate your play to see the timing and spacing.',
      target: '[data-tour-id="run-button"]'
    },
    {
      id: 'save-formation',
      title: 'Save the formation',
      body: 'Save a reusable formation before you finish the full play.',
      target: '[data-tour-id="workflow-save-formation"]'
    },
    {
      id: 'save',
      title: 'Save your play',
      body: 'Save when you are ready, then reuse it from your playbook.',
      target: '[data-tour-id="workflow-save"]'
    }
  ]), []);

  const startTour = () => {
    if (authUser?.uid) setSeenOnboarding(authUser.uid);
    setShowOnboardingIntro(false);
    setIsTourActive(true);
    setTourStep(0);
    setSelectionStepTriggered(false);
  };

  const closeIntro = () => {
    if (authUser?.uid) setSeenOnboarding(authUser.uid);
    setShowOnboardingIntro(false);
  };

  const closeTour = () => {
    if (authUser?.uid) setSeenOnboarding(authUser.uid);
    setIsTourActive(false);
    setSelectionStepTriggered(false);
  };

  useEffect(() => {
    if (!isTourActive || selectionStepTriggered) return;
    if (players.length === 1) {
      const stepIndex = tourSteps.findIndex((step) => step.id === 'selection-details');
      if (stepIndex >= 0) {
        setTourStep(stepIndex);
        setSelectionStepTriggered(true);
      }
    }
  }, [isTourActive, selectionStepTriggered, players.length, tourSteps]);

  useEffect(() => {
    if (!authUser?.uid) return;
    if (!isFirestoreEnabled()) return;
    let cancelled = false;
    const ensureUser = async () => {
      try {
        await ensureUserDocument();
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to ensure user document', error);
        }
      }
    };
    ensureUser();
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);

  useEffect(() => {
    const pending = loadPendingSelection();
    if (!pending) return;
    if (pending.type === 'new-play') {
      setTempPlayName('');
      setShowNewPlayModal(true);
      clearPendingSelection();
      return;
    }
    if (pending.type === 'play') {
      const play = savedPlays.find(p => p.id === pending.id);
      if (play) {
        loadPlay(play);
        clearPendingSelection();
        return;
      }
    }
    if (pending.type === 'formation') {
      const formation = savedFormations.find(f => f.id === pending.id);
      if (formation) {
        loadFormation(formation);
        clearPendingSelection();
        return;
      }
    }
    if (playbookLoaded) {
      clearPendingSelection();
    }
  }, [savedPlays, savedFormations, playbookLoaded]);

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

  const addOffensePlayerWithLabel = (labelNum: number, x: number, y: number) => {
    let added = false;
    const id = generateId();
    const newPlayer: Player = {
      id,
      team: 'offense',
      x,
      y,
      label: `O${labelNum}`,
      path: [],
      speed: DEFAULT_SPEED,
      acceleration: DEFAULT_ACCELERATION,
      hasDisc: false,
      role: 'cutter'
    };
    setPlayers(prev => {
      const offense = prev.filter(p => p.team === 'offense');
      if (offense.length >= MAX_PLAYERS_PER_TEAM) return prev;
      if (prev.some(p => p.team === 'offense' && p.label === `O${labelNum}`)) return prev;
      added = true;
      return [...prev, newPlayer];
    });
    if (added) {
      setSelectedPlayerId(id);
    }
    return added;
  };

  const addDefensePlayerWithLabel = (labelNum: number, x: number, y: number) => {
    let added = false;
    const id = generateId();
    const newPlayer: Player = {
      id,
      team: 'defense',
      x,
      y,
      label: `D${labelNum}`,
      path: [],
      speed: DEFAULT_SPEED,
      acceleration: DEFAULT_ACCELERATION,
      hasDisc: false
    };
    setPlayers(prev => {
      const defense = prev.filter(p => p.team === 'defense');
      if (defense.length >= MAX_PLAYERS_PER_TEAM) return prev;
      if (prev.some(p => p.team === 'defense' && p.label === `D${labelNum}`)) return prev;
      added = true;
      return [...prev, newPlayer];
    });
    if (added) {
      setSelectedPlayerId(id);
    }
    return added;
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
    const selected = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;
    if (
      selected?.team === 'offense' &&
      (mode === InteractionMode.DRAW || mode === InteractionMode.SELECT || mode === InteractionMode.ADD_OFFENSE)
    ) {
      addPathPoint(selectedPlayerId, { x, y });
      return;
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
    const currentUser = getCurrentUser();
    if (isFirestoreEnabled() && (!currentUser || currentUser.isAnonymous)) {
      setPendingSaveAction({ type: 'play', name: finalName });
      setShowAuthPrompt(true);
      return;
    }
    const existing = savedPlays.find((p) => p.id === editingPlayId);
    const visibility = existing?.visibility || 'private';
    const sharedTeamIds = existing?.sharedTeamIds || [];
    setSaveStatus('saving');
    const newPlay: Play = {
      id: editingPlayId || generateId(),
      ownerId: playOwnerId || currentUser?.uid,
      name: finalName,
      players,
      force,
      description: playDescription,
      visibility,
      sharedTeamIds: visibility === 'team' ? sharedTeamIds : [],
      createdBy: playCreatedBy || currentUser?.uid,
      lastEditedBy: currentUser?.uid,
      sourcePlayId: playSourceId || undefined
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
    setPlayOwnerId(newPlay.ownerId || null);
    setPlayCreatedBy(newPlay.createdBy || null);
    setPlaySourceId(newPlay.sourcePlayId || null);
    if (isFirestoreEnabled()) {
      savePlayToFirestore(newPlay).catch((error) => console.error('Failed to save play to Firestore', error));
    }
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 600);
  };

  const loadPlay = (play: Play) => {
    stopAnimation();
    setPlayers(play.players);
    setPlayName(play.name);
    setForce(play.force);
    setPlayDescription(play.description || '');
    setEditingPlayId(play.id);
    setPlayOwnerId(play.ownerId || getCurrentUser()?.uid || null);
    setPlayCreatedBy(play.createdBy || null);
    setPlaySourceId(play.sourcePlayId || null);
    setSelectedPlayerId(null);
    setMode(InteractionMode.SELECT);
  };

  const saveFormation = () => {
    const name = (tempFormationName || 'New Formation').trim();
    const exists = savedFormations.some(f => f.name.trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      setFormationNameError('A formation with this name already exists.');
      return;
    }
    const currentUser = getCurrentUser();
    if (isFirestoreEnabled() && (!currentUser || currentUser.isAnonymous)) {
      setPendingSaveAction({ type: 'formation' });
      setShowSaveFormationModal(false);
      setShowAuthPrompt(true);
      return;
    }
    const visibility: Formation['visibility'] = 'private';
    const sharedTeamIds: string[] = [];
    const newFormation: Formation = {
      id: generateId(),
      ownerId: formationOwnerId || currentUser?.uid,
      name,
      players: buildFormationPlayers(),
      visibility,
      sharedTeamIds: visibility === 'team' ? sharedTeamIds : [],
      createdBy: formationCreatedBy || currentUser?.uid,
      lastEditedBy: currentUser?.uid,
      sourceFormationId: formationSourceId || undefined
    };
    setSavedFormations(prev => [newFormation, ...prev]);
    setFormationOwnerId(newFormation.ownerId || null);
    setFormationCreatedBy(newFormation.createdBy || null);
    setFormationSourceId(newFormation.sourceFormationId || null);
    if (isFirestoreEnabled()) {
      saveFormationToFirestore(newFormation).catch((error) => console.error('Failed to save formation to Firestore', error));
    }
    setTempFormationName('');
    setFormationNameError(null);
    setShowSaveFormationModal(false);
  };

  const loadFormation = (formation: Formation) => {
    stopAnimation();
    setPlayers(formation.players);
    setActiveFormation('custom');
    setFormationOwnerId(formation.ownerId || getCurrentUser()?.uid || null);
    setFormationCreatedBy(formation.createdBy || null);
    setFormationSourceId(formation.sourceFormationId || null);
    setSelectedPlayerId(null);
    setMode(InteractionMode.SELECT);
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
              <button onClick={() => {
                const currentUser = getCurrentUser();
                setPlayers([]);
                setPlayName(tempPlayName || 'New Play');
                setEditingPlayId(null);
                setPlayDescription('');
                setPlayOwnerId(currentUser?.uid || null);
                setPlayCreatedBy(currentUser?.uid || null);
                setPlaySourceId(null);
                setShowNewPlayModal(false);
                stopAnimation();
              }} className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all">Create</button>
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

      {showAuthPrompt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <h2 className="text-base font-bold">Sign in to save</h2>
              <button onClick={() => { setShowAuthPrompt(false); setPendingSaveAction(null); }} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-300">
                Sign in with Google to save plays and formations to your playbook.
              </p>
              <button
                onClick={() => {
                  signInWithGoogle()
                    .then(() => {
                      setShowAuthPrompt(false);
                      const pending = pendingSaveAction;
                      setPendingSaveAction(null);
                      if (pending?.type === 'play') {
                        savePlay(pending.name);
                      } else if (pending?.type === 'formation') {
                        saveFormation();
                      }
                    })
                    .catch((error) => console.error('Failed to sign in', error));
                }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-100 text-slate-900 hover:bg-white shadow-lg"
              >
                Sign in with Google
              </button>
              <button
                onClick={() => { setShowAuthPrompt(false); setPendingSaveAction(null); }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      <AccountModal
        isOpen={showAccountModal}
        onClose={() => { if (!isDeletingAccount) setShowAccountModal(false); }}
        onConfirmDelete={handleDeleteAccount}
        isDeleting={isDeletingAccount}
        error={deleteAccountError}
        userEmail={authUser?.email || null}
      />

      <ShareModal
        isOpen={showShareModal}
        shareUrl={shareUrl}
        onClose={() => setShowShareModal(false)}
        onCopy={copyShareLink}
        copyStatus={shareStatus}
      />

      <OnboardingIntroModal
        isOpen={showOnboardingIntro}
        onStart={startTour}
        onClose={closeIntro}
      />

      {isTourActive && (
        <OnboardingTour
          steps={tourSteps}
          stepIndex={tourStep}
          onPrev={() => setTourStep((prev) => Math.max(0, prev - 1))}
          onNext={() => {
            if (tourStep >= tourSteps.length - 1) {
              closeTour();
            } else {
              setTourStep((prev) => Math.min(tourSteps.length - 1, prev + 1));
            }
          }}
          onClose={closeTour}
        />
      )}

      <HeaderBar
        onOpenPlaybook={() => {
          window.history.pushState({}, '', '/playbook');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        onOpenBuilder={() => {
          window.history.pushState({}, '', '/builder');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }}
        onManageTeams={() => {
          setPendingManageTeams();
          window.history.pushState({}, '', '/playbook');
          window.dispatchEvent(new PopStateEvent('popstate'));
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
        currentRoute="builder"
        sublabel="Builder"
        user={authUser}
      />


      <div className="flex flex-1 overflow-hidden relative">
        
        <WorkflowSidebar
          players={players}
          mode={mode}
          isAnimationActive={isAnimationActive}
          activeFormation={activeFormation}
          setActiveFormation={setActiveFormation}
          setMode={setMode}
          playName={playName}
          onPlayNameChange={setPlayName}
          force={force}
          onForceChange={setForce}
          savedFormations={savedFormations}
          onLoadFormation={loadFormation}
          onApplyPresetFormation={applyFormationNearOwnEndzone}
          onCreateCustomFormation={() => { setActiveFormation('custom'); setMode(InteractionMode.ADD_OFFENSE); }}
          onOpenSaveFormationModal={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); }}
          hasUnsavedFormation={hasUnsavedFormation}
          onSaveFormation={() => { setTempFormationName(''); setFormationNameError(null); setShowSaveFormationModal(true); }}
          canSaveFormation={hasUnsavedFormation}
          formationSaveReason={formationSaveReason}
          onAutoAssignDefense={autoAssignDefense}
          onSavePlay={savePlay}
          canSavePlay={players.some(p => p.team === 'offense')}
          playSaveReason={playSaveReason}
          saveStatus={saveStatus}
          maxPlayersPerTeam={MAX_PLAYERS_PER_TEAM}
          usedOffenseLabels={players.filter(p => p.team === 'offense').map(p => parseInt(p.label.replace('O', ''), 10)).filter(n => !Number.isNaN(n))}
          usedDefenseLabels={players.filter(p => p.team === 'defense').map(p => parseInt(p.label.replace('D', ''), 10)).filter(n => !Number.isNaN(n))}
          draggingToken={draggingToken}
          onTokenDragStart={(team, labelNum) => setDraggingToken({ team, labelNum })}
          onTokenDragEnd={() => setDraggingToken(null)}
        />

        <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center overflow-auto p-8 relative">
          <div data-tour-id="field">
            <Field
              players={players}
              mode={mode}
              selectedPlayerId={selectedPlayerId}
              onFieldClick={handleFieldClick}
              onUpdatePlayer={updatePlayerPosition}
              onAddPathPoint={addPathPoint}
              onSelectPlayer={setSelectedPlayerId}
              animationTime={isAnimationActive ? animationTime : null}
              force={force}
              onDropOffense={addOffensePlayerWithLabel}
              onDropDefense={addDefensePlayerWithLabel}
              onDropResult={(success) => {
                if (success) setDraggingToken(null);
              }}
              draggingToken={draggingToken}
              onDebugEvent={() => {}}
            />
          </div>
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
          animationState={animationState}
          animationTime={animationTime}
          onStartAnimation={startAnimation}
          onTogglePause={togglePause}
          onStopAnimation={stopAnimation}
          hasPlayers={players.length > 0}
          description={playDescription}
          onUpdateDescription={setPlayDescription}
        />
      </div>
    </div>
  );
};

export default App;
