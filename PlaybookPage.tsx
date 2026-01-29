import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2, ArrowLeft, BookOpen, LayoutGrid } from 'lucide-react';
import { Formation, Play, Player } from './types';
import {
  loadFormationsFromStorage,
  loadPlaysFromStorage,
  saveFormationsToStorage,
  savePlaysToStorage,
  setPendingSelection
} from './services/storage';

const FIELD_WIDTH = 40;
const FIELD_HEIGHT = 110;
const ENDZONE_DEPTH = 20;

const MiniField: React.FC<{ players: Player[]; showPaths?: boolean }> = ({ players, showPaths = false }) => {
  const viewBox = `0 0 ${FIELD_WIDTH} ${FIELD_HEIGHT}`;
  const endzoneTop = ENDZONE_DEPTH;
  const endzoneBottom = FIELD_HEIGHT - ENDZONE_DEPTH;

  const yardLines = useMemo(
    () => Array.from({ length: Math.floor(FIELD_HEIGHT / 10) + 1 }, (_, i) => i * 10)
      .filter((yard) => yard > ENDZONE_DEPTH && yard < FIELD_HEIGHT - ENDZONE_DEPTH),
    []
  );

  return (
    <svg viewBox={viewBox} className="w-full h-40 rounded-lg overflow-hidden bg-slate-950">
      <rect width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="#065f46" />
      <rect x="0" y="0" width={FIELD_WIDTH} height={FIELD_HEIGHT} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      <line x1="0" y1={endzoneTop} x2={FIELD_WIDTH} y2={endzoneTop} stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      <line x1="0" y1={endzoneBottom} x2={FIELD_WIDTH} y2={endzoneBottom} stroke="rgba(255,255,255,0.5)" strokeWidth="0.4" />
      {yardLines.map((yard) => (
        <line
          key={`yard-${yard}`}
          x1="0"
          y1={yard}
          x2={FIELD_WIDTH}
          y2={yard}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.3"
        />
      ))}
      {showPaths && players.map((player) => {
        const pts = [{ x: player.x, y: player.y }, ...player.path];
        if (pts.length <= 1) return null;
        return (
          <polyline
            key={`path-${player.id}`}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={player.team === 'offense' ? '#60a5fa' : '#f87171'}
            strokeWidth="0.35"
            strokeDasharray="2 1"
            opacity="0.8"
          />
        );
      })}
      {players.map((player) => (
        <g key={player.id} transform={`translate(${player.x}, ${player.y})`}>
          <circle
            r={1.4}
            fill={player.team === 'offense' ? '#2563eb' : '#dc2626'}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="0.2"
          />
          {player.hasDisc && (
            <circle
              cx={1.4}
              cy={-1.4}
              r={0.6}
              fill="#f8fafc"
              stroke="#94a3b8"
              strokeWidth="0.2"
            />
          )}
        </g>
      ))}
    </svg>
  );
};

const PlaybookPage: React.FC = () => {
  const [tab, setTab] = useState<'plays' | 'formations'>('plays');
  const [savedPlays, setSavedPlays] = useState<Play[]>([]);
  const [savedFormations, setSavedFormations] = useState<Formation[]>([]);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  useEffect(() => {
    setSavedPlays(loadPlaysFromStorage());
    setSavedFormations(loadFormationsFromStorage());
  }, []);

  useEffect(() => {
    savePlaysToStorage(savedPlays);
  }, [savedPlays]);

  useEffect(() => {
    saveFormationsToStorage(savedFormations);
  }, [savedFormations]);

  const deletePlay = (id: string) => {
    setSavedPlays((prev) => prev.filter((p) => p.id !== id));
  };

  const deleteFormation = (id: string) => {
    setSavedFormations((prev) => prev.filter((f) => f.id !== id));
  };

  const openPlay = (id: string) => {
    setPendingSelection({ type: 'play', id });
    navigate('/builder');
  };

  const openFormation = (id: string) => {
    setPendingSelection({ type: 'formation', id });
    navigate('/builder');
  };

  const createNewPlay = () => {
    setPendingSelection({ type: 'new-play' });
    navigate('/builder');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-950 rounded-lg flex items-center justify-center shadow-indigo-500/10 shadow-sm overflow-hidden">
            <img src="/icons/ultiplay-icon.png" alt="Ultiplan icon" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight flex items-center gap-2">
              <BookOpen size={16} className="text-emerald-400" />
              Playbook
            </div>
            <div className="text-[10px] text-slate-400">Saved plays and formations</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300"
          >
            Home
          </button>
          <button
            onClick={() => navigate('/builder')}
            className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30 flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            Builder
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Your playbook</h1>
            <p className="text-sm text-slate-400">Browse saved plays and formations, then open them in the builder.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={createNewPlay}
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400 shadow-lg shadow-emerald-500/30"
            >
              New Play
            </button>
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl p-1 text-[11px] font-bold uppercase tracking-widest">
              <button
                onClick={() => setTab('plays')}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 ${tab === 'plays' ? 'bg-emerald-500 text-emerald-950' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <LayoutGrid size={14} /> Plays
              </button>
              <button
                onClick={() => setTab('formations')}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 ${tab === 'formations' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Formations
              </button>
            </div>
          </div>
        </div>

        {tab === 'plays' && (
          <section className="mt-8">
            {savedPlays.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic">No plays saved yet.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {savedPlays.map((play) => (
                  <div key={play.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
                    <MiniField players={play.players} showPaths />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">{play.name}</h3>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">
                          {play.players.length} Players · {play.force} Force
                        </div>
                      </div>
                      <button
                        onClick={() => deletePlay(play.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        aria-label="Delete play"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <button
                      onClick={() => openPlay(play.id)}
                      className="w-full py-2 rounded-xl bg-emerald-500 text-emerald-950 font-bold uppercase tracking-widest text-xs hover:bg-emerald-400 transition-colors"
                    >
                      Open in Builder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'formations' && (
          <section className="mt-8">
            {savedFormations.length === 0 ? (
              <div className="py-16 text-center text-slate-500 italic">No formations saved yet.</div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {savedFormations.map((formation) => (
                  <div key={formation.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-lg">
                    <MiniField players={formation.players} />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold text-slate-100">{formation.name}</h3>
                        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">
                          {formation.players.filter((p) => p.team === 'offense').length} O · {formation.players.filter((p) => p.team === 'defense').length} D
                        </div>
                      </div>
                      <button
                        onClick={() => deleteFormation(formation.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                        aria-label="Delete formation"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <button
                      onClick={() => openFormation(formation.id)}
                      className="w-full py-2 rounded-xl bg-indigo-500 text-white font-bold uppercase tracking-widest text-xs hover:bg-indigo-400 transition-colors"
                    >
                      Open in Builder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default PlaybookPage;
