import type { ComponentDef } from '../types';
import { board, panel, roundLeg, shelf, straightLeg, taperedLeg } from './primitives';
import { coffeeTable, consoleTable, diningTable } from './table';
import { bookcase } from './bookcase';
import { bench } from './seating';

const ALL: ComponentDef[] = [
  diningTable,
  coffeeTable,
  consoleTable,
  bench,
  bookcase,
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
  { name: 'Tables', components: [diningTable, coffeeTable, consoleTable] },
  { name: 'Seating', components: [bench] },
  { name: 'Storage', components: [bookcase] },
  { name: 'Legs', components: [taperedLeg, straightLeg, roundLeg] },
  { name: 'Boards & panels', components: [board, panel, shelf] },
];
