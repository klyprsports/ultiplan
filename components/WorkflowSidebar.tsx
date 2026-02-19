import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { InteractionMode, Player, Force } from '../types';

interface WorkflowSidebarProps {
  players: Player[];
  mode: InteractionMode;
  isAnimationActive: boolean;
  isStartLocked: boolean;
  activeFormation: 'vertical' | 'side' | 'ho' | 'custom' | null;
  setActiveFormation: (formation: 'vertical' | 'side' | 'ho' | 'custom' | null) => void;
  setMode: (mode: InteractionMode) => void;
  playName: string;
  onPlayNameChange: (name: string) => void;
  force: Force;
  onForceChange: (force: Force) => void;
  onApplyPresetFormation: (formation: 'vertical' | 'side' | 'ho') => void;
  onCreateCustomFormation: () => void;
  onAutoAssignDefense: () => void;
  onSavePlay: (name?: string) => void;
  canSavePlay: boolean;
  playSaveReason: string;
  saveStatus: 'idle' | 'saving' | 'saved';
  onBuildNextPlay: () => void;
  canBuildNextPlay: boolean;
  buildNextPlayReason: string;
  onBuildPreviousPlay: () => void;
  canBuildPreviousPlay: boolean;
  buildPreviousPlayReason: string;
  onUnlinkSequence: () => void;
  canUnlinkSequence: boolean;
  unlinkSequenceReason: string;
  maxPlayersPerTeam: number;
  usedOffenseLabels: number[];
  usedDefenseLabels: number[];
  draggingToken: { team: 'offense' | 'defense'; labelNum: number } | null;
  onTokenDragStart: (team: 'offense' | 'defense', labelNum: number) => void;
  onTokenDragEnd: () => void;
}

