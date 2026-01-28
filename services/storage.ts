import { Play, Formation, Player, Force } from '../types';

export const PLAY_STORAGE_KEY = 'ultiplan_saved_plays_v1';
export const FORMATION_STORAGE_KEY = 'ultiplan_saved_formations_v1';

export const loadPlaysFromStorage = (): Play[] => {
  const saved = localStorage.getItem(PLAY_STORAGE_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as Play[];
  } catch (e) {
    console.error('Failed to load saved plays', e);
    return [];
  }
};

export const savePlaysToStorage = (plays: Play[]) => {
  localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(plays));
};

export const loadFormationsFromStorage = (): Formation[] => {
  const saved = localStorage.getItem(FORMATION_STORAGE_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as Formation[];
  } catch (e) {
    console.error('Failed to load saved formations', e);
    return [];
  }
};

export const saveFormationsToStorage = (formations: Formation[]) => {
  localStorage.setItem(FORMATION_STORAGE_KEY, JSON.stringify(formations));
};

export const normalizeFormationPlayers = (formationPlayers: Player[]) => {
  return formationPlayers
    .map(p => ({
      team: p.team,
      label: p.label,
      x: p.x,
      y: p.y,
      speed: p.speed,
      acceleration: p.acceleration,
      role: p.role ?? 'cutter',
      hasDisc: !!p.hasDisc
    }))
    .sort((a, b) => {
      if (a.team !== b.team) return a.team.localeCompare(b.team);
      return a.label.localeCompare(b.label);
    });
};

export const normalizePlayPlayers = (playPlayers: Player[]) => {
  return playPlayers
    .map(p => ({
      team: p.team,
      label: p.label,
      x: p.x,
      y: p.y,
      speed: p.speed,
      acceleration: p.acceleration,
      role: p.role ?? 'cutter',
      hasDisc: !!p.hasDisc,
      cutterDefense: p.cutterDefense ?? null,
      path: p.path.map(pt => ({ x: pt.x, y: pt.y }))
    }))
    .sort((a, b) => {
      if (a.team !== b.team) return a.team.localeCompare(b.team);
      return a.label.localeCompare(b.label);
    });
};

export const normalizePlay = (play: { name: string; force: Force; description: string; players: Player[] }) => ({
  name: play.name.trim(),
  force: play.force,
  description: play.description.trim(),
  players: normalizePlayPlayers(play.players)
});
