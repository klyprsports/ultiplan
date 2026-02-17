import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: () => void;
  isDeleting?: boolean;
  error?: string | null;
  userEmail?: string | null;
}

const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onConfirmDelete,
  isDeleting = false,
  error,
  userEmail
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-base font-bold flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            Manage Account
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {userEmail && (
            <div className="text-xs text-slate-400">
              Signed in as <span className="text-slate-200">{userEmail}</span>
            </div>
          )}
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Deleting your account permanently removes your plays. This cannot be undone.
          </div>
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={onConfirmDelete}
              className="flex-1 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-red-500 text-red-50 hover:bg-red-400 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