const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
  players,
  mode,
  isAnimationActive,
  isStartLocked,
  activeFormation,
  setActiveFormation,
  setMode,
  playName,
  onPlayNameChange,
  force,
  onForceChange,
  onApplyPresetFormation,
  onCreateCustomFormation,
  onAutoAssignDefense,
  onSavePlay,
  canSavePlay,
  playSaveReason,
  saveStatus,
  onBuildNextPlay,
  canBuildNextPlay,
  buildNextPlayReason,
  onBuildPreviousPlay,
  canBuildPreviousPlay,
  buildPreviousPlayReason,
  onUnlinkSequence,
  canUnlinkSequence,
  unlinkSequenceReason,
  maxPlayersPerTeam,
  usedOffenseLabels,
  usedDefenseLabels,
  draggingToken,
  onTokenDragStart,
  onTokenDragEnd
}) => {
  const [showFormationMenu, setShowFormationMenu] = useState(false);
  const offenseCount = players.filter(p => p.team === 'offense').length;
  const sectionClass = "rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3";
  const sectionTitle = "text-[11px] font-bold uppercase tracking-[0.26em] text-slate-400";
  const sectionLabel = "text-[10px] uppercase tracking-[0.24em] text-slate-500";
  const controlClass = "mt-2 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-emerald-500/30";
  const buttonClass = "w-full flex items-center justify-between gap-2 bg-slate-900/70 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 px-3 py-2 rounded-lg text-[11px] font-semibold tracking-wide transition-all";
  const segmentBase = "px-2 py-1.5 rounded-md transition-all text-[11px] font-bold tracking-wide";

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col py-4 px-4 gap-4 shrink-0 z-10 shadow-2xl overflow-y-auto custom-scrollbar">
      {isStartLocked && (
        <div className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[10px] text-indigo-200 uppercase tracking-[0.26em]">
          Sequence play - start positions locked
        </div>
      )}
      <div className={sectionClass} data-tour-id="workflow-play">
        <div className={sectionTitle}>Play</div>
        <input
          type="text"
          value={playName}
          onChange={(e) => onPlayNameChange(e.target.value)}
          className={controlClass}
          placeholder="Enter Play Name"
        />
      </div>

      <div className={sectionClass} data-tour-id="workflow-offense">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Step 1 · Offense</h3>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className={sectionLabel}>Add Players Manually</div>
          {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).length > 0 && (
            <div className="flex flex-nowrap gap-1 overflow-x-auto pb-1">
              {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).map(labelNum => {
                const isUsed = usedOffenseLabels.includes(labelNum);
                const isDragging = draggingToken?.team === 'offense' && draggingToken.labelNum === labelNum;
                return (
                <div
                  key={labelNum}
                  draggable={!isAnimationActive && !isStartLocked && !isUsed}
                  onDragStart={(e) => {
                    const payload = `offense:${labelNum}`;
                    e.dataTransfer.setData('application/x-ultiplan-player', payload);
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.setData('text', payload);
                    e.dataTransfer.effectAllowed = 'copy';
                    onTokenDragStart('offense', labelNum);
                  }}
                  onDragEnd={() => onTokenDragEnd()}
                  className={`w-5 h-5 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow-sm border border-blue-400/60 ${isUsed || isDragging || isStartLocked ? 'bg-blue-900/40 text-blue-200/60 cursor-not-allowed' : 'bg-blue-600 cursor-grab active:cursor-grabbing'}`}
                  title={`Drag O${labelNum} to the field`}
                >
                  O{labelNum}
                </div>
              );
              })}
            </div>
          )}
          <div className="text-[9px] text-slate-500 uppercase tracking-[0.3em] text-center">Or</div>
          <div className="relative">
            <button
              onClick={() => setShowFormationMenu(prev => !prev)}
              disabled={isAnimationActive || isStartLocked}
              className={buttonClass}
            >
              <span className="flex items-center gap-2">Select starting setup</span>
            </button>
            {showFormationMenu && (
              <div className="absolute left-0 mt-2 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50">
                <button
                  onClick={() => { onApplyPresetFormation('vertical'); setActiveFormation('vertical'); setShowFormationMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Vertical stack
                </button>
                <button
                  onClick={() => { onApplyPresetFormation('side'); setActiveFormation('side'); setShowFormationMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Side stack (break)
                </button>
                <button
                  onClick={() => { onApplyPresetFormation('ho'); setActiveFormation('ho'); setShowFormationMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Ho stack
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                  onClick={() => { onCreateCustomFormation(); setShowFormationMenu(false); }}
                  disabled={isStartLocked}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-slate-800 rounded-lg disabled:text-slate-600 disabled:hover:bg-transparent"
                >
                  Create new formation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={sectionClass} data-tour-id="workflow-force">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Step 2 · Force</h3>
        </div>
        <div className="mt-3">
          <div className={sectionLabel}>Force Direction</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => onForceChange('home')} className={`${segmentBase} ${force === 'home' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>HOME</button>
            <button onClick={() => onForceChange('away')} className={`${segmentBase} ${force === 'away' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>AWAY</button>
          </div>
        </div>
      </div>

      <div className={sectionClass} data-tour-id="workflow-defense">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Step 3 · Defense</h3>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className={sectionLabel}>Add Players Manually</div>
          {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).length > 0 && (
            <div className="flex flex-nowrap gap-1 overflow-x-auto pb-1">
              {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).map(labelNum => {
                const isUsed = usedDefenseLabels.includes(labelNum);
                const isDragging = draggingToken?.team === 'defense' && draggingToken.labelNum === labelNum;
                return (
                <div
                  key={labelNum}
                  draggable={!isAnimationActive && !isStartLocked && !isUsed}
                  onDragStart={(e) => {
                    const payload = `defense:${labelNum}`;
                    e.dataTransfer.setData('application/x-ultiplan-player', payload);
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.setData('text', payload);
                    e.dataTransfer.effectAllowed = 'copy';
                    onTokenDragStart('defense', labelNum);
                  }}
                  onDragEnd={() => onTokenDragEnd()}
                  className={`w-5 h-5 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow-sm border border-red-400/60 ${isUsed || isDragging || isStartLocked ? 'bg-red-900/40 text-red-200/60 cursor-not-allowed' : 'bg-red-600 cursor-grab active:cursor-grabbing'}`}
                  title={`Drag D${labelNum} to the field`}
                >
                  D{labelNum}
                </div>
              );
              })}
            </div>
          )}
          <div className="text-[9px] text-slate-500 uppercase tracking-[0.3em] text-center">Or</div>
          <button onClick={onAutoAssignDefense} disabled={isAnimationActive || offenseCount === 0 || isStartLocked} className={buttonClass}>
            <ShieldAlert size={14} className="text-red-400" /> Auto-Assign Defense
          </button>
        </div>
      </div>

      <div className={sectionClass} data-tour-id="workflow-draw">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Step 4 · Draw Routes</h3>
        </div>
        <p className="mt-2 text-[10px] text-slate-500 leading-relaxed">
          Select any player and click on the field to define routes.
        </p>
      </div>

      <div className="mt-auto">
        <div className={`${sectionClass} flex flex-col gap-2`} data-tour-id="workflow-save">
          <button
            onClick={() => onSavePlay()}
            disabled={!canSavePlay || saveStatus === 'saving'}
            title={playSaveReason || 'Save current play'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors text-[10px] font-bold tracking-widest uppercase bg-emerald-500/90 hover:bg-emerald-400 text-emerald-950 border-emerald-500/60 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Play'}
          </button>
          <button
            onClick={onBuildNextPlay}
            disabled={!canBuildNextPlay}
            title={buildNextPlayReason || 'Build the next play in this sequence'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors text-[10px] font-bold tracking-widest uppercase bg-indigo-500/90 hover:bg-indigo-400 text-indigo-950 border-indigo-500/60 disabled:opacity-50"
          >
            Create Next Play in Sequence
          </button>
          <button
            onClick={onBuildPreviousPlay}
            disabled={!canBuildPreviousPlay}
            title={buildPreviousPlayReason || 'Create a previous play step and link this play after it'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors text-[10px] font-bold tracking-widest uppercase bg-slate-700 hover:bg-slate-600 text-slate-100 border-slate-600 disabled:opacity-50"
          >
            Create Previous Play
          </button>
          <button
            onClick={onUnlinkSequence}
            disabled={!canUnlinkSequence}
            title={unlinkSequenceReason || 'Unlink this play from its previous sequence step'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-colors text-[10px] font-bold tracking-widest uppercase bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 disabled:opacity-50"
          >
            Unlink from Sequence
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowSidebar;
