
export type Team = 'offense' | 'defense';
export type Force = 'home' | 'away' | 'middle' | 'sideline';

export interface Point {
  x: number;
  y: number;
}

export interface Player {
  id: string;
  team: Team;
  x: number;
  y: number;
  label: string;
  path: Point[];
  speed: number; // Max speed in yards per second
  acceleration: number; // Acceleration in yards per second squared
  hasDisc?: boolean;
  role?: 'handler' | 'cutter';
  autoAssigned?: boolean;
  coversOffenseId?: string;
  cutterDefense?: 'under' | 'deep';
}

export interface Play {
  id: string;
  name: string;
  players: Player[];
  force: Force;
  description: string;
}

export interface Formation {
  id: string;
  name: string;
  players: Player[];
}

export enum InteractionMode {
  SELECT = 'SELECT',
  DRAW = 'DRAW',
  ADD_OFFENSE = 'ADD_OFFENSE',
  ADD_DEFENSE = 'ADD_DEFENSE',
  ERASE = 'ERASE'
}
