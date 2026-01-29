import React, { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { InteractionMode, Player, Formation, Force } from '../types';

interface WorkflowSidebarProps {
  players: Player[];
  mode: InteractionMode;
  isAnimationActive: boolean;
  activeFormation: 'vertical' | 'side' | 'ho' | 'custom' | null;
  setActiveFormation: (formation: 'vertical' | 'side' | 'ho' | 'custom' | null) => void;
  setMode: (mode: InteractionMode) => void;
  playName: string;
  onPlayNameChange: (name: string) => void;
  force: Force;
  onForceChange: (force: Force) => void;
  savedFormations: Formation[];
  onLoadFormation: (formation: Formation) => void;
  onApplyPresetFormation: (formation: 'vertical' | 'side' | 'ho') => void;
  onCreateCustomFormation: () => void;
  onOpenSaveFormationModal: () => void;
  hasUnsavedFormation: boolean;
  onSaveFormation: () => void;
  canSaveFormation: boolean;
  formationSaveReason: string;
  onAutoAssignDefense: () => void;
  onSavePlay: (name?: string) => void;
  canSavePlay: boolean;
  playSaveReason: string;
  saveStatus: 'idle' | 'saving' | 'saved';
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
  activeFormation,
  setActiveFormation,
  setMode,
  playName,
  onPlayNameChange,
  force,
  onForceChange,
  savedFormations,
  onLoadFormation,
  onApplyPresetFormation,
  onCreateCustomFormation,
  onOpenSaveFormationModal,
  hasUnsavedFormation,
  onSaveFormation,
  canSaveFormation,
  formationSaveReason,
  onAutoAssignDefense,
  onSavePlay,
  canSavePlay,
  playSaveReason,
  saveStatus,
  maxPlayersPerTeam,
  usedOffenseLabels,
  usedDefenseLabels,
  draggingToken,
  onTokenDragStart,
  onTokenDragEnd
}) => {
  const [showFormationMenu, setShowFormationMenu] = useState(false);
  const offenseCount = players.filter(p => p.team === 'offense').length;

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-5 gap-6 shrink-0 z-10 shadow-2xl overflow-y-auto custom-scrollbar">
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Play Name</div>
        <input
          type="text"
          value={playName}
          onChange={(e) => onPlayNameChange(e.target.value)}
          className="mt-2 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          placeholder="Enter Play Name"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 1 · Set Up Offense</h3>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="text-[9px] text-slate-500 uppercase tracking-widest">Add Players on O Manually</div>
          {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).map(labelNum => {
                const isUsed = usedOffenseLabels.includes(labelNum);
                const isDragging = draggingToken?.team === 'offense' && draggingToken.labelNum === labelNum;
                return (
                <div
                  key={labelNum}
                  draggable={!isAnimationActive && !isUsed}
                  onDragStart={(e) => {
                    const payload = `offense:${labelNum}`;
                    e.dataTransfer.setData('application/x-ultiplan-player', payload);
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.setData('text', payload);
                    e.dataTransfer.effectAllowed = 'copy';
                    onTokenDragStart('offense', labelNum);
                  }}
                  onDragEnd={() => onTokenDragEnd()}
                  className={`w-5 h-5 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow-sm border border-blue-400/60 ${isUsed || isDragging ? 'bg-blue-900/40 text-blue-200/60 cursor-not-allowed' : 'bg-blue-600 cursor-grab active:cursor-grabbing'}`}
                  title={`Drag O${labelNum} to the field`}
                >
                  O{labelNum}
                </div>
              );
              })}
            </div>
          )}
          <div className="text-[9px] text-slate-500 uppercase tracking-widest text-center">Or</div>
          <div className="relative">
            <button
              onClick={() => setShowFormationMenu(prev => !prev)}
              disabled={isAnimationActive}
              className="w-full flex items-center justify-between gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 px-3 py-2 rounded-md text-xs font-medium transition-all shadow-sm"
            >
              <span className="flex items-center gap-2">Select from existing formation</span>
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
                <div className="px-4 py-2 text-[9px] uppercase tracking-widest text-slate-500">Saved formations</div>
                {savedFormations.length === 0 ? (
                  <div className="px-4 pb-2 text-[10px] text-slate-600 italic">No saved formations yet.</div>
                ) : (
                  savedFormations.slice(0, 6).map(f => (
                    <button
                      key={f.id}
                      onClick={() => { onLoadFormation(f); setShowFormationMenu(false); }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                    >
                      {f.name}
                    </button>
                  ))
                )}
                <button
                  onClick={() => { onOpenSaveFormationModal(); setShowFormationMenu(false); }}
                  disabled={players.length === 0 || !hasUnsavedFormation}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
                >
                  Save current formation...
                </button>
                <div className="h-px bg-slate-800 my-1" />
                <button
                  onClick={() => { onCreateCustomFormation(); setShowFormationMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-emerald-300 hover:bg-slate-800 rounded-lg"
                >
                  Create new formation
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="w-full h-px bg-slate-800" />

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 2 · Choose Force</h3>
        </div>
        <div className="mt-3 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold shadow-inner">
          <div className="text-slate-500 uppercase tracking-widest mb-2">Force</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onForceChange('home')} className={`px-2 py-1 rounded transition-all ${force === 'home' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>HOME</button>
            <button onClick={() => onForceChange('away')} className={`px-2 py-1 rounded transition-all ${force === 'away' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>AWAY</button>
          </div>
        </div>
      </div>

      <div className="w-full h-px bg-slate-800" />

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 3 · Set up Defense</h3>
        </div>
        <div className="mt-2 text-[9px] text-slate-500 uppercase tracking-widest">Add players on D Manually</div>
        <div className="mt-2 flex flex-col gap-3">
          {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: maxPlayersPerTeam }, (_, i) => i + 1).map(labelNum => {
                const isUsed = usedDefenseLabels.includes(labelNum);
                const isDragging = draggingToken?.team === 'defense' && draggingToken.labelNum === labelNum;
                return (
                <div
                  key={labelNum}
                  draggable={!isAnimationActive && !isUsed}
                  onDragStart={(e) => {
                    const payload = `defense:${labelNum}`;
                    e.dataTransfer.setData('application/x-ultiplan-player', payload);
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.setData('text', payload);
                    e.dataTransfer.effectAllowed = 'copy';
                    onTokenDragStart('defense', labelNum);
                  }}
                  onDragEnd={() => onTokenDragEnd()}
                  className={`w-5 h-5 rounded-full text-white text-[8px] font-bold flex items-center justify-center shadow-sm border border-red-400/60 ${isUsed || isDragging ? 'bg-red-900/40 text-red-200/60 cursor-not-allowed' : 'bg-red-600 cursor-grab active:cursor-grabbing'}`}
                  title={`Drag D${labelNum} to the field`}
                >
                  D{labelNum}
                </div>
              );
              })}
            </div>
          )}
          <div className="text-[9px] text-slate-500 uppercase tracking-widest text-center">Or</div>
          <button onClick={onAutoAssignDefense} disabled={isAnimationActive || offenseCount === 0} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 px-3 py-2 rounded-md text-xs font-bold transition-all shadow-sm">
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

      <div className="mt-auto pt-6 border-t border-slate-800">
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveFormation}
            disabled={!canSaveFormation}
            title={formationSaveReason || 'Save current formation'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors text-[10px] font-bold tracking-widest uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 disabled:opacity-50"
          >
            Save Formation
          </button>
          <button
            onClick={() => onSavePlay()}
            disabled={!canSavePlay || saveStatus === 'saving'}
            title={playSaveReason || 'Save current play'}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border transition-colors text-[10px] font-bold tracking-widest uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save Play'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowSidebar;
