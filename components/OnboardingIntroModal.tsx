import React from 'react';
import { Sparkles, X } from 'lucide-react';

interface OnboardingIntroModalProps {
  isOpen: boolean;
  onStart: () => void;
  onClose: () => void;
}

const OnboardingIntroModal: React.FC<OnboardingIntroModalProps> = ({
  isOpen,
  onStart,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-400" />
            Welcome to Ultiplan
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300">
            Want a quick tour? We’ll show you where to add players, draw routes, and save your play.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
            >
              Not now
            </button>
            <button
              onClick={onStart}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            >
              Start Tour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingIntroModal;
