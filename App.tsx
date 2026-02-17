
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Plus, X, Save } from 'lucide-react';
import Field from './components/Field';
import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import WorkflowSidebar from './components/WorkflowSidebar';
import AccountModal from './components/AccountModal';
import AuthModal from './components/AuthModal';
import ShareModal from './components/ShareModal';
import { Player, InteractionMode, Play, Team, Point, Force } from './types';
import { loadPlaysFromStorage, savePlaysToStorage, normalizePlay, loadPendingSelection, clearPendingSelection, setPendingManageTeams, clearPlaybookStorage, hasSeenOnboarding, setSeenOnboarding, consumePendingTour, consumePendingConceptDraft } from './services/storage';
import { signInWithGoogle, getCurrentUser, subscribeToAuth, deleteCurrentUser } from './services/auth';
import { isFirestoreEnabled, ensureUserDocument, fetchPlaysForUser, fetchTeamsForUser, savePlayToFirestore, deleteAccountData } from './services/firestore';
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
  const [editingPlayId, setEditingPlayId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [draggingToken, setDraggingToken] = useState<{ team: 'offense' | 'defense'; labelNum: number } | null>(null);
  const [throws, setThrows] = useState<Play['throws']>([]);
  const [showThrowControls, setShowThrowControls] = useState(false);
  const [throwDraft, setThrowDraft] = useState<{
    throwerId: string;
    receiverId: string | null;
    releaseTime: number;
    angle: number;
    power: 'soft' | 'medium' | 'hard';
  } | null>(null);
  const [isSelectingReceiver, setIsSelectingReceiver] = useState(false);
  const [editingThrowId, setEditingThrowId] = useState<string | null>(null);
  
  const [animationState, setAnimationState] = useState<AnimationState>('IDLE');
  const [animationTime, setAnimationTime] = useState(0);
  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const [showNewPlayModal, setShowNewPlayModal] = useState(false);
  const [showSavePlayModal, setShowSavePlayModal] = useState(false);
  const [tempPlayName, setTempPlayName] = useState('');
  const [tempSavePlayName, setTempSavePlayName] = useState('');
  const [activeFormation, setActiveFormation] = useState<'vertical' | 'side' | 'ho' | 'custom' | null>(null);
  const [playbookLoaded, setPlaybookLoaded] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<null | { type: 'play'; name?: string }>(null);
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
  const [playConceptId, setPlayConceptId] = useState<string | null>(null);
  const [playConceptName, setPlayConceptName] = useState('');
  const [newPlayConceptName, setNewPlayConceptName] = useState<string | null>(null);
  const [startFromPlayId, setStartFromPlayId] = useState<string | null>(null);
  const [startLocked, setStartLocked] = useState(false);

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
  }, [authUser?.uid]);

  useEffect(() => {
    savePlaysToStorage(savedPlays);
  }, [savedPlays]);

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
        const remotePlays = await fetchPlaysForUser(teamIds);
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
      body: 'Drag an offensive player token to the field or pick a starting setup.',
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
      id: 'add-throws',
      title: 'Add throws',
      body: 'Give a handler the disc, then set a receiver, release time, angle, and power.',
      target: '[data-tour-id="throw-controls"]'
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
      const conceptName = consumePendingConceptDraft();
      const trimmedConcept = conceptName?.trim() || '';
      setTempPlayName(trimmedConcept);
      setNewPlayConceptName(trimmedConcept || null);
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
    if (playbookLoaded) {
      clearPendingSelection();
    }
  }, [savedPlays, playbookLoaded]);

  const computeBasePlayDuration = useCallback((playPlayers: Player[]) => {
    let maxDur = 0;
    playPlayers.forEach(player => {
      if (player.path.length === 0) return;
      const points = [{ x: player.x, y: player.y }, ...player.path];
      let totalTime = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const L = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        totalTime += L / (player.speed * 0.9);
      }
      if (player.team === 'offense') {
        totalTime += Math.max(0, player.pathStartOffset ?? 0);
      }
      if (totalTime > maxDur) maxDur = totalTime;
    });
    return maxDur + 1.5;
  }, []);

  const basePlayDuration = useMemo(() => {
    return computeBasePlayDuration(players);
  }, [players, computeBasePlayDuration]);

  const getThrowSpeed = useCallback((power: 'soft' | 'medium' | 'hard') => {
    if (power === 'soft') return 8;
    if (power === 'hard') return 16;
    return 12;
  }, []);

  const calculatePositionAtTime = useCallback((player: Player, time: number): Point => {
    const startOffset = player.team === 'offense' ? Math.max(0, player.pathStartOffset ?? 0) : 0;
    const adjustedTime = time - startOffset;
    if (player.path.length === 0 || adjustedTime <= 0) return { x: player.x, y: player.y };
    const acc = player.acceleration;
    const topSpeed = player.speed;
    const dec = acc * 2.0;
    const points = [{ x: player.x, y: player.y }, ...player.path];
    const vertexSpeeds = [0];
    for (let i = 1; i < points.length - 1; i++) {
      const pPrev = points[i-1], pCurr = points[i], pNext = points[i+1];
      const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
      const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
      const mag1 = Math.sqrt(v1.x**2 + v1.y**2), mag2 = Math.sqrt(v2.x**2 + v2.y**2);
      if (mag1 === 0 || mag2 === 0) { vertexSpeeds.push(0); continue; }
      const cosTheta = (v1.x * v2.x + v1.y * v2.y) / (mag1 * mag2);
      const speedFactor = Math.max(0, (1 + cosTheta) / 2);
      vertexSpeeds.push(topSpeed * speedFactor);
    }
    vertexSpeeds.push(0);
    let tRem = adjustedTime;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i], p2 = points[i+1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const L = Math.sqrt(dx**2 + dy**2);
      if (L === 0) continue;
      const v0 = vertexSpeeds[i], v1 = vertexSpeeds[i+1];
      const d_acc_to_top = (topSpeed**2 - v0**2) / (2 * acc);
      const d_dec_to_v1 = (topSpeed**2 - v1**2) / (2 * dec);
      let tSegTotal, distAtTRem;
      if (d_acc_to_top + d_dec_to_v1 <= L) {
        const tAcc = (topSpeed - v0) / acc;
        const tDec = (topSpeed - v1) / dec;
        const dCruise = L - d_acc_to_top - d_dec_to_v1;
        const tCruise = dCruise / topSpeed;
        tSegTotal = tAcc + tCruise + tDec;
        if (tRem <= tSegTotal) {
          if (tRem <= tAcc) distAtTRem = v0 * tRem + 0.5 * acc * tRem**2;
          else if (tRem <= tAcc + tCruise) distAtTRem = d_acc_to_top + topSpeed * (tRem - tAcc);
          else {
            const tr = tRem - tAcc - tCruise;
            distAtTRem = (d_acc_to_top + dCruise) + (topSpeed * tr - 0.5 * dec * tr**2);
          }
          const ratio = distAtTRem / L;
          return { x: p1.x + dx * ratio, y: p1.y + dy * ratio };
        }
      } else {
        const vPeakSq = (2*L + v0**2/acc + v1**2/dec) / (1/acc + 1/dec);
        const vPeak = Math.sqrt(vPeakSq);
        const tAcc = (vPeak - v0) / acc;
        const tDec = (vPeak - v1) / dec;
        tSegTotal = tAcc + tDec;
        if (tRem <= tSegTotal) {
          if (tRem <= tAcc) distAtTRem = v0 * tRem + 0.5 * acc * tRem**2;
          else {
            const tr = tRem - tAcc;
            distAtTRem = (v0 * tAcc + 0.5 * acc * tAcc**2) + (vPeak * tr - 0.5 * dec * tr**2);
          }
          const ratio = distAtTRem / L;
          return { x: p1.x + dx * ratio, y: p1.y + dy * ratio };
        }
      }
      tRem -= tSegTotal;
    }
    return points[points.length - 1];
  }, []);

  const REACTION_DELAY = 0.1;

  const computeThrowPlansForPlay = useCallback((playPlayers: Player[], playThrows: Play['throws'] = []) => {
    const discOffset = { x: 1.2, y: -1.2 };
    const plans = (playThrows || []).map((t) => {
      const thrower = playPlayers.find((p) => p.id === t.throwerId);
      const receiver = playPlayers.find((p) => p.id === t.receiverId);
      if (!thrower || !receiver) return null;
      const throwerAtRelease = calculatePositionAtTime(thrower, t.releaseTime);
      const start = { x: throwerAtRelease.x + discOffset.x, y: throwerAtRelease.y + discOffset.y };
      const receiverAtRelease = calculatePositionAtTime(receiver, t.releaseTime);
      const speed = getThrowSpeed(t.power);
      const dx = receiverAtRelease.x - start.x;
      const dy = receiverAtRelease.y - start.y;
      const dist = Math.hypot(dx, dy);
      const minTravel = 0.5;
      const dirX = dist > 0 ? dx / dist : 0;
      const dirY = dist > 0 ? dy / dist : 1;
      const travelDist = Math.max(minTravel, dist);
      const duration = Math.max(0.2, travelDist / speed);
      const end = dist < minTravel
        ? { x: start.x + dirX * minTravel, y: start.y + dirY * minTravel }
        : calculatePositionAtTime(receiver, t.releaseTime + duration);
      return {
        ...t,
        start,
        end,
        duration,
        endTime: t.releaseTime + duration
      };
    }).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
    return plans.sort((a, b) => a.releaseTime - b.releaseTime);
  }, [calculatePositionAtTime, getThrowSpeed]);

  const computeMaxPlayDurationForPlay = useCallback((playPlayers: Player[], playThrows: Play['throws'] = []) => {
    const maxThrowEnd = computeThrowPlansForPlay(playPlayers, playThrows).reduce((acc, plan) => Math.max(acc, plan.endTime), 0);
    return Math.max(computeBasePlayDuration(playPlayers), maxThrowEnd);
  }, [computeBasePlayDuration, computeThrowPlansForPlay]);

  const getDiscHolderForPlay = useCallback((playPlayers: Player[], playThrows: Play['throws'] = [], time: number) => {
    const offense = playPlayers.filter((p) => p.team === 'offense');
    const initialHolderId = offense.find((p) => p.hasDisc)?.id ?? offense[0]?.id ?? null;
    if (!playThrows || playThrows.length === 0) return initialHolderId;
    const throwPlansForPlay = computeThrowPlansForPlay(playPlayers, playThrows);
    let holderId = initialHolderId;
    for (const plan of throwPlansForPlay) {
      if (time >= plan.endTime) {
        holderId = plan.receiverId;
      }
    }
    return holderId;
  }, [computeThrowPlansForPlay]);

  const getSequenceAnchorPositionsByLabel = useCallback((playPlayers: Player[], playThrows: Play['throws'] = []) => {
    const throwPlansForPlay = computeThrowPlansForPlay(playPlayers, playThrows);
    const maxThrowEnd = throwPlansForPlay.reduce((acc, plan) => Math.max(acc, plan.endTime), 0);
    const anchorTime = maxThrowEnd > 0 ? maxThrowEnd : computeMaxPlayDurationForPlay(playPlayers, playThrows);
    const holderId = getDiscHolderForPlay(playPlayers, playThrows, anchorTime);
    const defense = playPlayers.filter((p) => p.team === 'defense');
    const offense = playPlayers.filter((p) => p.team === 'offense');
    const defensiveAssignments = new Map<string, string>();
    defense.forEach((defender) => {
      let closestId = '';
      let minDist = Infinity;
      offense.forEach((offensePlayer) => {
        const dx = defender.x - offensePlayer.x;
        const dy = defender.y - offensePlayer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          closestId = offensePlayer.id;
        }
      });
      if (closestId) defensiveAssignments.set(defender.id, closestId);
    });
    const endPositions = new Map<string, { x: number; y: number; hasDisc: boolean }>();
    playPlayers.forEach((player) => {
      let pos = calculatePositionAtTime(player, anchorTime);
      if (player.team === 'defense') {
        const targetId = defensiveAssignments.get(player.id);
        const targetOffense = playPlayers.find((p) => p.id === targetId);
        if (targetOffense) {
          const delayedTime = Math.max(0, anchorTime - REACTION_DELAY);
          const targetPosAtDelayedTime = calculatePositionAtTime(targetOffense, delayedTime);
          pos = {
            x: player.x + (targetPosAtDelayedTime.x - targetOffense.x),
            y: player.y + (targetPosAtDelayedTime.y - targetOffense.y)
          };
        }
      }
      const key = `${player.team}:${player.label}`;
      endPositions.set(key, { x: pos.x, y: pos.y, hasDisc: player.id === holderId });
    });
    return endPositions;
  }, [calculatePositionAtTime, computeThrowPlansForPlay, computeMaxPlayDurationForPlay, getDiscHolderForPlay]);

  const alignPlayersToEndState = useCallback((currentPlayers: Player[], endPositions: Map<string, { x: number; y: number; hasDisc: boolean }>) => {
    let changed = false;
    const aligned = currentPlayers.map((player) => {
      const shouldClearDefenderAssignment = player.team === 'defense' && (player.autoAssigned || player.coversOffenseId);
      const basePlayer = shouldClearDefenderAssignment
        ? { ...player, autoAssigned: false, coversOffenseId: undefined }
        : player;
      if (shouldClearDefenderAssignment) {
        changed = true;
      }
      const key = `${player.team}:${player.label}`;
      const target = endPositions.get(key);
      if (!target) return basePlayer;
      const dx = target.x - basePlayer.x;
      const dy = target.y - basePlayer.y;
      const nextPath = (dx === 0 && dy === 0)
        ? basePlayer.path
        : basePlayer.path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
      if (dx !== 0 || dy !== 0 || basePlayer.hasDisc !== target.hasDisc) {
        changed = true;
        return { ...basePlayer, x: target.x, y: target.y, path: nextPath, hasDisc: target.hasDisc };
      }
      return basePlayer;
    });
    return { players: aligned, changed };
  }, []);
  const throwPlans = useMemo(() => {
    return computeThrowPlansForPlay(players, throws || []);
  }, [throws, players, computeThrowPlansForPlay]);

  const getDiscPosition = useCallback((plan: {
    start: Point;
    end: Point;
    releaseTime: number;
    duration: number;
    angle: number;
  }, time: number) => {
    const t = Math.min(1, Math.max(0, (time - plan.releaseTime) / plan.duration));
    const dx = plan.end.x - plan.start.x;
    const dy = plan.end.y - plan.start.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const px = -uy;
    const py = ux;
    const curve = plan.angle * dist * 0.15 * Math.sin(Math.PI * t);
    return {
      x: plan.start.x + dx * t + px * curve,
      y: plan.start.y + dy * t + py * curve
    };
  }, []);

  const throwOutcomes = useMemo(() => {
    return throwPlans.map((plan) => ({
      id: plan.id,
      catchTime: plan.endTime,
      catchPlayerId: plan.receiverId
    }));
  }, [throwPlans]);

  const maxPlayDuration = useMemo(() => {
    const maxThrowEnd = throwPlans.reduce((acc, plan) => Math.max(acc, plan.endTime), 0);
    return Math.max(basePlayDuration, maxThrowEnd);
  }, [basePlayDuration, throwPlans]);

  const throwOutcomeMap = useMemo(() => {
    const map = new Map<string, { catchTime: number | null; catchPlayerId: string | null }>();
    throwOutcomes.forEach((o) => map.set(o.id, o));
    return map;
  }, [throwOutcomes]);

  const getDiscStateAtTime = useCallback((time: number) => {
    const offense = players.filter((p) => p.team === 'offense');
    const initialHolderId = offense.find((p) => p.hasDisc)?.id ?? offense[0]?.id ?? null;
    let holderId: string | null = initialHolderId;
    let flight: { x: number; y: number; rotation: number } | null = null;
    let path: Point[] | null = null;
    let turnoverTime: number | null = null;
    for (const plan of throwPlans) {
      const outcome = throwOutcomeMap.get(plan.id);
      const catchTime = outcome?.catchTime ?? null;
      const catchPlayerId = outcome?.catchPlayerId ?? null;
      const endTime = catchTime ?? plan.endTime;
      if (time < plan.releaseTime) break;
      if (catchTime && time >= catchTime) {
        holderId = catchPlayerId;
        turnoverTime = catchTime;
        const samples = 24;
        const points: Point[] = [];
        for (let i = 0; i <= samples; i++) {
          const t = plan.releaseTime + (plan.duration * i) / samples;
          points.push(getDiscPosition(plan, t));
        }
        path = points;
        break;
      }
      if (time >= plan.releaseTime && time < endTime) {
        const discPos = getDiscPosition(plan, time);
        const rotation = plan.angle < -0.2 ? -45 : plan.angle > 0.2 ? 45 : 0;
        flight = { x: discPos.x, y: discPos.y, rotation };
        holderId = null;
        const samples = 24;
        const points: Point[] = [];
        const progress = Math.min(1, Math.max(0, (time - plan.releaseTime) / plan.duration));
        const lastSample = Math.max(1, Math.floor(samples * progress));
        for (let i = 0; i <= lastSample; i++) {
          const t = plan.releaseTime + (plan.duration * i) / samples;
          points.push(getDiscPosition(plan, t));
        }
        path = points;
        break;
      }
    }
    return { holderId, flight, turnoverTime, path };
  }, [players, throwPlans, throwOutcomeMap, getDiscPosition]);

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
      path: [],
      pathStartOffset: 0,
      speed: DEFAULT_SPEED,
      acceleration: DEFAULT_ACCELERATION,
      hasDisc: false,
      role: team === 'offense' ? 'cutter' : undefined
    };
    setPlayers(prev => [...prev, newPlayer]);
    setSelectedPlayerId(id);
  };

  const addOffensePlayerWithLabel = (labelNum: number, x: number, y: number) => {
    if (startLocked) return false;
    let added = false;
    const id = generateId();
    const newPlayer: Player = {
      id,
      team: 'offense',
      x,
      y,
      label: `O${labelNum}`,
      path: [],
      pathStartOffset: 0,
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
    if (startLocked) return false;
    let added = false;
    const id = generateId();
    const newPlayer: Player = {
      id,
      team: 'defense',
      x,
      y,
      label: `D${labelNum}`,
      path: [],
      pathStartOffset: 0,
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
    if (startLocked) return;
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, x, y } : p));
  };

  const updatePlayerSpeed = (id: string, speed: number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, speed } : p));
  };

  const updatePlayerAcceleration = (id: string, acceleration: number) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, acceleration } : p));
  };

  const updatePlayerPathStartOffset = (id: string, offset: number) => {
    setPlayers(prev => prev.map(p => {
      if (p.id !== id) return p;
      if (p.team !== 'offense') return p;
      return { ...p, pathStartOffset: Math.max(0, offset) };
    }));
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
    const defaultDownfieldSign = -1;
    const clampToTwoPointFiveYards = (x: number, y: number) => {
      const dx = x - op.x;
      const dy = y - op.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 2.5 || dist === 0) return { x, y };
      const scale = 2.5 / dist;
      return { x: op.x + dx * scale, y: op.y + dy * scale };
    };
    if (discHolder && op.id === discHolder.id) {
      return clampToTwoPointFiveYards(
        op.x + getBreakXOffset(op, 2, currentForce),
        op.y - 2
      );
    }
    if (role === 'handler' && discHolder) {
      const dx = discHolder.x - op.x;
      const dy = discHolder.y - op.y;
      return clampToTwoPointFiveYards(
        op.x + dx * 0.25,
        op.y + dy * 0.25 - 3
      );
    }
    const downfieldSign = discHolder
      ? (Math.sign(op.y - discHolder.y) || defaultDownfieldSign)
      : defaultDownfieldSign;
    const wantsDeep = defender?.cutterDefense === 'deep';
    const deepDepth = 4;
    const underDepth = 3;
    const cutterDepth = (wantsDeep ? deepDepth : -underDepth) * downfieldSign;
    return clampToTwoPointFiveYards(
      op.x + getForceXOffset(op, currentForce),
      op.y + cutterDepth
    );
  }, [getBreakXOffset, getForceXOffset]);

  const autoAssignDefense = () => {
    if (startLocked) return;
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
        pathStartOffset: 0,
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
      hasDisc: p.id === id
    })));
  };

  const removePlayer = (id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
    if (selectedPlayerId === id) setSelectedPlayerId(null);
    setThrows(prev => (prev || []).filter(t => t.throwerId !== id && t.receiverId !== id));
  };

  const handleSelectPlayer = (id: string) => {
    if (isSelectingReceiver && throwDraft) {
      const receiver = players.find((p) => p.id === id);
      if (receiver && receiver.team === 'offense' && receiver.id !== throwDraft.throwerId) {
        setThrowDraft({ ...throwDraft, receiverId: receiver.id });
        setIsSelectingReceiver(false);
        setSelectedPlayerId(throwDraft.throwerId);
        return;
      }
    }
    setSelectedPlayerId(id);
  };

  const openThrowControls = (throwerId: string, existingThrow?: { id: string; receiverId: string; releaseTime: number; angle: number; power: 'soft' | 'medium' | 'hard' }) => {
    setThrowDraft({
      throwerId,
      receiverId: existingThrow?.receiverId ?? null,
      releaseTime: existingThrow?.releaseTime ?? 0,
      angle: existingThrow?.angle ?? 0,
      power: existingThrow?.power ?? 'medium'
    });
    setEditingThrowId(existingThrow?.id ?? null);
    setIsSelectingReceiver(true);
    setShowThrowControls(true);
  };

  const closeThrowControls = () => {
    setShowThrowControls(false);
    setIsSelectingReceiver(false);
    setThrowDraft(null);
    setEditingThrowId(null);
  };

  const confirmThrow = () => {
    if (!throwDraft || !throwDraft.receiverId) return;
    const newThrow = {
      id: editingThrowId ?? generateId(),
      throwerId: throwDraft.throwerId,
      receiverId: throwDraft.receiverId,
      releaseTime: Math.max(0, Math.min(maxPlayDuration, throwDraft.releaseTime)),
      angle: throwDraft.angle,
      power: throwDraft.power
    };
    setThrows((prev) => {
      const base = prev || [];
      if (editingThrowId) {
        return base.map((t) => (t.id === editingThrowId ? newThrow : t)).sort((a, b) => a.releaseTime - b.releaseTime);
      }
      return [...base, newThrow].sort((a, b) => a.releaseTime - b.releaseTime);
    });
    setIsSelectingReceiver(false);
    setShowThrowControls(false);
    setThrowDraft(null);
    setEditingThrowId(null);
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
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const resetAnimation = () => {
    setAnimationState('IDLE');
    setAnimationTime(0);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  const animate = (now: number) => {
    const deltaTime = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    setAnimationTime(prev => {
      const nextTime = prev + deltaTime;
      const discState = getDiscStateAtTime(nextTime);
      if (discState.turnoverTime && nextTime >= discState.turnoverTime) {
        setAnimationState('IDLE');
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return discState.turnoverTime;
      }
      if (maxPlayDuration > 0 && nextTime >= maxPlayDuration + 1) {
        setAnimationState('IDLE');
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        return maxPlayDuration;
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
    const conceptId = existing?.conceptId || playConceptId || undefined;
    const conceptName = (existing?.conceptName || playConceptName || '').trim() || undefined;
    setSaveStatus('saving');
    const newPlay: Play = {
      id: editingPlayId || generateId(),
      ownerId: playOwnerId || currentUser?.uid,
      name: finalName,
      conceptId,
      conceptName,
      players,
      force,
      description: playDescription,
      throws: throws || [],
      visibility,
      sharedTeamIds: visibility === 'team' ? sharedTeamIds : [],
      createdBy: playCreatedBy || currentUser?.uid,
      lastEditedBy: currentUser?.uid,
      sourcePlayId: playSourceId || undefined,
      startFromPlayId: startFromPlayId || undefined,
      startLocked: startLocked || undefined
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
    setPlayConceptId(newPlay.conceptId || null);
    setPlayConceptName(newPlay.conceptName || '');
    if (isFirestoreEnabled()) {
      savePlayToFirestore(newPlay).catch((error) => console.error('Failed to save play to Firestore', error));
    }
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 600);
  };

  const buildNextPlayInSequence = () => {
    if (!editingPlayId) return;
    const currentUser = getCurrentUser();
    const endPositions = getSequenceAnchorPositionsByLabel(players, throws || []);
    const nextPlayers = players.map((player) => {
      const key = `${player.team}:${player.label}`;
      const target = endPositions.get(key);
      if (!target) {
        return { ...player, path: [], pathStartOffset: 0, hasDisc: false, autoAssigned: false, coversOffenseId: undefined };
      }
      return { ...player, x: target.x, y: target.y, path: [], pathStartOffset: 0, hasDisc: target.hasDisc, autoAssigned: false, coversOffenseId: undefined };
    });
    const existing = savedPlays.find((p) => p.id === editingPlayId);
    const visibility = existing?.visibility || 'private';
    const sharedTeamIds = existing?.sharedTeamIds || [];
    const conceptId = existing?.conceptId || playConceptId || undefined;
    const conceptName = (existing?.conceptName || playConceptName || '').trim() || undefined;
    const nextPlay: Play = {
      id: generateId(),
      ownerId: playOwnerId || currentUser?.uid,
      name: `${playName} - Next`,
      conceptId,
      conceptName,
      players: nextPlayers,
      force,
      description: '',
      throws: [],
      visibility,
      sharedTeamIds: visibility === 'team' ? sharedTeamIds : [],
      createdBy: currentUser?.uid,
      lastEditedBy: currentUser?.uid,
      startFromPlayId: editingPlayId,
      startLocked: true
    };
    setSavedPlays((prev) => [nextPlay, ...prev]);
    setPlayers(nextPlayers);
    setThrows([]);
    setPlayName(nextPlay.name);
    setPlayDescription('');
    setEditingPlayId(nextPlay.id);
    setPlayOwnerId(nextPlay.ownerId || null);
    setPlayCreatedBy(nextPlay.createdBy || null);
    setPlaySourceId(null);
    setPlayConceptId(nextPlay.conceptId || null);
    setPlayConceptName(nextPlay.conceptName || '');
    setStartFromPlayId(editingPlayId);
    setStartLocked(true);
    setSaveStatus('idle');
    setSelectedPlayerId(null);
    setMode(InteractionMode.SELECT);
    stopAnimation();
    if (isFirestoreEnabled()) {
      savePlayToFirestore(nextPlay).catch((error) => console.error('Failed to save play to Firestore', error));
    }
  };

  const resolveSequencePlay = useCallback((play: Play) => {
    if (!play.startLocked || !play.startFromPlayId) return play;
    const parent = savedPlays.find((p) => p.id === play.startFromPlayId);
    if (!parent) return play;
    const endPositions = getSequenceAnchorPositionsByLabel(parent.players, parent.throws || []);
    const aligned = alignPlayersToEndState(play.players, endPositions);
    if (!aligned.changed) return play;
    return { ...play, players: aligned.players };
  }, [savedPlays, getSequenceAnchorPositionsByLabel, alignPlayersToEndState]);

  const loadPlay = (play: Play) => {
    const resolved = resolveSequencePlay(play);
    stopAnimation();
    setPlayers(resolved.players);
    setThrows(resolved.throws || []);
    setPlayName(resolved.name);
    setForce(resolved.force);
    setPlayDescription(resolved.description || '');
    setEditingPlayId(resolved.id);
    setPlayOwnerId(resolved.ownerId || getCurrentUser()?.uid || null);
    setPlayCreatedBy(resolved.createdBy || null);
    setPlaySourceId(resolved.sourcePlayId || null);
    setPlayConceptId(resolved.conceptId || null);
    setPlayConceptName(resolved.conceptName || '');
    setStartFromPlayId(resolved.startFromPlayId || null);
    setStartLocked(Boolean(resolved.startLocked));
    setSelectedPlayerId(null);
    setMode(InteractionMode.SELECT);
  };

  useEffect(() => {
    if (!startLocked || !startFromPlayId) return;
    const parent = savedPlays.find((p) => p.id === startFromPlayId);
    if (!parent) return;
    const endPositions = getSequenceAnchorPositionsByLabel(parent.players, parent.throws || []);
    setPlayers((prev) => {
      const aligned = alignPlayersToEndState(prev, endPositions);
      return aligned.changed ? aligned.players : prev;
    });
    if (editingPlayId) {
      setSavedPlays((prev) => {
        const index = prev.findIndex((p) => p.id === editingPlayId);
        if (index === -1) return prev;
        const aligned = alignPlayersToEndState(prev[index].players, endPositions);
        if (!aligned.changed) return prev;
        const next = [...prev];
        next[index] = { ...prev[index], players: aligned.players };
        return next;
      });
    }
  }, [startLocked, startFromPlayId, editingPlayId, savedPlays, getSequenceAnchorPositionsByLabel, alignPlayersToEndState]);

  const hasUnsavedPlay = useMemo(() => {
    if (players.length === 0) return false;
    const current = normalizePlay({ name: playName, force, description: playDescription, players, throws: throws || [] });
    return !savedPlays.some(p => {
      const saved = normalizePlay({ name: p.name, force: p.force, description: p.description || '', players: p.players, throws: p.throws || [] });
      return JSON.stringify(saved) === JSON.stringify(current);
    });
  }, [players, playName, force, playDescription, savedPlays, throws]);

  const playSaveReason = !players.some(p => p.team === 'offense')
    ? 'Add at least one offensive player before saving.'
    : !hasUnsavedPlay
      ? 'No changes from an existing saved play.'
      : '';

  const applyFormationNearOwnEndzone = (formation: 'vertical' | 'side' | 'ho') => {
    if (isAnimationActive) return;
    if (startLocked) return;
    const offensePlayers = buildPresetFormation(formation, force, () => generateId());

    setPlayers(prev => {
      const defenseOnly = prev.filter(p => p.team !== 'offense');
      return [...defenseOnly, ...offensePlayers];
    });
    setThrows([]);
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

  const discState = useMemo(() => {
    if (!isAnimationActive && animationTime === 0) {
      const offense = players.filter((p) => p.team === 'offense');
      const holderId = offense.find((p) => p.hasDisc)?.id ?? offense[0]?.id ?? null;
      return { holderId, flight: null as { x: number; y: number; rotation: number } | null, turnoverTime: null as number | null, path: null as Point[] | null };
    }
    return getDiscStateAtTime(animationTime);
  }, [isAnimationActive, players, animationTime, getDiscStateAtTime]);

  const canBuildNextPlay = Boolean(editingPlayId);
  const buildNextPlayReason = editingPlayId ? '' : 'Save this play before starting a sequence.';

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* New Play Modal */}
      {showNewPlayModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
              <h2 className="text-lg font-bold flex items-center gap-2"><Plus size={20} className="text-indigo-400" /> Start New Play</h2>
              <button onClick={() => { setShowNewPlayModal(false); setNewPlayConceptName(null); }} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Play Name</label>
                <input autoFocus type="text" value={tempPlayName} onChange={(e) => setTempPlayName(e.target.value)} placeholder="e.g. Vert Stack Deep Look" className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
              </div>
            </div>
            <div className="p-6 bg-slate-800/30 flex gap-3">
              <button onClick={() => { setShowNewPlayModal(false); setNewPlayConceptName(null); }} className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all">Cancel</button>
              <button onClick={() => {
                const currentUser = getCurrentUser();
                const conceptDraft = newPlayConceptName?.trim() || '';
                setPlayers([]);
                setThrows([]);
                setPlayName(tempPlayName || conceptDraft || 'New Play');
                setEditingPlayId(null);
                setPlayDescription('');
                setPlayOwnerId(currentUser?.uid || null);
                setPlayCreatedBy(currentUser?.uid || null);
                setPlaySourceId(null);
                setPlayConceptId(conceptDraft ? generateId() : null);
                setPlayConceptName(conceptDraft);
                setStartFromPlayId(null);
                setStartLocked(false);
                setNewPlayConceptName(null);
                setShowNewPlayModal(false);
                stopAnimation();
              }} className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all">Create</button>
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
                Sign in to save plays to your playbook.
              </p>
              <button
                onClick={() => {
                  setShowAuthPrompt(false);
                  setShowAuthModal(true);
                }}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-100 text-slate-900 hover:bg-white shadow-lg"
              >
                Sign in
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

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          const currentUser = getCurrentUser();
          if (!currentUser || currentUser.isAnonymous) return;
          const pending = pendingSaveAction;
          setPendingSaveAction(null);
          if (pending?.type === 'play') {
            savePlay(pending.name);
          }
        }}
      />

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
        onBackToPlaybook={() => {
          window.history.pushState({}, '', '/playbook');
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
        onOpenAuth={() => {
          setShowAuthModal(true);
        }}
        sublabel="Builder"
        user={authUser}
      />

      <div className="flex flex-1 overflow-hidden relative">
        
        <WorkflowSidebar
          players={players}
          mode={mode}
          isAnimationActive={isAnimationActive}
          isStartLocked={startLocked}
          activeFormation={activeFormation}
          setActiveFormation={setActiveFormation}
          setMode={setMode}
          playName={playName}
          onPlayNameChange={setPlayName}
          force={force}
          onForceChange={setForce}
          onApplyPresetFormation={applyFormationNearOwnEndzone}
          onCreateCustomFormation={() => { setActiveFormation('custom'); setMode(InteractionMode.ADD_OFFENSE); }}
          onAutoAssignDefense={autoAssignDefense}
          onSavePlay={savePlay}
          canSavePlay={players.some(p => p.team === 'offense')}
          playSaveReason={playSaveReason}
          saveStatus={saveStatus}
          onBuildNextPlay={buildNextPlayInSequence}
          canBuildNextPlay={canBuildNextPlay}
          buildNextPlayReason={buildNextPlayReason}
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
              onSelectPlayer={handleSelectPlayer}
              animationTime={animationTime}
              isAnimationActive={isAnimationActive}
              isStartLocked={startLocked}
              force={force}
              onDropOffense={addOffensePlayerWithLabel}
              onDropDefense={addDefensePlayerWithLabel}
              onDropResult={(success) => {
                if (success) setDraggingToken(null);
              }}
              draggingToken={draggingToken}
              discFlight={discState.flight}
              discHolderId={discState.holderId}
              highlightPlayerId={throwDraft?.receiverId ?? null}
              discPath={discState.path}
              onDebugEvent={() => {}}
            />
          </div>
        </div>

        <Sidebar 
          players={players} 
          throws={throws || []}
          selectedPlayerId={selectedPlayerId} 
          onDeletePlayer={removePlayer} 
          onClearPath={clearPath} 
          onUndoPathPoint={undoLastPathPoint} 
          onAssignDisc={assignDisc} 
          throwControls={{
            isOpen: showThrowControls,
            isSelectingReceiver,
            throwDraft,
            maxReleaseTime: maxPlayDuration,
            isEditing: Boolean(editingThrowId),
            onToggle: (isOpen: boolean) => {
              if (isOpen && selectedPlayerId) {
                const existing = (throws || []).find((t) => t.throwerId === selectedPlayerId);
                openThrowControls(selectedPlayerId, existing || undefined);
              } else {
                closeThrowControls();
              }
            },
            onEdit: (throwId: string) => {
              const existing = (throws || []).find((t) => t.id === throwId);
              if (existing) {
                openThrowControls(existing.throwerId, existing);
              }
            },
            onSelectReceiver: () => setIsSelectingReceiver(true),
            onClearReceiver: () => {
              if (!throwDraft) return;
              setThrowDraft({ ...throwDraft, receiverId: null });
            },
            onReleaseTimeChange: (value: number) => {
              if (!throwDraft) return;
              setThrowDraft({ ...throwDraft, releaseTime: value });
            },
            onAngleChange: (value: number) => {
              if (!throwDraft) return;
              setThrowDraft({ ...throwDraft, angle: value });
            },
            onPowerChange: (value: 'soft' | 'medium' | 'hard') => {
              if (!throwDraft) return;
              setThrowDraft({ ...throwDraft, power: value });
            },
            onConfirm: confirmThrow,
            onCancel: closeThrowControls
          }}
          onUpdateSpeed={updatePlayerSpeed} 
          onUpdateAcceleration={updatePlayerAcceleration} 
          onUpdatePathStartOffset={updatePlayerPathStartOffset}
          onUpdateRole={updatePlayerRole}
          onUpdateCutterDefense={updateCutterDefense}
          isPlaying={isAnimationActive} 
          animationState={animationState}
          animationTime={animationTime}
          onStartAnimation={startAnimation}
          onTogglePause={togglePause}
          onStopAnimation={stopAnimation}
          onResetAnimation={resetAnimation}
          hasPlayers={players.length > 0}
          description={playDescription}
          onUpdateDescription={setPlayDescription}
        />
      </div>
    </div>
  );
};

export default App;
