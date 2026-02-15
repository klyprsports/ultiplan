import { Force, Player } from '../types';

export const DEFAULT_SPEED = 8.5;
export const DEFAULT_ACCELERATION = 7.0;
export const FIELD_WIDTH = 40;
export const FIELD_HEIGHT = 110;
export const ENDZONE_DEPTH = 20;
export const MAX_PLAYERS_PER_TEAM = 7;

export const getDumpOffsetX = (currentForce: Force) => {
  if (currentForce === 'home') return 8;
  if (currentForce === 'away') return -8;
  if (currentForce === 'middle') return 12;
  return 0;
};

export const buildPresetFormation = (formation: 'vertical' | 'side' | 'ho', currentForce: Force, makeId: (idx: number) => string): Player[] => {
  const endzoneLine = FIELD_HEIGHT - ENDZONE_DEPTH;
  const cuttersY = [endzoneLine - 8, endzoneLine - 13, endzoneLine - 18, endzoneLine - 23, endzoneLine - 28];
  const handlersY = [endzoneLine - 2, endzoneLine - 4, endzoneLine - 6];
  let positions: { x: number; y: number }[] = [];

  if (formation === 'vertical') {
    const stackX = FIELD_WIDTH / 2;
    const dumpOffsetX = getDumpOffsetX(currentForce);
    const centerHandler = { x: stackX, y: endzoneLine - 2 };
    const dumpHandler = { x: stackX + dumpOffsetX, y: endzoneLine + 3 };
    const cutterYs = [
      endzoneLine - 12,
      endzoneLine - 16,
      endzoneLine - 20,
      endzoneLine - 24,
      endzoneLine - 28
    ];
    positions = [
      ...cutterYs.map(y => ({ x: stackX, y })),
      centerHandler,
      dumpHandler
    ];
  } else if (formation === 'side') {
    const stackX = FIELD_WIDTH - 6;
    const handlerXs = [16, 22];
    positions = [
      ...cuttersY.map(y => ({ x: stackX, y })),
      ...handlerXs.map((x, i) => ({ x, y: handlersY[i] }))
    ];
  } else if (formation === 'ho') {
    const handlerXs = [FIELD_WIDTH / 2 - 12, FIELD_WIDTH / 2, FIELD_WIDTH / 2 + 12];
    const cutterXs = [6, 14, 26, 34];
    positions = [
      ...handlerXs.map(x => ({ x, y: endzoneLine - 2 })),
      ...cutterXs.map(x => ({ x, y: endzoneLine - 20 }))
    ];
  }

  return positions.slice(0, MAX_PLAYERS_PER_TEAM).map((pos, idx) => ({
    id: makeId(idx),
    team: 'offense',
    x: pos.x,
    y: pos.y,
    label: `O${idx + 1}`,
    path: [],
    pathStartOffset: 0,
    speed: DEFAULT_SPEED,
    acceleration: DEFAULT_ACCELERATION,
    hasDisc: (formation === 'ho' && pos.y === endzoneLine - 2 && pos.x === FIELD_WIDTH / 2) || (formation === 'vertical' && idx === 5),
    role: formation === 'ho'
      ? (idx <= 2 ? 'handler' : 'cutter')
      : (idx <= 4 ? 'cutter' : 'handler')
  }));
};
