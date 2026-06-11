// Material library: PBR-lite definitions shared by the viewport preview and (later) mapped
// to Cycles materials on the render farm. `edge` is the part-outline tint used in the
// viewport so adjacent same-material boards stay readable.

export interface MaterialDef {
  id: string;
  name: string;
  color: string;
  edge: string;
  roughness: number;
  metalness: number;
  /** Wood species rendered with the procedural grain texture in the viewport. */
  grain?: boolean;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'walnut', name: 'Walnut', color: '#5E4736', edge: '#3E2F23', roughness: 0.55, metalness: 0, grain: true },
  { id: 'white-oak', name: 'White oak', color: '#C8A878', edge: '#977C54', roughness: 0.6, metalness: 0, grain: true },
  { id: 'maple', name: 'Maple', color: '#E3CFA8', edge: '#B29D74', roughness: 0.6, metalness: 0, grain: true },
  { id: 'cherry', name: 'Cherry', color: '#9E5F3E', edge: '#6F4029', roughness: 0.55, metalness: 0, grain: true },
  { id: 'ash', name: 'Ash', color: '#D6C6A2', edge: '#A6936E', roughness: 0.6, metalness: 0, grain: true },
  { id: 'painted-white', name: 'Painted white', color: '#F1EFE9', edge: '#B9B5A9', roughness: 0.4, metalness: 0 },
  { id: 'painted-black', name: 'Painted black', color: '#35322E', edge: '#1C1A17', roughness: 0.4, metalness: 0 },
  { id: 'steel-black', name: 'Blackened steel', color: '#3A3A3E', edge: '#18181B', roughness: 0.35, metalness: 0.9 },
  { id: 'brass', name: 'Brass', color: '#B08D4F', edge: '#7C611F', roughness: 0.3, metalness: 1 },
];

export const MATERIAL_BY_ID: Record<string, MaterialDef> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
);

/** Rough shelf-sag rule of thumb: max unsupported span for a solid-wood board, by thickness. */
export function maxShelfSpan(thicknessMM: number): number {
  return thicknessMM * 48;
}
