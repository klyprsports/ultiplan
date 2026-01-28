import React, { useState } from 'react';
import { Users, ChevronRight, ShieldAlert } from 'lucide-react';
import { InteractionMode, Player, Formation, Force } from '../types';

interface WorkflowSidebarProps {
  players: Player[];
  mode: InteractionMode;
  isAnimationActive: boolean;
  activeFormation: 'vertical' | 'side' | 'ho' | 'custom' | null;
  setActiveFormation: (formation: 'vertical' | 'side' | 'ho' | 'custom' | null) => void;
  setMode: (mode: InteractionMode) => void;
  force: Force;
  onForceChange: (force: Force) => void;
  savedFormations: Formation[];
  onLoadFormation: (formation: Formation) => void;
  onApplyPresetFormation: (formation: 'vertical' | 'side' | 'ho') => void;
  onCreateCustomFormation: () => void;
  onOpenSaveFormationModal: () => void;
  hasUnsavedFormation: boolean;
  onAutoAssignDefense: () => void;
  maxPlayersPerTeam: number;
}

const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
  players,
  mode,
  isAnimationActive,
  activeFormation,
  setActiveFormation,
  setMode,
  force,
  onForceChange,
  savedFormations,
  onLoadFormation,
  onApplyPresetFormation,
  onCreateCustomFormation,
  onOpenSaveFormationModal,
  hasUnsavedFormation,
  onAutoAssignDefense,
  maxPlayersPerTeam
}) => {
  const [showFormationMenu, setShowFormationMenu] = useState(false);
  const offenseCount = players.filter(p => p.team === 'offense').length;
  const defenseCount = players.filter(p => p.team === 'defense').length;

  return (
    <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-5 gap-6 shrink-0 z-10 shadow-2xl overflow-y-auto custom-scrollbar">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 1 · Set Up Offense</h3>
          <span className="text-[9px] text-slate-600 font-mono">{offenseCount}/{maxPlayersPerTeam} O</span>
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

          {activeFormation === 'custom' && offenseCount < maxPlayersPerTeam && (
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
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 2 · Choose Force</h3>
        </div>
        <div className="mt-3 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700 text-[10px] font-bold shadow-inner">
          <div className="text-slate-500 uppercase tracking-widest mb-2">Force</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onForceChange('home')} className={`px-2 py-1 rounded transition-all ${force === 'home' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>HOME</button>
            <button onClick={() => onForceChange('away')} className={`px-2 py-1 rounded transition-all ${force === 'away' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>AWAY</button>
            <button onClick={() => onForceChange('middle')} className={`px-2 py-1 rounded transition-all ${force === 'middle' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>MIDDLE</button>
            <button onClick={() => onForceChange('sideline')} className={`px-2 py-1 rounded transition-all ${force === 'sideline' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 bg-slate-900/40'}`}>SIDE</button>
          </div>
        </div>
      </div>

      {activeFormation && (
        <>
          <div className="w-full h-px bg-slate-800" />

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Step 3 · Add Defenders</h3>
              <span className="text-[9px] text-slate-600 font-mono">{defenseCount}/{maxPlayersPerTeam} D</span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <button onClick={() => setMode(InteractionMode.ADD_DEFENSE)} disabled={isAnimationActive || defenseCount >= maxPlayersPerTeam} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border ${mode === InteractionMode.ADD_DEFENSE ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}>
                <Users size={14} className="text-red-300" /> Add D
              </button>
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
        </>
      )}
    </div>
  );
};

export default WorkflowSidebar;
