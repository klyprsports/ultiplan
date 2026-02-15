
import React, { useState } from 'react';
import { Player } from '../types';
import { 
  BookOpen, 
  Edit2, 
  Check, 
  ChevronRight,
  Info,
  Trash2,
  Eraser,
  Undo2,
  Disc,
  Gauge,
  Activity,
  Wind,
  Play as PlayIcon,
  Pause as PauseIcon,
  Square,
  RotateCcw
} from 'lucide-react';

interface ThrowControlsState {
  isOpen: boolean;
  isSelectingReceiver: boolean;
  throwDraft: { throwerId: string; receiverId: string | null; releaseTime: number; angle: number; power: 'soft' | 'medium' | 'hard' } | null;
  maxReleaseTime: number;
  onToggle: (isOpen: boolean) => void;
  onEdit: (throwId: string) => void;
  onSelectReceiver: () => void;
  onClearReceiver: () => void;
  onReleaseTimeChange: (value: number) => void;
  onAngleChange: (value: number) => void;
  onPowerChange: (value: 'soft' | 'medium' | 'hard') => void;
  onConfirm: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

interface SidebarProps {
  description: string;
  onUpdateDescription: (desc: string) => void;
  players: Player[];
  throws: { id: string; throwerId: string; receiverId: string; releaseTime: number; angle: number; power: 'soft' | 'medium' | 'hard' }[];
  selectedPlayerId: string | null;
  onDeletePlayer: (id: string) => void;
  onClearPath: (id: string) => void;
  onUndoPathPoint: (id: string) => void;
  onAssignDisc: (id: string) => void;
  throwControls: ThrowControlsState;
  onUpdateSpeed?: (id: string, speed: number) => void;
  onUpdateAcceleration?: (id: string, acc: number) => void;
  onUpdatePathStartOffset?: (id: string, offset: number) => void;
  onUpdateRole?: (id: string, role: 'handler' | 'cutter') => void;
  onUpdateCutterDefense?: (id: string, cutterDefense: 'under' | 'deep') => void;
  isPlaying: boolean;
  animationState: 'IDLE' | 'PLAYING' | 'PAUSED';
  animationTime: number;
  onStartAnimation: () => void;
  onTogglePause: () => void;
  onStopAnimation: () => void;
  onResetAnimation: () => void;
  hasPlayers: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  description, onUpdateDescription,
  players, throws, selectedPlayerId, onDeletePlayer, onClearPath,
  onUndoPathPoint, onAssignDisc, throwControls, onUpdateSpeed, onUpdateAcceleration, onUpdatePathStartOffset,
  onUpdateRole, onUpdateCutterDefense, isPlaying,
  animationState, animationTime, onStartAnimation, onTogglePause, onStopAnimation, onResetAnimation, hasPlayers
}) => {
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const selectedPlayer = players.find(p => p.id === selectedPlayerId);
  const isAnimationActive = animationState !== 'IDLE';
  const coveredOffense = selectedPlayer?.coversOffenseId
    ? players.find(p => p.id === selectedPlayer.coversOffenseId)
    : undefined;

  // Enhanced Markdown-lite formatter
  const formatMarkdown = (text: string) => {
    if (!text) return <span className="text-slate-500 italic">No tactical notes provided. Click edit to begin.</span>;
    
    const lines = text.split('\n');

    const processInline = (line: string): (string | React.ReactElement)[] => {
      let elements: (string | React.ReactElement)[] = [line];

      // Bold: **text**
      elements = elements.flatMap(el => {
        if (typeof el !== 'string') return el;
        const parts = el.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, i) => 
          part.startsWith('**') && part.endsWith('**') 
            ? <strong key={`b-${i}`} className="text-white font-extrabold">{part.slice(2, -2)}</strong> 
            : part
        );
      });

      // Italic: *text*
      elements = elements.flatMap(el => {
        if (typeof el !== 'string') return el;
        const parts = el.split(/(\*.*?\*)/g);
        return parts.map((part, i) => 
          part.startsWith('*') && part.endsWith('*') 
            ? <em key={`i-${i}`} className="text-slate-300 italic">{part.slice(1, -1)}</em> 
            : part
        );
      });

      return elements;
    };

    return lines.map((line, i) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return <div key={i} className="h-2" />;

      // Headers: #, ##, ###
      if (trimmedLine.startsWith('### ')) {
        return <h5 key={i} className="text-sm font-bold text-indigo-300 mt-4 mb-1 uppercase tracking-wider">{processInline(trimmedLine.slice(4))}</h5>;
      }
      if (trimmedLine.startsWith('## ')) {
        return <h4 key={i} className="text-base font-bold text-slate-100 mt-5 mb-2 border-b border-slate-800 pb-1">{processInline(trimmedLine.slice(3))}</h4>;
      }
      if (trimmedLine.startsWith('# ')) {
        return <h3 key={i} className="text-lg font-black text-white mt-6 mb-3">{processInline(trimmedLine.slice(2))}</h3>;
      }

      // Lists: - or *
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        return (
          <div key={i} className="flex gap-2 items-start mb-1.5 ml-1">
            <ChevronRight size={12} className="mt-1 shrink-0 text-indigo-500" />
            <div className="text-slate-300 text-xs leading-relaxed">
              {processInline(trimmedLine.slice(2))}
            </div>
          </div>
        );
      }

      // Normal paragraph
      return (
        <p key={i} className="text-slate-300 text-xs leading-relaxed mb-2">
          {processInline(line)}
        </p>
      );
    });
  };

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 h-full overflow-hidden">
      <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-slate-500 uppercase leading-none mb-1 tracking-widest">Play Clock</span>
              <div className={`text-xl font-mono font-bold leading-none tabular-nums ${animationState === 'PLAYING' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {animationTime.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50 font-sans">s</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isAnimationActive ? (
                <>
                  <button onClick={onStartAnimation} disabled={!hasPlayers} data-tour-id="run-button" className="px-4 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"><PlayIcon size={14} fill="white" /> Run</button>
                  <button onClick={onResetAnimation} disabled={!hasPlayers || animationTime === 0} className="w-8 h-8 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50"><RotateCcw size={14} /></button>
                </>
              ) : (
                <>
                  <button onClick={onTogglePause} className="w-8 h-8 rounded-md bg-amber-600 hover:bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-900/20 transition-all">{animationState === 'PLAYING' ? <PauseIcon size={16} fill="white" /> : <PlayIcon size={16} fill="white" />}</button>
                  <button onClick={onStopAnimation} className="w-8 h-8 rounded-md bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-900/20 transition-all"><Square size={16} fill="white" /></button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3" data-tour-id="tactical-notes">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <BookOpen size={14} /> Tactical Notes
          </h3>
          <button 
            onClick={() => setIsEditingNotes(!isEditingNotes)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all shadow-sm ${
              isEditingNotes 
                ? 'bg-indigo-600 text-white hover:bg-indigo-500' 
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
            }`}
          >
            {isEditingNotes ? (
              <><Check size={12} /> Format & Save</>
            ) : (
              <><Edit2 size={12} /> Edit Notes</>
            )}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/40 rounded-xl border border-slate-800/50 p-4 shadow-inner">
          {isEditingNotes ? (
            <textarea
              autoFocus
              value={description}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  setIsEditingNotes(false);
                }
              }}
              onChange={(e) => onUpdateDescription(e.target.value)}
              placeholder="# Strategy Name&#10;## Objectives&#10;- Primary look is deep&#10;- Clear to break side"
              className="w-full h-full min-h-[300px] bg-transparent text-xs text-slate-300 leading-relaxed focus:outline-none resize-none placeholder:text-slate-700 font-mono"
            />
          ) : (
            <div className="text-xs space-y-1">
              {formatMarkdown(description)}
            </div>
          )}
        </div>
        {isEditingNotes && (
          <div className="mt-2 text-[9px] text-slate-600 font-mono text-right italic">
            Cmd+Enter to save
          </div>
        )}
      </div>
      <div className={`border-t border-slate-800 p-5 overflow-y-auto custom-scrollbar transition-opacity ${isPlaying ? 'opacity-40 grayscale' : 'opacity-100'}`} data-tour-id="selection-details">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2"><Info size={14} /> Selection Details</h3>
        {selectedPlayer ? (
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${selectedPlayer.team === 'offense' ? 'bg-blue-600' : 'bg-red-600'}`}>{selectedPlayer.label}</div>
                <div className="font-bold capitalize text-slate-100">{selectedPlayer.team} Player</div>
              </div>
            </div>
            <div className="space-y-4 pt-2 border-t border-slate-700/50">
              {throws.length > 0 && selectedPlayer.team === 'offense' && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Throws</div>
                  <div className="mt-2 space-y-1 text-xs text-slate-200">
                    {throws
                      .filter((t) => t.throwerId === selectedPlayer.id || t.receiverId === selectedPlayer.id)
                      .map((t) => {
                        const thrower = players.find((p) => p.id === t.throwerId);
                        const receiver = players.find((p) => p.id === t.receiverId);
                        const role = t.throwerId === selectedPlayer.id ? 'Throw' : 'Catch';
                        return (
                          <div key={t.id} className="flex items-center justify-between">
                            <span>{role}: {thrower?.label} → {receiver?.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400 font-mono">{t.releaseTime.toFixed(1)}s</span>
                              {t.throwerId === selectedPlayer.id && (
                                <button
                                  onClick={() => throwControls.onEdit(t.id)}
                                  className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {throws.filter((t) => t.throwerId === selectedPlayer.id || t.receiverId === selectedPlayer.id).length === 0 && (
                      <div className="text-[10px] text-slate-500">No throws for this player.</div>
                    )}
                  </div>
                </div>
              )}
              {selectedPlayer.team === 'offense' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onUpdateRole?.(selectedPlayer.id, 'handler')}
                      disabled={isPlaying}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors border ${selectedPlayer.role === 'handler' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    >
                      Handler
                    </button>
                    <button
                      onClick={() => onUpdateRole?.(selectedPlayer.id, 'cutter')}
                      disabled={isPlaying}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors border ${selectedPlayer.role !== 'handler' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    >
                      Cutter
                    </button>
                  </div>
                </div>
              )}
              {selectedPlayer.team === 'defense' && coveredOffense?.role === 'cutter' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cutter Coverage</label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onUpdateCutterDefense?.(selectedPlayer.id, 'under')}
                      disabled={isPlaying}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors border ${selectedPlayer.cutterDefense !== 'deep' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    >
                      Under
                    </button>
                    <button
                      onClick={() => onUpdateCutterDefense?.(selectedPlayer.id, 'deep')}
                      disabled={isPlaying}
                      className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors border ${selectedPlayer.cutterDefense === 'deep' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                    >
                      Deep
                    </button>
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Gauge size={12} /> Top Speed</label><span className="text-xs font-mono text-indigo-400 font-bold">{(selectedPlayer.speed).toFixed(1)} yd/s</span></div>
                <input type="range" min="2" max="13" step="0.5" value={selectedPlayer.speed} onChange={(e) => onUpdateSpeed?.(selectedPlayer.id, parseFloat(e.target.value))} disabled={isPlaying} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Activity size={12} /> Explosiveness</label><span className="text-xs font-mono text-indigo-400 font-bold">{(selectedPlayer.acceleration).toFixed(1)} yd/s²</span></div>
                <input type="range" min="1" max="15" step="0.5" value={selectedPlayer.acceleration} onChange={(e) => onUpdateAcceleration?.(selectedPlayer.id, parseFloat(e.target.value))} disabled={isPlaying} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
              </div>
              {selectedPlayer.team === 'offense' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">Route Start</label>
                    <span className="text-xs font-mono text-indigo-400 font-bold">{(selectedPlayer.pathStartOffset ?? 0).toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="4"
                    step="0.1"
                    value={selectedPlayer.pathStartOffset ?? 0}
                    onChange={(e) => onUpdatePathStartOffset?.(selectedPlayer.id, parseFloat(e.target.value))}
                    disabled={isPlaying}
                    className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 mt-4">
              {selectedPlayer.team === 'offense' && (
                <>
                  <div data-tour-id="throw-controls" className="space-y-2">
                    {!selectedPlayer.hasDisc && (
                      <button onClick={() => onAssignDisc(selectedPlayer.id)} disabled={isPlaying} className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors border bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600"><Disc size={14} /> Give Disc</button>
                    )}
                    {selectedPlayer.hasDisc && !throws.some((t) => t.throwerId === selectedPlayer.id) && (
                      <button
                        onClick={() => {
                          throwControls.onToggle(true);
                        }}
                        disabled={isPlaying}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-indigo-600 text-white border border-indigo-500 hover:bg-indigo-500"
                      >
                        <Disc size={14} /> Throw Disc
                      </button>
                    )}
                    {selectedPlayer.hasDisc && throwControls.isOpen && (
                      <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3 space-y-3">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500">Receiver</div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-200">
                            {throwControls.throwDraft?.receiverId
                              ? `Receiver set: ${players.find((p) => p.id === throwControls.throwDraft?.receiverId)?.label ?? ''}`
                              : throwControls.isSelectingReceiver
                                ? 'Click a receiver on the field...'
                                : 'No receiver selected'}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={throwControls.onSelectReceiver}
                              className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700"
                            >
                              {throwControls.throwDraft?.receiverId ? 'Change' : 'Select'}
                            </button>
                            {throwControls.throwDraft?.receiverId && (
                              <button
                                onClick={throwControls.onClearReceiver}
                                className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Release Time</div>
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="range"
                              min={0}
                              max={Math.max(0, throwControls.maxReleaseTime)}
                              step={0.1}
                              value={throwControls.throwDraft?.releaseTime ?? 0}
                              onChange={(e) => throwControls.onReleaseTimeChange(parseFloat(e.target.value))}
                              className="w-full accent-emerald-400"
                            />
                            <div className="text-[10px] text-slate-200 font-mono w-10 text-right">
                              {(throwControls.throwDraft?.releaseTime ?? 0).toFixed(1)}s
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Throw Angle</div>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.1}
                            value={throwControls.throwDraft?.angle ?? 0}
                            onChange={(e) => throwControls.onAngleChange(parseFloat(e.target.value))}
                            className="mt-1 w-full accent-emerald-400"
                          />
                          <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-slate-500">
                            <span>IO</span>
                            <span>Flat</span>
                            <span>OI</span>
                          </div>
                        </div>

                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-slate-500">Power</div>
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={1}
                            value={throwControls.throwDraft?.power === 'soft' ? 0 : throwControls.throwDraft?.power === 'medium' ? 1 : 2}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              throwControls.onPowerChange(val === 0 ? 'soft' : val === 1 ? 'medium' : 'hard');
                            }}
                            className="mt-1 w-full accent-emerald-400"
                          />
                          <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-slate-500">
                            <span>Soft</span>
                            <span>Medium</span>
                            <span>Hard</span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={throwControls.onCancel}
                            className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={throwControls.onConfirm}
                            disabled={!throwControls.throwDraft?.receiverId}
                            className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {throwControls.isEditing ? 'Save Throw' : 'Add Throw'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onUndoPathPoint(selectedPlayer.id)} disabled={selectedPlayer.path.length === 0 || isPlaying} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600"><Undo2 size={14} /> Undo</button>
                    <button onClick={() => onClearPath(selectedPlayer.id)} disabled={selectedPlayer.path.length === 0 || isPlaying} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600"><Eraser size={14} /> Clear</button>
                  </div>
                </>
              )}
              <button onClick={() => onDeletePlayer(selectedPlayer.id)} disabled={isPlaying} className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-red-900/20 text-red-400 border border-red-900/30 hover:bg-red-900/30"><Trash2 size={14} /> Delete</button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 px-4 bg-slate-800/30 rounded-lg border border-dashed border-slate-700 text-slate-500 italic text-sm">Select a player to edit details.</div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
