
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
  discPath?: Point[] | null;
}

const FIELD_WIDTH = 40; // yards
const FIELD_HEIGHT = 110; // yards
const ENDZONE_DEPTH = 20; // yards
const SCALE = 8; // pixels per yard
const REACTION_DELAY = 0.25; // seconds

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
      onSelectPlayer(playerId);
      if (
        !isStartLocked &&
        (mode === InteractionMode.SELECT ||
          mode === InteractionMode.ADD_OFFENSE ||
          mode === InteractionMode.ADD_DEFENSE ||
          mode === InteractionMode.DRAW)
      ) {
        setIsDragging(true);
        setActivePlayerId(playerId);
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

  const calculatePositionAtTime = (startX: number, startY: number, path: Point[], time: number, topSpeed: number, acc: number, startOffset = 0): Point => {
    const adjustedTime = time - startOffset;
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

  const getAnimatedPosition = (player: Player): Point => {
    if (animationTime === null) return { x: player.x, y: player.y };
    if (player.path.length > 0) {
      const startOffset = player.team === 'offense' ? (player.pathStartOffset ?? 0) : 0;
      return calculatePositionAtTime(player.x, player.y, player.path, animationTime, player.speed, player.acceleration, startOffset);
    }
    if (player.team === 'defense') {
      const targetId = defensiveAssignments[player.id];
      const targetOffense = players.find(p => p.id === targetId);
      if (targetOffense) {
        const delayedTime = Math.max(0, animationTime - REACTION_DELAY);
        const startOffset = targetOffense.pathStartOffset ?? 0;
        const targetPosAtDelayedTime = calculatePositionAtTime(targetOffense.x, targetOffense.y, targetOffense.path, delayedTime, targetOffense.speed, targetOffense.acceleration, startOffset);
        return { x: player.x + (targetPosAtDelayedTime.x - targetOffense.x), y: player.y + (targetPosAtDelayedTime.y - targetOffense.y) };
      }
    }
    return { x: player.x, y: player.y };
  };

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
                  <circle cx="0" cy="0" r={1.2 * SCALE} fill={player.team === 'offense' ? '#2563eb' : '#dc2626'} stroke={selectedPlayerId === player.id && !animationTime ? 'white' : isHighlighted ? '#34d399' : 'rgba(255,255,255,0.2)'} strokeWidth={selectedPlayerId === player.id && !animationTime ? "3" : isHighlighted ? "3" : "1"} />
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
          </svg>
        </div>
      </div>
      <div className="flex-shrink-0"><div className="px-0.5 py-10 rounded-full border border-slate-700/50 text-slate-500 text-[10px] font-bold tracking-[0.5em] uppercase" style={{ writingMode: 'vertical-lr' }}>AWAY SIDELINE</div></div>
    </div>
  );
};

export default Field;
