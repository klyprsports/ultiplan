import React, { useRef, useState } from 'react';
import {
  Play as PlayIcon,
  Pause as PauseIcon,
  Square,
  Library,
  Edit3,
  Menu
} from 'lucide-react';

type AnimationState = 'IDLE' | 'PLAYING' | 'PAUSED';

interface HeaderBarProps {
  playName: string;
  onPlayNameChange: (name: string) => void;
  onOpenPlaybook: () => void;
  animationState: AnimationState;
  animationTime: number;
  onStartAnimation: () => void;
  onTogglePause: () => void;
  onStopAnimation: () => void;
  hasPlayers: boolean;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  playName,
  onPlayNameChange,
  onOpenPlaybook,
  animationState,
  animationTime,
  onStartAnimation,
  onTogglePause,
  onStopAnimation,
  hasPlayers
}) => {
  const playNameInputRef = useRef<HTMLInputElement>(null);
  const isAnimationActive = animationState !== 'IDLE';
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 shadow-lg z-10">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-slate-950 rounded-lg flex items-center justify-center shadow-indigo-500/10 shadow-sm overflow-hidden">
          <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1 group">
            <input 
              ref={playNameInputRef}
              type="text" 
              value={playName} 
              onChange={(e) => onPlayNameChange(e.target.value)} 
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
        </div>
        <div className="flex items-center gap-1.5 ml-3 border-l border-slate-800 pl-3">
          <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-bold text-slate-500 uppercase leading-none mb-1 tracking-widest">Play Clock</span>
              <div className={`text-xl font-mono font-bold leading-none tabular-nums ${animationState === 'PLAYING' ? 'text-emerald-400' : 'text-slate-400'}`}>
                {animationTime.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50 font-sans">s</span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isAnimationActive ? (
                <button onClick={onStartAnimation} disabled={!hasPlayers} className="px-4 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"><PlayIcon size={14} fill="white" /> Run</button>
              ) : (
                <>
                  <button onClick={onTogglePause} className="w-8 h-8 rounded-md bg-amber-600 hover:bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-900/20 transition-all">{animationState === 'PLAYING' ? <PauseIcon size={16} fill="white" /> : <PlayIcon size={16} fill="white" />}</button>
                  <button onClick={onStopAnimation} className="w-8 h-8 rounded-md bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-900/20 transition-all"><Square size={16} fill="white" /></button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-200 flex items-center justify-center shadow-sm transition-colors"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50">
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenPlaybook();
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Library size={14} />
                Playbook
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
