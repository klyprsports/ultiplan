import React, { useState } from 'react';
import { LogIn, Mail, X } from 'lucide-react';
import { signInWithGoogle, signInWithEmailPassword, signUpWithEmailPassword, sendPasswordReset } from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    setError(null);
    setResetStatus(null);
    try {
      if (mode === 'signin') {
        await signInWithEmailPassword(email.trim(), password);
      } else {
        await signUpWithEmailPassword(email.trim(), password);
      }
      onClose();
    } catch (err) {
      const message = (err as { message?: string }).message || 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first to reset your password.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setResetStatus(null);
    try {
      await sendPasswordReset(email.trim());
      setResetStatus('Password reset email sent.');
    } catch (err) {
      const message = (err as { message?: string }).message || 'Unable to send reset email.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-base font-bold flex items-center gap-2">
            <LogIn size={16} className="text-emerald-400" />
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${
                mode === 'signin' ? 'bg-emerald-500 text-emerald-950 border-emerald-400' : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${
                mode === 'signup' ? 'bg-emerald-500 text-emerald-950 border-emerald-400' : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              Create account
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}
          {resetStatus && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {resetStatus}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !email.trim() || !password}
            className="w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
          >
            {isSubmitting ? 'Working...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {mode === 'signin' && (
            <button
              onClick={handleReset}
              disabled={isSubmitting}
              className="w-full px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
            >
              Forgot password?
            </button>
          )}

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
            <div className="flex-1 h-px bg-slate-800" />
            Or
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          <button
            onClick={() => signInWithGoogle().then(onClose).catch((err) => setError(err?.message || 'Unable to sign in.'))}
            className="w-full px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-100 text-slate-900 hover:bg-white shadow-lg"
          >
            <Mail size={14} className="inline-block mr-2" />
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
