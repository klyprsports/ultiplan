
import React, { useRef, useState, useMemo } from 'react';
import { Player, InteractionMode, Point, Force } from '../types';

interface FieldProps {
  players: Player[];
  mode: InteractionMode;
  selectedPlayerId: string | null;
  onFieldClick: (x: number, y: number) => void;
  onUpdatePlayer: (id: string, x: number, y: number) => void;
  onAddPathPoint: (id: string, point: Point) => void;
  onSelectPlayer: (id: string) => void;
  animationTime: number | null;
  isAnimationActive: boolean;
  isStartLocked?: boolean;
  force: Force;
  onDropOffense: (labelNum: number, x: number, y: number) => boolean;
  onDropDefense: (labelNum: number, x: number, y: number) => boolean;
  onDropResult: (success: boolean) => void;
  draggingToken: { team: 'offense' | 'defense'; labelNum: number } | null;
  discFlight?: { x: number; y: number; rotation: number } | null;
  discHolderId?: string | null;
  highlightPlayerId?: string | null;
  throwTargetPoint?: Point | null;
  isSelectingThrowTarget?: boolean;
  discPath?: Point[] | null;
}

const FIELD_WIDTH = 40; // yards
const FIELD_HEIGHT = 110; // yards
const ENDZONE_DEPTH = 20; // yards
const SCALE = 8; // pixels per yard
const REACTION_DELAY = 0.1; // seconds
const DEFENDER_BRAKING_MULTIPLIER = 1.7;

