import { Play, Player, Force } from '../types';

export const PLAY_STORAGE_KEY = 'ultiplan_saved_plays_v1';
export const PENDING_SELECTION_KEY = 'ultiplan_pending_selection_v1';
export const PENDING_MANAGE_TEAMS_KEY = 'ultiplan_pending_manage_teams_v1';
export const PENDING_CONCEPT_DRAFT_KEY = 'ultiplan_pending_concept_draft_v1';
const ONBOARDING_SEEN_PREFIX = 'ultiplan_onboarding_seen_v1_';
const PENDING_TOUR_KEY = 'ultiplan_onboarding_pending_tour_v1';

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

export type PendingSelection =
  | { type: 'play'; id: string }
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

export const setPendingConceptDraft = (name: string) => {
  localStorage.setItem(PENDING_CONCEPT_DRAFT_KEY, name);
};

export const clearPendingConceptDraft = () => {
  localStorage.removeItem(PENDING_CONCEPT_DRAFT_KEY);
};

export const consumePendingConceptDraft = () => {
  const value = localStorage.getItem(PENDING_CONCEPT_DRAFT_KEY);
  if (value !== null) {
    localStorage.removeItem(PENDING_CONCEPT_DRAFT_KEY);
  }
  return value;
};

export const hasSeenOnboarding = (uid: string) =>
  localStorage.getItem(`${ONBOARDING_SEEN_PREFIX}${uid}`) === 'true';

export const setSeenOnboarding = (uid: string) => {
  localStorage.setItem(`${ONBOARDING_SEEN_PREFIX}${uid}`, 'true');
};

export const setPendingTour = () => {
  localStorage.setItem(PENDING_TOUR_KEY, 'true');
};

export const consumePendingTour = () => {
  const pending = localStorage.getItem(PENDING_TOUR_KEY) === 'true';
  if (pending) {
    localStorage.removeItem(PENDING_TOUR_KEY);
  }
  return pending;
};

export const clearPlaybookStorage = () => {
  localStorage.removeItem(PLAY_STORAGE_KEY);
  localStorage.removeItem(PENDING_SELECTION_KEY);
  localStorage.removeItem(PENDING_MANAGE_TEAMS_KEY);
  localStorage.removeItem(PENDING_CONCEPT_DRAFT_KEY);
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
      pathStartOffset: p.pathStartOffset ?? 0,
      path: p.path.map(pt => ({ x: pt.x, y: pt.y }))
    }))
    .sort((a, b) => {
      if (a.team !== b.team) return a.team.localeCompare(b.team);
      return a.label.localeCompare(b.label);
    });
};

export const normalizePlay = (play: {
  name: string;
  conceptId?: string;
  conceptName?: string;
  force: Force;
  description: string;
  players: Player[];
  visibility?: 'private' | 'team' | 'public';
  sharedTeamIds?: string[];
  throws?: { id: string; throwerId: string; receiverId: string; releaseTime: number; angle: number; power: string }[];
}) => ({
  name: play.name.trim(),
  conceptId: play.conceptId?.trim() || '',
  conceptName: play.conceptName?.trim() || '',
  force: play.force,
  description: play.description.trim(),
  players: normalizePlayPlayers(play.players),
  visibility: play.visibility ?? 'private',
  sharedTeamIds: [...(play.sharedTeamIds ?? [])].sort(),
  throws: [...(play.throws ?? [])]
    .map((t) => ({
      id: t.id,
      throwerId: t.throwerId,
      receiverId: t.receiverId,
      releaseTime: t.releaseTime,
      angle: t.angle,
      power: t.power
    }))
    .sort((a, b) => a.releaseTime - b.releaseTime)
});
