import React, { useMemo } from 'react';
import { Link, X } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  shareUrl: string;
  onClose: () => void;
  onCopy: () => void;
  copyStatus?: string | null;
}

const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  shareUrl,
  onClose,
  onCopy,
  copyStatus
}) => {
  if (!isOpen) return null;

  const shareText = 'Check out Ultiplan for building ultimate plays.';
  const shareLinks = useMemo(() => {
    const encodedUrl = encodeURIComponent(shareUrl);
    const encodedText = encodeURIComponent(shareText);
    const encodedEmailSubject = encodeURIComponent('Ultiplan play builder');
    const encodedEmailBody = encodeURIComponent(`${shareText}\n${shareUrl}`);
    return {
      x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      email: `mailto:?subject=${encodedEmailSubject}&body=${encodedEmailBody}`,
      sms: `sms:?body=${encodeURIComponent(`${shareText} ${shareUrl}`)}`
    };
  }, [shareUrl]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Link size={16} className="text-emerald-400" />
            Share Ultiplan
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-300">
            Copy this link and share it with your friends.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={shareUrl}
              readOnly
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none"
            />
            <button
              onClick={onCopy}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
            >
              Copy
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={shareLinks.x}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 text-center"
            >
              Share on X
            </a>
            <a
              href={shareLinks.facebook}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 text-center"
            >
              Share on Facebook
            </a>
            <a
              href={shareLinks.email}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 text-center"
            >
              Share via Email
            </a>
            <a
              href={shareLinks.sms}
              className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 text-center"
            >
              Share via SMS
            </a>
          </div>
          {copyStatus && (
            <div className="text-xs text-emerald-300">{copyStatus}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
