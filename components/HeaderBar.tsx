import React, { useState } from 'react';
import { Menu, Users, LogOut, LogIn, BookOpen, UserRound, Sparkles, Share2 } from 'lucide-react';
import { User } from 'firebase/auth';
import { signInWithGoogle, signOutUser } from '../services/auth';

interface HeaderBarProps {
  onManageTeams: () => void;
  onManageAccount?: () => void;
  onStartTour?: () => void;
  onShareApp?: () => void;
  onOpenAuth?: () => void;
  sublabel?: string;
  user: User | null;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onManageTeams,
  onManageAccount,
  onStartTour,
  onShareApp,
  onOpenAuth,
  sublabel,
  user
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isSignedIn = Boolean(user && !user.isAnonymous);

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
        </div>
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
