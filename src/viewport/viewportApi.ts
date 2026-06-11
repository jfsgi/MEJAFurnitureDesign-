// Bridge between DOM UI (toolbar buttons, drag-and-drop, keyboard) and the three.js
// camera/controls living inside the Canvas. The Rig component inside the Canvas owns
// the implementation and registers it here.

export type ViewName = 'front' | 'right' | 'top' | 'hero';

export interface ViewportApi {
  frameAll(): void;
  frameSelection(): void;
  setView(view: ViewName): void;
  /** Dolly toward (<1) or away from (>1) the orbit target. */
  zoomBy(factor: number): void;
  /** Zoom so the given client-space rectangle fills the viewport. */
  zoomWindow(x0: number, y0: number, x1: number, y1: number): void;
  /** Raycast a client-space point onto the floor; returns model-space [x, y] mm. */
  groundPoint(clientX: number, clientY: number): [number, number] | null;
}

export const viewport: { api: ViewportApi | null } = { api: null };
