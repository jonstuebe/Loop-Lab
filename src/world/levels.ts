import type { Block, World } from './world';

export type Vec3Tuple = readonly [number, number, number];

/** What a level's builder hands back to the game after creating geometry. */
export interface LevelSetup {
  /** Feet position of the player at spawn. */
  spawn: Vec3Tuple;
  yaw: number;
  /** Centre of the exit pad, at floor level. */
  goal: Vec3Tuple;
  /** Centre of the cube, if the level has one. */
  cube?: Vec3Tuple;
  /** Floor position of the pressure button, if any. */
  button?: Vec3Tuple;
  /** Block that slides open while the button is pressed. */
  door?: Block;
}

export interface LevelDef {
  name: string;
  hint: string;
  build(world: World): LevelSetup;
}

export const LEVELS: readonly LevelDef[] = [
  {
    name: 'Elevation',
    hint: 'The exit sits on the high ledge. Aim one portal high on the cream wall above the ledge, the other on the cream wall behind you, then walk through.',
    build(w) {
      w.room(-6, 6, 0, 9, -8, 8, { floor: 'metal', ceil: 'metal', xn: 'metal', xp: 'metal', zn: 'white' });
      w.block(-6, 0, 3, 6, 4.5, 8, 'metal');
      w.block(-7, 0, 8, 7, 4.5, 9, 'metal');
      w.block(-7, 4.5, 8, 7, 9, 9, 'white');
      return { spawn: [0, 0, -5], yaw: Math.PI, goal: [0, 4.5, 6.4] };
    },
  },
  {
    name: 'Payload',
    hint: 'The door stays open only while something heavy sits on the red button. There’s a cube on the high platform. Press E (or Grab) to pick it up.',
    build(w) {
      w.room(-7, 7, 0, 6, -7, 7, { floor: 'white', ceil: 'metal', xn: 'white', xp: 'white', zp: 'metal' });
      // wall with a doorway
      w.block(-8, 0, -8, -1, 6, -7, 'metal');
      w.block(1, 0, -8, 8, 6, -7, 'metal');
      w.block(-1, 2.6, -8, 1, 6, -7, 'metal');
      const door = w.block(-1, 0, -7.85, 1, 2.6, -7.15, 'door');
      // exit corridor
      w.block(-2, -1, -13, 2, 0, -8, 'metal');
      w.block(-2, 2.6, -13, 2, 3.6, -8, 'metal', true);
      w.block(-2, 0, -13, -1, 2.6, -8, 'metal');
      w.block(1, 0, -13, 2, 2.6, -8, 'metal');
      w.block(-2, 0, -13, 2, 2.6, -12, 'metal');
      // cube platform
      w.block(3, 0, 3, 7, 3, 7, 'metal');
      return { spawn: [-4, 0, 4], yaw: -Math.PI / 4, goal: [0, 0, -10.4], cube: [5, 3.36, 5], button: [-3, 0, -2], door };
    },
  },
  {
    name: 'Momentum',
    hint: 'Speed in, speed out. Turn around: the cream wall behind you can launch you. Put the other portal on the pit floor and step off the edge.',
    build(w) {
      w.block(-5, -14, -5, 5, 0, 0, 'metal'); // starting ledge
      w.block(-5, 0, -5, 5, 1.5, -4, 'metal');
      w.block(-5, 1.5, -5, 5, 9, -4, 'white');
      w.block(-6, -15, -5, 6, -14, 22, 'white'); // pit floor
      w.block(-6, -14, -5, -5, 9, 22, 'metal');
      w.block(5, -14, -5, 6, 9, 22, 'metal');
      w.block(-5, -14, 12, 5, -6, 21, 'metal'); // exit plateau
      w.block(-6, -14, 21, 6, 9, 22, 'metal');
      w.block(-6, 9, -5, 6, 10, 22, 'metal', true);
      return { spawn: [0, 0, -2], yaw: Math.PI, goal: [0, -6, 18] };
    },
  },
];
