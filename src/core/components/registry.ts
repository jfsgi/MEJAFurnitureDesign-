import type { ComponentDef } from '../types';
import { board, panel, roundLeg, shelf, straightLeg, taperedLeg } from './primitives';
import { coffeeTable, consoleTable, diningTable, sideTable } from './table';
import { bookcase } from './bookcase';
import { cabinet } from './cabinet';
import { dresser } from './dresser';
import { bench, stool } from './seating';
import { wallShelf } from './wallshelf';

const ALL: ComponentDef[] = [
  diningTable,
  coffeeTable,
  consoleTable,
  sideTable,
  bench,
  stool,
  bookcase,
  cabinet,
  dresser,
  wallShelf,
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
  { name: 'Tables', components: [diningTable, coffeeTable, consoleTable, sideTable] },
  { name: 'Seating', components: [bench, stool] },
  { name: 'Storage', components: [bookcase, cabinet, dresser] },
  { name: 'Wall-mounted', components: [wallShelf] },
  { name: 'Legs', components: [taperedLeg, straightLeg, roundLeg] },
  { name: 'Boards & panels', components: [board, panel, shelf] },
];
