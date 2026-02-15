
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
  pathStartOffset?: number;
  speed: number; // Max speed in yards per second
  acceleration: number; // Acceleration in yards per second squared
  hasDisc?: boolean;
  role?: 'handler' | 'cutter';
  autoAssigned?: boolean;
  coversOffenseId?: string;
  cutterDefense?: 'under' | 'deep';
}

export type ThrowPower = 'soft' | 'medium' | 'hard';

export interface ThrowEvent {
  id: string;
  throwerId: string;
  receiverId: string;
  releaseTime: number;
  angle: number; // -1 (IO) to 1 (OI)
  power: ThrowPower;
}

export interface Play {
  id: string;
  ownerId?: string;
  name: string;
  players: Player[];
  force: Force;
  description: string;
  throws?: ThrowEvent[];
  visibility?: 'private' | 'team' | 'public';
  sharedTeamIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  lastEditedBy?: string;
  sourcePlayId?: string;
  startFromPlayId?: string;
  startLocked?: boolean;
}

export interface Formation {
  id: string;
  ownerId?: string;
  name: string;
  players: Player[];
  visibility?: 'private' | 'team' | 'public';
  sharedTeamIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  lastEditedBy?: string;
  sourceFormationId?: string;
}

export interface TeamInfo {
  id: string;
  name: string;
  ownerId: string;
}

export enum InteractionMode {
  SELECT = 'SELECT',
  DRAW = 'DRAW',
  ADD_OFFENSE = 'ADD_OFFENSE',
  ADD_DEFENSE = 'ADD_DEFENSE',
  ERASE = 'ERASE'
}
