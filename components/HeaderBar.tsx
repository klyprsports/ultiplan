import React, { useState } from 'react';
import { Menu, Users, LogOut, LogIn, BookOpen, UserRound, Sparkles, Share2, ChevronLeft, Play as PlayIcon, Pause as PauseIcon, Square, RotateCcw } from 'lucide-react';
import { User } from 'firebase/auth';
import { signInWithGoogle, signOutUser } from '../services/auth';

interface HeaderBarProps {
  onBackToPlaybook?: () => void;
  onManageTeams: () => void;
  onManageAccount?: () => void;
  onStartTour?: () => void;
  onShareApp?: () => void;
  onOpenAuth?: () => void;
  sublabel?: string;
  sequenceLabel?: string;
  sequencePlays?: Array<{ id: string; name: string }>;
  currentPlayId?: string | null;
  onOpenSequencePlay?: (playId: string) => void;
  animationState?: 'IDLE' | 'PLAYING' | 'PAUSED';
  animationTime?: number;
  onStartAnimation?: () => void;
  onStartSequence?: () => void;
  canStartSequence?: boolean;
  startSequenceReason?: string;
  onTogglePause?: () => void;
  onStopAnimation?: () => void;
  onResetAnimation?: () => void;
  hasPlayers?: boolean;
  user: User | null;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onBackToPlaybook,
  onManageTeams,
  onManageAccount,
  onStartTour,
  onShareApp,
  onOpenAuth,
  sublabel,
  sequenceLabel,
  sequencePlays = [],
  currentPlayId,
  onOpenSequencePlay,
  animationState,
  animationTime = 0,
  onStartAnimation,
  onStartSequence,
  canStartSequence = false,
  startSequenceReason = '',
  onTogglePause,
  onStopAnimation,
  onResetAnimation,
  hasPlayers = false,
  user
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSignedIn = Boolean(user && !user.isAnonymous);
  const isAnimationActive = animationState === 'PLAYING' || animationState === 'PAUSED';
  const showPlaybackControls = typeof animationState !== 'undefined';

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 shadow-lg z-10">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-slate-950 rounded-lg flex items-center justify-center shadow-indigo-500/10 shadow-sm overflow-hidden">
          <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight text-white">Ultiplan</div>
          {sublabel && (
            <div className="text-[10px] text-slate-400 flex items-center gap-2">
              <BookOpen size={12} className="text-emerald-400" />
              {sublabel}
            </div>
          )}
          {sequenceLabel && (
            <div className="text-[10px] text-indigo-300/90 truncate max-w-[420px]" title={sequenceLabel}>
              {sequenceLabel}
            </div>
          )}
        </div>
        {onBackToPlaybook && (
          <>
            <div className="h-6 w-px bg-slate-700/70 ml-1 mr-2" aria-hidden="true" />
            <button
              onClick={onBackToPlaybook}
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ChevronLeft size={12} />
              Playbook
            </button>
          </>
        )}
        {sequencePlays.length > 1 && (
          <div className="ml-2 flex items-center gap-1.5 max-w-[520px] overflow-x-auto pb-0.5">
            {sequencePlays.map((play, idx) => {
              const isCurrent = currentPlayId === play.id;
              return (
                <button
                  key={`${play.id}-${idx}`}
                  type="button"
                  onClick={() => onOpenSequencePlay?.(play.id)}
                  disabled={isCurrent}
                  className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors ${
                    isCurrent
                      ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-200'
                      : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                  title={play.name}
                >
                  {idx + 1}. {play.name}
                </button>
              );
            })}
          </div>
        )}
        {showPlaybackControls && (
          <div className="ml-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1">
            <div className="px-1">
              <span className="text-[8px] font-bold text-slate-500 uppercase leading-none tracking-widest">Clock</span>
              <div className={`text-sm font-mono font-bold leading-none tabular-nums ${animationState === 'PLAYING' ? 'text-emerald-400' : 'text-slate-300'}`}>
                {animationTime.toFixed(1)}<span className="text-[9px] ml-0.5 opacity-60 font-sans">s</span>
              </div>
            </div>
            {!isAnimationActive ? (
              <>
                <button
                  onClick={onStartAnimation}
                  disabled={!hasPlayers}
                  data-tour-id="run-button"
                  className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                  <PlayIcon size={12} fill="white" />
                  Run
                </button>
                <button
                  onClick={onStartSequence}
                  disabled={!hasPlayers || !canStartSequence}
                  title={startSequenceReason}
                  className="px-2.5 py-1.5 rounded-md text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all"
                >
                  Run Sequence
                </button>
                <button
                  onClick={onResetAnimation}
                  disabled={!hasPlayers || animationTime === 0}
                  className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onTogglePause}
                  className="w-7 h-7 rounded-md bg-amber-600 hover:bg-amber-500 flex items-center justify-center transition-all"
                >
                  {animationState === 'PLAYING' ? <PauseIcon size={14} fill="white" /> : <PlayIcon size={14} fill="white" />}
                </button>
                <button
                  onClick={onStopAnimation}
                  className="w-7 h-7 rounded-md bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all"
                >
                  <Square size={14} fill="white" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || user.email || 'User'} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 rounded-full bg-slate-800 text-[10px] font-bold text-slate-200 flex items-center justify-center">
                {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-slate-200 max-w-[140px] truncate">
              {user.displayName || user.email || 'Google user'}
            </span>
          </div>
        )}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="w-10 h-10 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-200 flex items-center justify-center shadow-sm transition-colors"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50 overflow-hidden">
              {onShareApp && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onShareApp();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Share2 size={14} />
                  Share Ultiplan
                </button>
              )}
              {isSignedIn && onStartTour && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onStartTour();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <Sparkles size={14} />
                  Start Tour
                </button>
              )}
              {isSignedIn && onManageAccount && (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onManageAccount();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <UserRound size={14} />
                  Manage Account
                </button>
              )}
              <button
                onClick={() => {
                  setIsMenuOpen(false);
                  onManageTeams();
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Users size={14} />
                Manage Teams
              </button>
              <div className="border-t border-slate-800/70" />
              {isSignedIn ? (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    signOutUser().catch((error) => console.error('Failed to sign out', error));
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-red-300 hover:bg-slate-800"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onOpenAuth) {
                      onOpenAuth();
                    } else {
                      signInWithGoogle().catch((error) => console.error('Failed to sign in', error));
                    }
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  <LogIn size={14} />
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default HeaderBar;
