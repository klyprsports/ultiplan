import React, { useState } from 'react';
import {
  Library,
  Menu
} from 'lucide-react';

interface HeaderBarProps {
  onOpenPlaybook: () => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onOpenPlaybook
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0 shadow-lg z-10">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-slate-950 rounded-lg flex items-center justify-center shadow-indigo-500/10 shadow-sm overflow-hidden">
          <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
        </div>
        <div className="text-lg font-bold tracking-tight text-white">Ultiplan</div>
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
