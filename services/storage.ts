import { Play, Formation, Player, Force } from '../types';

export const PLAY_STORAGE_KEY = 'ultiplan_saved_plays_v1';
export const FORMATION_STORAGE_KEY = 'ultiplan_saved_formations_v1';
export const PENDING_SELECTION_KEY = 'ultiplan_pending_selection_v1';
export const PENDING_MANAGE_TEAMS_KEY = 'ultiplan_pending_manage_teams_v1';

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

export type PendingSelection =
  | { type: 'play'; id: string }
  | { type: 'formation'; id: string }
  | { type: 'new-play' };

export const loadPendingSelection = (): PendingSelection | null => {
  const saved = localStorage.getItem(PENDING_SELECTION_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as PendingSelection;
  } catch (e) {
    console.error('Failed to load pending selection', e);
    return null;
  }
};

export const setPendingSelection = (selection: PendingSelection) => {
  localStorage.setItem(PENDING_SELECTION_KEY, JSON.stringify(selection));
};

export const clearPendingSelection = () => {
  localStorage.removeItem(PENDING_SELECTION_KEY);
};

export const setPendingManageTeams = () => {
  localStorage.setItem(PENDING_MANAGE_TEAMS_KEY, 'true');
};

export const loadPendingManageTeams = () => localStorage.getItem(PENDING_MANAGE_TEAMS_KEY) === 'true';

export const clearPendingManageTeams = () => {
  localStorage.removeItem(PENDING_MANAGE_TEAMS_KEY);
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

export const normalizePlay = (play: {
  name: string;
  force: Force;
  description: string;
  players: Player[];
  visibility?: 'private' | 'team' | 'public';
  sharedTeamIds?: string[];
}) => ({
  name: play.name.trim(),
  force: play.force,
  description: play.description.trim(),
  players: normalizePlayPlayers(play.players),
  visibility: play.visibility ?? 'private',
  sharedTeamIds: [...(play.sharedTeamIds ?? [])].sort()
});
