import type { Point, Station, Tool } from './content';
import type { Game } from './game';

export interface Plot {
  tilled: boolean;
  planted: number | null;
  watered: number | null;
}

export interface World {
  cols: number;
  rows: number;
  cells: string[];
  plots: { id: number; x: number; y: number; size: number }[];
  legacyPlots: World['plots'];
  plotIds: number[];
  landmarks: { id: string; label: string; tile: Point; mark: string }[];
}

export interface Target {
  kind: 'plot' | 'resource' | 'water' | 'chest' | 'archive' | 'ruin' | 'fishing' | Station;
  id?: string | number;
  label?: string;
  tile?: Point;
  footprint?: Point[];
  points: Point[];
}

export interface FishingSpot extends Target {
  kind: 'fishing';
  tile: Point;
}

export interface Placement {
  kind: Station;
  slot?: number;
  tile: Point | null;
  allowed: boolean;
}

export interface Motion {
  step: number | null;
  facing: Point;
  progress: { done: number; total: number } | null;
  hit: { tool: 'hoe' | 'pick' | 'axe' | 'can'; point: Point; minute: number } | null;
  fishing: { tile: Point; hooked: boolean } | null;
  ripples: Point[];
  packing: { kind: Station; progress: number } | null;
}

export interface Scene {
  world: World;
  canvas: HTMLCanvasElement;
  view: { x: number; y: number; left: number; top: number; width: number; height: number };
  zoom: { level: number; scales: number[] };
  targets: Target[];
  plotTargets: Target[];
  fishingSpots: FishingSpot[];
  blocked: Set<number>;
  draw(game: Game, position: Point, hovered: Target | null, placement: Placement | null, motion: Motion): void;
  pick(x: number, y: number, tool?: Tool): Target | undefined;
  setStations(game: Game): void;
  canPlace(game: Game, kind: Station, tile: Point): boolean;
}

type CropStage = 'ground' | 'tilled' | 'seed' | 'germinating' | 'sprout' | 'seedling' | 'bulking' | 'ripe';

declare global {
  interface Window {
    LiuwanGame: {
      DAY: number;
      cropStage(game: Game, plot: Plot): CropStage;
      describeGrowth(game: Game, plot: Plot): string;
      ripeAfter: number;
      passable(world: World, blocked: Set<number>, x: number, y: number): boolean;
      routeTo(world: World, blocked: Set<number>, from: Point, destinations: Point[]): Point[] | null;
    };
    startLiuwanScene(options: {
      layout: { resources: object; saltRuin: Point };
      jobMeter: (job: import('./game').Job, minute: number) => { remaining: number; elapsed: number; duration: number };
      assetUrl: (file: string) => string;
      createControls: (scene: Scene) => void;
    }): void;
  }
}
