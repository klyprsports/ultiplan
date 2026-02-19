import React from 'react';
import type { User } from 'firebase/auth';
import { signInWithGoogle, signOutUser } from './services/auth';

type LandingPageProps = {
  user: User | null;
  redirectPath?: string;
};

const LandingPage: React.FC<LandingPageProps> = ({ user, redirectPath }) => {
  const isSignedIn = Boolean(user && !user.isAnonymous);

  const handleSignIn = async () => {
    await signInWithGoogle();
    const destination = redirectPath || '/playbook';
    window.location.assign(destination);
  };

  const handleOpenApp = () => {
    const destination = redirectPath || '/playbook';
    window.location.assign(destination);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="relative">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(1200px 600px at 20% 10%, rgba(14, 116, 144, 0.25), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(74, 222, 128, 0.18), transparent 55%), linear-gradient(180deg, rgba(2,6,23,1) 0%, rgba(3,7,18,1) 60%, rgba(2,6,23,1) 100%)'
          }}
        />
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(148,163,184,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative">
          <header className="mx-auto max-w-6xl px-6 pt-8">
            <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 shadow-xl shadow-slate-950/40 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-slate-950 ring-1 ring-emerald-400/30 flex items-center justify-center overflow-hidden">
                  <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
                </div>
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-slate-400">Ultiplan</div>
                  <div className="text-xs text-slate-500">Ultimate playbook builder</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href="https://github.com/klyprsports/ultiplan"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] text-emerald-300/80 hover:text-emerald-200 transition-colors"
                >
                  <img
                    src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
                    alt="GitHub"
                    className="h-5 w-5 rounded-full bg-slate-700"
                  />
                  Open Source on GitHub
                </a>
                {isSignedIn ? (
                  <button
                    type="button"
                    onClick={handleOpenApp}
                    className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                  >
                    Open App
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                  >
                    Sign in with Google
                  </button>
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-6 pb-24">
            <section className="pt-16 pb-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.35em] text-emerald-200">
                  Built for the Ultimate nerd
                </div>
                <h1
                  className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-slate-50"
                  style={{ fontFamily: '"Space Grotesk", "Trebuchet MS", sans-serif' }}
                >
                  Design, animate, and share elite ultimate frisbee plays.
                </h1>
                <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-xl">
                  Ultiplan is a free, open-source playbook for mapping offensive sets, drawing cuts, and visualizing timing in seconds.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                {isSignedIn ? (
                  <button
                      type="button"
                      onClick={handleOpenApp}
                      className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-[0.3em] bg-emerald-500 text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                    >
                      Enter Playbook
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSignIn}
                      className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold uppercase tracking-[0.3em] bg-emerald-500 text-emerald-950 shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transition-colors"
                    >
                      Sign in to Start
                    </button>
                  )}
                  <a
                    href="https://github.com/klyprsports/ultiplan"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 uppercase tracking-[0.35em] hover:text-emerald-200 transition-colors"
                  >
                    <img
                      src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
                      alt="GitHub"
                      className="h-5 w-5 rounded-full bg-slate-700"
                    />
                    Open Source • View on GitHub
                  </a>
                </div>
                {isSignedIn && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <div className="rounded-xl border border-slate-800/70 bg-slate-950/70 px-3 py-2">
                      Signed in as <span className="text-slate-200">{user.displayName || user.email || 'Google user'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={signOutUser}
                      className="text-[10px] uppercase tracking-[0.35em] text-slate-400 hover:text-emerald-200 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
                <div className="mt-10 max-w-md text-xs text-slate-400">
                  <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
                    <div className="text-emerald-300 text-lg font-semibold" style={{ fontFamily: '"Space Grotesk", "Trebuchet MS", sans-serif' }}>Live</div>
                    <div className="uppercase tracking-widest text-[10px]">timing previews</div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-tr from-emerald-500/20 via-slate-900/0 to-cyan-400/20 blur-2xl" />
                <div className="relative rounded-[28px] border border-slate-800/60 bg-slate-900/50 p-3 shadow-2xl">
                  <video
                    src="/screenshots/breakside-attack.mov"
                    poster="/screenshots/breakside-attack.png"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full rounded-[22px] border border-slate-800"
                  />
                </div>
              </div>
            </section>

            <section className="py-10">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: '"Space Grotesk", "Trebuchet MS", sans-serif' }}>
                  Everything you need, none of the clutter.
                </h2>
                <div className="hidden sm:block text-xs uppercase tracking-[0.35em] text-slate-500">Features</div>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    title: 'Preset formations',
                    copy: 'Drop a vertical, side, or ho stack and tweak roles instantly.',
                  },
                  {
                    title: 'Auto-assign defense',
                    copy: 'Auto-assign defenders to get first-pass placement easily.',
                  },
                  {
                    title: 'Play clock',
                    copy: 'Run with a play clock to spot spacing and timing issues fast.',
                  }
                ].map(feature => (
                  <div key={feature.title} className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-xl shadow-slate-950/30">
                    <div className="text-sm font-semibold text-slate-100" style={{ fontFamily: '"Space Grotesk", "Trebuchet MS", sans-serif' }}>
                      {feature.title}
                    </div>
                    <p className="mt-3 text-sm text-slate-400">{feature.copy}</p>
                  </div>
                ))}
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
