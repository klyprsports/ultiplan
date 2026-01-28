
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
  force: Force;
}

const FIELD_WIDTH = 40; // yards
const FIELD_HEIGHT = 110; // yards
const ENDZONE_DEPTH = 20; // yards
const SCALE = 8; // pixels per yard
const REACTION_DELAY = 0.25; // seconds

const Field: React.FC<FieldProps> = ({ 
  players, mode, selectedPlayerId, onFieldClick, onUpdatePlayer, 
  onAddPathPoint, onSelectPlayer, animationTime, force
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (animationTime !== null) return;
    const coords = getCoordinates(e);
    if (!coords) return;
    const target = e.target as SVGElement;
    const playerId = target.closest('[data-player-id]')?.getAttribute('data-player-id');
    if (playerId) {
      onSelectPlayer(playerId);
      if (mode === InteractionMode.SELECT) { setIsDragging(true); setActivePlayerId(playerId); }
    } else { onFieldClick(coords.x, coords.y); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (animationTime !== null || !isDragging || !activePlayerId) return;
    const coords = getCoordinates(e);
    if (coords && mode === InteractionMode.SELECT) onUpdatePlayer(activePlayerId, coords.x, coords.y);
  };

  const handleMouseUp = () => { setIsDragging(false); setActivePlayerId(null); };

  const calculatePositionAtTime = (startX: number, startY: number, path: Point[], time: number, topSpeed: number, acc: number): Point => {
    if (path.length === 0 || time <= 0) return { x: startX, y: startY };
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
    let tRem = time;
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
    if (player.path.length > 0) return calculatePositionAtTime(player.x, player.y, player.path, animationTime, player.speed, player.acceleration);
    if (player.team === 'defense') {
      const targetId = defensiveAssignments[player.id];
      const targetOffense = players.find(p => p.id === targetId);
      if (targetOffense) {
        const delayedTime = Math.max(0, animationTime - REACTION_DELAY);
        const targetPosAtDelayedTime = calculatePositionAtTime(targetOffense.x, targetOffense.y, targetOffense.path, delayedTime, targetOffense.speed, targetOffense.acceleration);
        return { x: player.x + (targetPosAtDelayedTime.x - targetOffense.x), y: player.y + (targetPosAtDelayedTime.y - targetOffense.y) };
      }
    }
    return { x: player.x, y: player.y };
  };

  const w = FIELD_WIDTH * SCALE, h = FIELD_HEIGHT * SCALE, ez = ENDZONE_DEPTH * SCALE;

  return (
    <div className={`flex items-center gap-6 select-none ${animationTime !== null ? 'pointer-events-none' : ''}`}>
      <div className="flex-shrink-0">
        <div className="px-0.5 py-10 rounded-full border border-slate-700/50 text-slate-500 text-[10px] font-bold tracking-[0.5em] uppercase" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>HOME SIDELINE</div>
      </div>
      <div className="flex flex-col items-center">
        <div className="relative shadow-2xl ring-1 ring-slate-800 rounded-sm">
          <svg ref={svgRef} width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="bg-emerald-900 overflow-visible cursor-crosshair touch-none" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <rect width={w} height={h} fill="#065f46" />
            <rect x="0" y="0" width={w} height={h} fill="none" stroke="white" strokeWidth="2" />
            <line x1="0" y1={ez} x2={w} y2={ez} stroke="white" strokeWidth="2" />
            <line x1="0" y1={h - ez} x2={w} y2={h - ez} stroke="white" strokeWidth="2" />
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
              return (
                <g key={player.id} data-player-id={player.id} transform={`translate(${pos.x * SCALE}, ${pos.y * SCALE})`} className="cursor-pointer group">
                  <circle cx="0" cy="0" r={1.2 * SCALE} fill={player.team === 'offense' ? '#2563eb' : '#dc2626'} stroke={selectedPlayerId === player.id && !animationTime ? 'white' : 'rgba(255,255,255,0.2)'} strokeWidth={selectedPlayerId === player.id && !animationTime ? "3" : "1"} />
                  {player.hasDisc && <g transform={`translate(${1.2 * SCALE}, ${-1.2 * SCALE})`}><circle r={0.6 * SCALE} fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" /></g>}
                  <text x="0" y="1" textAnchor="middle" fill="white" fontSize={0.8 * SCALE} fontWeight="bold" pointerEvents="none" className="font-mono">{player.label}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="flex-shrink-0"><div className="px-0.5 py-10 rounded-full border border-slate-700/50 text-slate-500 text-[10px] font-bold tracking-[0.5em] uppercase" style={{ writingMode: 'vertical-lr' }}>AWAY SIDELINE</div></div>
    </div>
  );
};

export default Field;
