// Bridge between DOM UI (toolbar buttons, drag-and-drop, keyboard) and the three.js
// camera/controls living inside the Canvas. The Rig component inside the Canvas owns
// the implementation and registers it here.

export type ViewName = 'front' | 'right' | 'top' | 'hero';

export interface ViewportApi {
  frameAll(): void;
  frameSelection(): void;
  setView(view: ViewName): void;
  /** Raycast a client-space point onto the floor; returns model-space [x, y] mm. */
  groundPoint(clientX: number, clientY: number): [number, number] | null;
}

export const viewport: { api: ViewportApi | null } = { api: null };