const Field: React.FC<FieldProps> = ({
  players,
  mode,
  selectedPlayerId,
  onFieldClick,
  onUpdatePlayer,
  onAddPathPoint,
  onSelectPlayer,
  animationTime,
  isAnimationActive,
  isStartLocked = false,
  force,
  onDropOffense,
  onDropDefense,
  onDropResult,
  draggingToken,
  discFlight,
  discHolderId,
  highlightPlayerId,
  throwTargetPoint,
  isSelectingThrowTarget = false,
  discPath
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const defensiveAssignments = useMemo(() => {
    const assignments: Record<string, string> = {};
    const defense = players.filter(p => p.team === 'defense');
    const offense = players.filter(p => p.team === 'offense');
    if (offense.length === 0) return assignments;
    defense.forEach(d => {
      let closestId = '';
      let minDocs = Infinity;
      offense.forEach(o => {
        const dist = Math.sqrt(Math.pow(d.x - o.x, 2) + Math.pow(d.y - o.y, 2));
        if (dist < minDocs) { minDocs = dist; closestId = o.id; }
      });
      if (closestId) assignments[d.id] = closestId;
    });
    return assignments;
  }, [players]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    if (!svgRef.current) return null;
    const CTM = svgRef.current.getScreenCTM();
    if (!CTM) return null;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - CTM.e) / (CTM.a * SCALE), y: (clientY - CTM.f) / (CTM.d * SCALE) };
  };

  const getCoordinatesFromClient = (clientX: number, clientY: number): Point | null => {
    if (!svgRef.current) return null;
    const CTM = svgRef.current.getScreenCTM();
    if (CTM) {
      return { x: (clientX - CTM.e) / (CTM.a * SCALE), y: (clientY - CTM.f) / (CTM.d * SCALE) };
    }
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * FIELD_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * FIELD_HEIGHT;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAnimationActive) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    const target = e.target as SVGElement;
    const playerId = target.closest('[data-player-id]')?.getAttribute('data-player-id');
    if (playerId) {
      let intendedPlayerId = playerId;
      const clickedPlayer = players.find((p) => p.id === playerId);
      const shouldPreferOffense =
        clickedPlayer?.team === 'defense' &&
        (mode === InteractionMode.DRAW || mode === InteractionMode.SELECT || mode === InteractionMode.ADD_OFFENSE);
      if (shouldPreferOffense) {
        const nearbyOffense = players
          .filter((p) => p.team === 'offense')
          .map((p) => ({ player: p, dist: Math.hypot(p.x - coords.x, p.y - coords.y) }))
          .filter(({ dist }) => dist <= 1.35)
          .sort((a, b) => a.dist - b.dist)[0];
        if (nearbyOffense) {
          intendedPlayerId = nearbyOffense.player.id;
        }
      }

      onSelectPlayer(intendedPlayerId);
      if (
        !isStartLocked &&
        (mode === InteractionMode.SELECT ||
          mode === InteractionMode.ADD_OFFENSE ||
          mode === InteractionMode.ADD_DEFENSE ||
          mode === InteractionMode.DRAW)
      ) {
        setIsDragging(true);
        setActivePlayerId(intendedPlayerId);
      }
    } else {
      onFieldClick(coords.x, coords.y);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isAnimationActive || isStartLocked || !isDragging || !activePlayerId) return;
    const coords = getCoordinates(e);
    if (
      coords &&
      (mode === InteractionMode.SELECT ||
        mode === InteractionMode.ADD_OFFENSE ||
        mode === InteractionMode.ADD_DEFENSE ||
        mode === InteractionMode.DRAW)
    ) {
      onUpdatePlayer(activePlayerId, coords.x, coords.y);
    }
  };

  const handleMouseUp = () => { setIsDragging(false); setActivePlayerId(null); };

  const getForceXOffset = (x: number, currentForce: Force) => {
    const fieldMidX = FIELD_WIDTH / 2;
    if (currentForce === 'home') return -3;
    if (currentForce === 'away') return 3;
    if (currentForce === 'middle') return x < fieldMidX ? 3 : -3;
    return x < fieldMidX ? -3 : 3;
  };

  const getBreakXOffset = (x: number, magnitude: number, currentForce: Force) => {
    const fieldMidX = FIELD_WIDTH / 2;
    if (currentForce === 'home') return magnitude;
    if (currentForce === 'away') return -magnitude;
    if (currentForce === 'middle') return x < fieldMidX ? -magnitude : magnitude;
    return x < fieldMidX ? magnitude : -magnitude;
  };

  const calculatePositionAtTime = (startX: number, startY: number, path: Point[], time: number, topSpeed: number, acc: number, startOffset = 0): Point => {
    const adjustedTime = time - Math.max(0, startOffset);
    if (path.length === 0 || adjustedTime <= 0) return { x: startX, y: startY };
    const dec = acc * 2.0;
    const points = [{ x: startX, y: startY }, ...path];
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
  };

  const animatedPositions = useMemo(() => {
    const positions = new Map<string, Point>();
    if (animationTime === null) {
      players.forEach((player) => positions.set(player.id, { x: player.x, y: player.y }));
      return positions;
    }

    const offensePlayers = players.filter((p) => p.team === 'offense');
    const offenseById = new Map(offensePlayers.map((p) => [p.id, p]));
    const extractLabelNumber = (label?: string) => {
      if (!label) return null;
      const numeric = parseInt(label.replace(/^\D+/, ''), 10);
      return Number.isNaN(numeric) ? null : numeric;
    };
    const getMatchedOffense = (defender: Player) => {
      if (defender.coversOffenseId) {
        const explicit = offenseById.get(defender.coversOffenseId);
        if (explicit) return explicit;
      }
      const defenderNum = extractLabelNumber(defender.label);
      if (defenderNum !== null) {
        const byLabel = offensePlayers.find((offense) => extractLabelNumber(offense.label) === defenderNum);
        if (byLabel) return byLabel;
      }
      const nearestTargetId = defensiveAssignments[defender.id];
      if (nearestTargetId) {
        const nearest = offenseById.get(nearestTargetId);
        if (nearest) return nearest;
      }
      return undefined;
    };
    const trackingOffsets = new Map<string, { dx: number; dy: number; offenseId: string }>();
    players.forEach((player) => {
      if (player.team !== 'defense') return;
      const matched = getMatchedOffense(player);
      if (!matched) return;
      trackingOffsets.set(player.id, {
        dx: player.x - matched.x,
        dy: player.y - matched.y,
        offenseId: matched.id
      });
    });
    const getOffensePositionAtTime = (offense: Player, time: number) =>
      calculatePositionAtTime(
        offense.x,
        offense.y,
        offense.path,
        time,
        offense.speed,
        offense.acceleration,
        Math.max(0, offense.pathStartOffset ?? 0)
      );

    const getDefenderTarget = (
      defender: Player,
      targetOffense: Player,
      targetOffensePos: Point,
      currentDiscHolderId?: string
    ) => {
      const anchor = trackingOffsets.get(defender.id);
      const desiredFromAnchor = anchor && anchor.offenseId === targetOffense.id
        ? { x: targetOffensePos.x + anchor.dx, y: targetOffensePos.y + anchor.dy }
        : { x: targetOffensePos.x, y: targetOffensePos.y };

      if (currentDiscHolderId && targetOffense.id === currentDiscHolderId) {
        const markSideSign = -Math.sign(getForceXOffset(targetOffensePos.x, force)) || 1;
        const MARK_FORCE_OFFSET = 2.2;
        const MARK_BACK_OFFSET = 0.8;
        const MIN_MARK_DISTANCE = 2.35;
        let base = desiredFromAnchor;
        const lateral = (base.x - targetOffensePos.x) * markSideSign;
        if (lateral < 0.2) {
          base = {
            x: targetOffensePos.x + markSideSign * MARK_FORCE_OFFSET,
            y: targetOffensePos.y - MARK_BACK_OFFSET
          };
        }
        const dx = base.x - targetOffensePos.x;
        const dy = base.y - targetOffensePos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-4) {
          return { x: targetOffensePos.x + markSideSign * MIN_MARK_DISTANCE, y: targetOffensePos.y };
        }
        if (dist < MIN_MARK_DISTANCE) {
          const s = MIN_MARK_DISTANCE / dist;
          return { x: targetOffensePos.x + dx * s, y: targetOffensePos.y + dy * s };
        }
        return base;
      }
      return {
        x: desiredFromAnchor.x,
        y: desiredFromAnchor.y
      };
    };

    const normalizeAngle = (angle: number) => {
      let a = angle;
      while (a <= -Math.PI) a += Math.PI * 2;
      while (a > Math.PI) a -= Math.PI * 2;
      return a;
    };

    const segmentIntersectsCircle = (x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, radius: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) {
        const dist = Math.hypot(x1 - cx, y1 - cy);
        return dist <= radius;
      }
      const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
      const closestX = x1 + t * dx;
      const closestY = y1 + t * dy;
      const dist = Math.hypot(closestX - cx, closestY - cy);
      return dist <= radius;
    };

    players.forEach((player) => {
      if (player.team === 'offense') {
        const startOffset = Math.max(0, player.pathStartOffset ?? 0);
        positions.set(player.id, calculatePositionAtTime(player.x, player.y, player.path, animationTime, player.speed, player.acceleration, startOffset));
        return;
      }

      const targetOffense = getMatchedOffense(player);
      if (!targetOffense) {
        positions.set(player.id, { x: player.x, y: player.y });
        return;
      }

      const dt = 1 / 60;
      const maxSpeedBase = Math.max(0.1, player.speed);
      const maxAccelBase = Math.max(0.1, player.acceleration);
      let simX = player.x;
      let simY = player.y;
      let velX = 0;
      let velY = 0;
      let previousResponseDesired: Point | null = null;
      let previousDesiredDir: Point | null = null;
      let burstTimeRemaining = 0;

      for (let t = dt; t <= animationTime + 1e-6; t += dt) {
        const responseTime = Math.max(0, t - REACTION_DELAY);
        const targetOffensePosResponse = getOffensePositionAtTime(targetOffense, responseTime);
        const discHolder = discHolderId ? offenseById.get(discHolderId) : undefined;
        const discHolderPosResponse = discHolder ? getOffensePositionAtTime(discHolder, responseTime) : undefined;
        const desiredResponse = getDefenderTarget(player, targetOffense, targetOffensePosResponse, discHolder?.id);

        let steeringTarget = desiredResponse;
        const isMarkingDiscHolder = Boolean(discHolder && targetOffense.id === discHolder.id);
        if (isMarkingDiscHolder) {
          const BODY_AVOID_RADIUS = 1.0;
          const MARK_AVOID_RADIUS = 2.5;
          const MIN_MARK_DISTANCE = 2.35;
          const shouldAvoid = segmentIntersectsCircle(
            simX,
            simY,
            desiredResponse.x,
            desiredResponse.y,
            targetOffensePosResponse.x,
            targetOffensePosResponse.y,
            BODY_AVOID_RADIUS
          );
          if (shouldAvoid) {
            const fromAngle = Math.atan2(simY - targetOffensePosResponse.y, simX - targetOffensePosResponse.x);
            const toAngle = Math.atan2(desiredResponse.y - targetOffensePosResponse.y, desiredResponse.x - targetOffensePosResponse.x);
            const delta = normalizeAngle(toAngle - fromAngle);
            const side = delta >= 0 ? 1 : -1;
            const arcStep = side * (Math.PI / 3);
            const waypointAngle = fromAngle + arcStep;
            steeringTarget = {
              x: targetOffensePosResponse.x + Math.cos(waypointAngle) * MARK_AVOID_RADIUS,
              y: targetOffensePosResponse.y + Math.sin(waypointAngle) * MARK_AVOID_RADIUS
            };
          }
          const mdx = steeringTarget.x - targetOffensePosResponse.x;
          const mdy = steeringTarget.y - targetOffensePosResponse.y;
          const md = Math.hypot(mdx, mdy);
          if (md > 1e-4 && md < MIN_MARK_DISTANCE) {
            const s = MIN_MARK_DISTANCE / md;
            steeringTarget = {
              x: targetOffensePosResponse.x + mdx * s,
              y: targetOffensePosResponse.y + mdy * s
            };
          }
        }

        const targetVelX = previousResponseDesired ? (steeringTarget.x - previousResponseDesired.x) / dt : 0;
        const targetVelY = previousResponseDesired ? (steeringTarget.y - previousResponseDesired.y) / dt : 0;
        previousResponseDesired = steeringTarget;

        const downfieldSign = discHolderPosResponse
          ? (Math.sign(targetOffensePosResponse.y - discHolderPosResponse.y) || -1)
          : -1;
        const deepCushion = (simY - targetOffensePosResponse.y) * downfieldSign;
        const needsDeepRecovery = player.cutterDefense === 'deep' && deepCushion < 0.75;
        const burstActive = burstTimeRemaining > 0;
        const burstSpeedMultiplier = burstActive ? 1.2 : 1;
        const burstAccelMultiplier = burstActive ? 1.35 : 1;
        const maxSpeed = (needsDeepRecovery ? maxSpeedBase * 1.35 : maxSpeedBase) * burstSpeedMultiplier;
        const maxAccel = (needsDeepRecovery ? maxAccelBase * 1.6 : maxAccelBase) * burstAccelMultiplier;

        const toTargetX = steeringTarget.x - simX;
        const toTargetY = steeringTarget.y - simY;
        const toTargetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
        const targetSpeedMag = Math.sqrt(targetVelX * targetVelX + targetVelY * targetVelY);
        if (isMarkingDiscHolder && toTargetDist <= 0.25 && targetSpeedMag < 0.2) {
          simX = steeringTarget.x;
          simY = steeringTarget.y;
          velX = 0;
          velY = 0;
          continue;
        }
        if (toTargetDist <= 0.03 && targetSpeedMag < 0.05) {
          simX = steeringTarget.x;
          simY = steeringTarget.y;
          velX = 0;
          velY = 0;
          continue;
        }

        let desiredVelX = 0;
        let desiredVelY = 0;
        if (toTargetDist > 1e-4) {
          const brakingSpeed = Math.sqrt(Math.max(0, 2 * maxAccel * toTargetDist));
          const correctionSpeed = Math.min(maxSpeed, brakingSpeed);
          desiredVelX = targetVelX + (toTargetX / toTargetDist) * correctionSpeed;
          desiredVelY = targetVelY + (toTargetY / toTargetDist) * correctionSpeed;
        } else {
          desiredVelX = targetVelX;
          desiredVelY = targetVelY;
        }

        const desiredSpeed = Math.sqrt(desiredVelX * desiredVelX + desiredVelY * desiredVelY);
        if (desiredSpeed > 1e-4) {
          const dirX = desiredVelX / desiredSpeed;
          const dirY = desiredVelY / desiredSpeed;
          if (previousDesiredDir) {
            const dot = Math.max(-1, Math.min(1, previousDesiredDir.x * dirX + previousDesiredDir.y * dirY));
            const headingChange = Math.acos(dot);
            const DIRECTION_CHANGE_THRESHOLD = Math.PI / 7; // ~26 degrees
            if (headingChange > DIRECTION_CHANGE_THRESHOLD) {
              burstTimeRemaining = 0.22;
            }
          }
          previousDesiredDir = { x: dirX, y: dirY };
        }

        if (burstTimeRemaining > 0) {
          burstTimeRemaining = Math.max(0, burstTimeRemaining - dt);
        }

        const deltaVX = desiredVelX - velX;
        const deltaVY = desiredVelY - velY;
        const deltaV = Math.sqrt(deltaVX * deltaVX + deltaVY * deltaVY);
        if (deltaV > 1e-6) {
          const currentSpeed = Math.sqrt(velX * velX + velY * velY);
          const desiredSpeed = Math.sqrt(desiredVelX * desiredVelX + desiredVelY * desiredVelY);
          const headingDot = currentSpeed > 1e-6 && desiredSpeed > 1e-6
            ? (velX * desiredVelX + velY * desiredVelY) / (currentSpeed * desiredSpeed)
            : 1;
          const braking = desiredSpeed < currentSpeed - 0.05 || headingDot < 0.7;
          const accelForStep = braking ? maxAccel * DEFENDER_BRAKING_MULTIPLIER : maxAccel;
          const maxDeltaV = accelForStep * dt;
          const scale = Math.min(1, maxDeltaV / deltaV);
          const appliedDVX = deltaVX * scale;
          const appliedDVY = deltaVY * scale;
          velX += appliedDVX;
          velY += appliedDVY;
        }

        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed;
          velX *= scale;
          velY *= scale;
        }

        simX = Math.max(0, Math.min(FIELD_WIDTH, simX + velX * dt));
        simY = Math.max(0, Math.min(FIELD_HEIGHT, simY + velY * dt));
      }

      positions.set(player.id, { x: simX, y: simY });
    });

    return positions;
  }, [animationTime, players, defensiveAssignments, discHolderId, force]);

  const getAnimatedPosition = (player: Player): Point => animatedPositions.get(player.id) ?? { x: player.x, y: player.y };

  const w = FIELD_WIDTH * SCALE, h = FIELD_HEIGHT * SCALE, ez = ENDZONE_DEPTH * SCALE;
  const handleDrop = (clientX: number, clientY: number, payload: string) => {
    if (isStartLocked) return;
    if (!draggingToken) return;
    const expectedPayload = `${draggingToken.team}:${draggingToken.labelNum}`;
    if (payload !== expectedPayload) return;
    const [team, labelRaw] = payload.split(':');
    if (!team || !labelRaw) return;
    const labelNum = parseInt(labelRaw, 10);
    if (Number.isNaN(labelNum)) return;
    const coords = getCoordinatesFromClient(clientX, clientY);
    if (!coords) return;
    const clampedX = Math.max(0, Math.min(FIELD_WIDTH, coords.x));
    const clampedY = Math.max(0, Math.min(FIELD_HEIGHT, coords.y));
    let success = false;
    if (team === 'offense') success = onDropOffense(labelNum, clampedX, clampedY);
    else if (team === 'defense') success = onDropDefense(labelNum, clampedX, clampedY);
    onDropResult(success);
  };

  return (
    <div
      className={`flex items-center gap-6 select-none ${isAnimationActive ? 'pointer-events-none' : ''}`}
      onDragOver={(e) => {
        if (isAnimationActive) return;
        const types = Array.from(e.dataTransfer.types || []);
        if (!types.includes('application/x-ultiplan-player')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        if (isAnimationActive) return;
        const types = Array.from(e.dataTransfer.types || []);
        if (!types.includes('application/x-ultiplan-player')) return;
        if (!draggingToken) return;
        e.preventDefault();
        e.stopPropagation();
        const payload = e.dataTransfer.getData('application/x-ultiplan-player')
          || e.dataTransfer.getData('text/plain')
          || e.dataTransfer.getData('text');
        if (!payload) return;
        handleDrop(e.clientX, e.clientY, payload);
      }}
    >
      <div className="flex-shrink-0">
        <div className="px-0.5 py-10 rounded-full border border-slate-700/50 text-slate-500 text-[10px] font-bold tracking-[0.5em] uppercase" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>HOME SIDELINE</div>
      </div>
      <div className="flex flex-col items-center">
        <div className="relative shadow-2xl ring-1 ring-slate-800 rounded-sm">
          <svg
            ref={svgRef}
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="bg-emerald-900 overflow-visible cursor-crosshair touch-none"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDragOver={(e) => {
              if (isAnimationActive) return;
              const types = Array.from(e.dataTransfer.types || []);
              if (!types.includes('application/x-ultiplan-player')) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              if (isAnimationActive) return;
              const types = Array.from(e.dataTransfer.types || []);
              if (!types.includes('application/x-ultiplan-player')) return;
              if (!draggingToken) return;
              e.preventDefault();
              e.stopPropagation();
              const payload = e.dataTransfer.getData('application/x-ultiplan-player')
                || e.dataTransfer.getData('text/plain')
                || e.dataTransfer.getData('text');
              if (!payload) return;
              handleDrop(e.clientX, e.clientY, payload);
            }}
            onDragStart={(e) => {
              if (draggingToken) {
                e.preventDefault();
              }
            }}
          >
            <rect width={w} height={h} fill="#065f46" />
            <rect x="0" y="0" width={w} height={h} fill="none" stroke="white" strokeWidth="2" />
            <line x1="0" y1={ez} x2={w} y2={ez} stroke="white" strokeWidth="2" />
            <line x1="0" y1={h - ez} x2={w} y2={h - ez} stroke="white" strokeWidth="2" />
            {Array.from({ length: FIELD_HEIGHT + 1 }, (_, i) => i)
              .filter((yard) => yard > ENDZONE_DEPTH && yard < FIELD_HEIGHT - ENDZONE_DEPTH)
              .map((yard) => (
              <g key={`tick-${yard}`}>
                <line
                  x1="0"
                  y1={yard * SCALE}
                  x2={0.6 * SCALE}
                  y2={yard * SCALE}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="1"
                />
                <line
                  x1={w - 0.6 * SCALE}
                  y1={yard * SCALE}
                  x2={w}
                  y2={yard * SCALE}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="1"
                />
              </g>
            ))}
            {Array.from({ length: Math.floor(FIELD_HEIGHT / 10) + 1 }, (_, i) => i * 10)
              .filter((yard) => yard > ENDZONE_DEPTH && yard < FIELD_HEIGHT - ENDZONE_DEPTH)
              .map((yard) => (
              <line
                key={`yard-${yard}`}
                x1="0"
                y1={yard * SCALE}
                x2={w}
                y2={yard * SCALE}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1"
              />
            ))}
            {players.map(player => {
              const pts = [{ x: player.x, y: player.y }, ...player.path];
              return pts.length > 1 && (
                <g key={`path-${player.id}`}>
                  <polyline points={pts.map(p => `${p.x * SCALE},${p.y * SCALE}`).join(' ')} fill="none" stroke={player.team === 'offense' ? '#60a5fa' : '#f87171'} strokeWidth="2" strokeDasharray="4 2" opacity={animationTime ? "0.3" : "0.8"} />
                </g>
              );
            })}
            {players.map(player => {
              const pos = getAnimatedPosition(player);
              const isHighlighted = highlightPlayerId === player.id;
              return (
                <g key={player.id} data-player-id={player.id} transform={`translate(${pos.x * SCALE}, ${pos.y * SCALE})`} className="cursor-pointer group" draggable={false}>
                  <circle cx="0" cy="0" r={1.2 * SCALE} fill={player.team === 'offense' ? '#2563eb' : '#dc2626'} stroke={selectedPlayerId === player.id ? 'white' : isHighlighted ? '#34d399' : 'rgba(255,255,255,0.2)'} strokeWidth={selectedPlayerId === player.id ? "3" : isHighlighted ? "3" : "1"} />
                  {(discHolderId ? discHolderId === player.id : player.hasDisc) && !discFlight && (
                    <g transform={`translate(${1.2 * SCALE}, ${-1.2 * SCALE})`}>
                      <circle r={0.6 * SCALE} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
                    </g>
                  )}
                  <text x="0" y="1" textAnchor="middle" fill="white" fontSize={0.8 * SCALE} fontWeight="bold" pointerEvents="none" className="font-mono">{player.label}</text>
                </g>
              );
            })}
            {discFlight && (
              <g transform={`translate(${discFlight.x * SCALE}, ${discFlight.y * SCALE})`}>
                <ellipse transform={`rotate(${discFlight.rotation})`} rx={0.8 * SCALE} ry={0.35 * SCALE} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
              </g>
            )}
            {discPath && discPath.length > 1 && (
              <polyline
                points={discPath.map((p) => `${p.x * SCALE},${p.y * SCALE}`).join(' ')}
                fill="none"
                stroke="#facc15"
                strokeWidth="2"
                strokeDasharray="6 6"
                opacity="0.8"
              />
            )}
            {throwTargetPoint && (
              <g transform={`translate(${throwTargetPoint.x * SCALE}, ${throwTargetPoint.y * SCALE})`}>
                <circle r={0.85 * SCALE} fill="none" stroke="#facc15" strokeWidth="2" strokeDasharray="4 2" />
                <line x1={-0.5 * SCALE} y1="0" x2={0.5 * SCALE} y2="0" stroke="#facc15" strokeWidth="2" />
                <line x1="0" y1={-0.5 * SCALE} x2="0" y2={0.5 * SCALE} stroke="#facc15" strokeWidth="2" />
              </g>
            )}
            {isSelectingThrowTarget && !throwTargetPoint && (
              <text
                x={w / 2}
                y={24}
                textAnchor="middle"
                fill="#facc15"
                fontSize="12"
                fontWeight="700"
                style={{ letterSpacing: '0.08em' }}
              >
                CLICK FIELD TO SET THROW TARGET
              </text>
            )}
          </svg>
        </div>
      </div>
      <div className="flex-shrink-0"><div className="px-0.5 py-10 rounded-full border border-slate-700/50 text-slate-500 text-[10px] font-bold tracking-[0.5em] uppercase" style={{ writingMode: 'vertical-lr' }}>AWAY SIDELINE</div></div>
    </div>
  );
};

export default Field;
