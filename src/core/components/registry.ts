import type { ComponentDef } from '../types';
import { board, panel, roundLeg, shelf, straightLeg, taperedLeg } from './primitives';
import { coffeeTable, consoleTable, diningTable, sideTable } from './table';
import { coastalEndTable } from './coastalendtable';
import { bookcase } from './bookcase';
import { cabinet } from './cabinet';
import { displayStand } from './displaystand';
import { dresser } from './dresser';
import { storageTower } from './tower';
import { wineCube } from './winecube';
import { drawerBox } from './drawerbox';
import { drawerUnit } from './drawerunit';
import { bench, stool } from './seating';
import { wallShelf } from './wallshelf';
import { spiceRack } from './spicerack';

const ALL: ComponentDef[] = [
  diningTable,
  coffeeTable,
  consoleTable,
  sideTable,
  coastalEndTable,
  bench,
  stool,
  bookcase,
  cabinet,
  dresser,
  storageTower,
  wineCube,
  displayStand,
  wallShelf,
  spiceRack,
  drawerBox,
  drawerUnit,
  taperedLeg,
  straightLeg,
  roundLeg,
  board,
  panel,
  shelf,
];

export const REGISTRY: Record<string, ComponentDef> = Object.fromEntries(
  ALL.map((d) => [d.id, d]),
);

export const CATEGORIES: { name: string; components: ComponentDef[] }[] = [
  { name: 'Tables', components: [diningTable, coffeeTable, consoleTable, sideTable, coastalEndTable] },
  { name: 'Seating', components: [bench, stool] },
  { name: 'Storage', components: [bookcase, cabinet, dresser, storageTower, wineCube, displayStand] },
  { name: 'Wall-mounted', components: [wallShelf, spiceRack] },
  { name: 'Drawers', components: [drawerBox, drawerUnit] },
  { name: 'Legs', components: [taperedLeg, straightLeg, roundLeg] },
  { name: 'Boards & panels', components: [board, panel, shelf] },
];
