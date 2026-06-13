// The Design-workspace 3D viewport. Conventions per UI standard §7:
// scroll = zoom to cursor, right-drag = orbit, middle-drag = pan, left = select/move.
// Model space is Z-up mm; the root group rotation maps it into three.js's Y-up world.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, OrbitControls, useCursor } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Instance, Primitive } from '../core/types';
import type { MaterialDef } from '../core/materials';
import { MATERIAL_BY_ID, MATERIALS } from '../core/materials';
import { REGISTRY } from '../core/components/registry';
import {
  docBBox,
  evaluateInstance,
  instanceBBox,
  modelBBox,
  partBBox,
  type BBox,
} from '../core/evaluate';
import { inch, snapMM } from '../core/units';
import { useStore } from '../core/store';
import {
  archedBoardGeometry,
  grainBoxGeometry,
  longestAxis,
  mortisedPostGeometry,
  roundedSlabGeometry,
  taperedBoxGeometry,
} from './geometry';
import { GRAIN_MM_U, getWoodTexture, grainOffset } from './woodTexture';
import { jointedBoardGeometry } from './jointBoards';
import { applyBoxUVs } from '../studio/engine/materials/uv';
import { viewport, type ViewName } from './viewportApi';
import {
  ExplodeIcon,
  FrameIcon,
  FrameSelectionIcon,
  JointIcon,
  MinusIcon,
  PlusIcon,
  ZoomWindowIcon,
} from '../ui/icons';
import { detectJoint, jointKey } from '../core/joints';
import type { JointStyle } from '../core/types';

const FALLBACK_MATERIAL = MATERIALS[0];

/** Intersect a world-space ray with the floor; return model-space [x, y] mm. */
function groundFromRay(ray: THREE.Ray): [number, number] | null {
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = -ray.origin.y / ray.direction.y;
  if (t < 0) return null;
  const p = ray.origin.clone().addScaledVector(ray.direction, t);
  return [p.x, -p.z];
}

function PrimitiveMesh({
  prim,
  mat,
  selected,
  hovered,
  partHovered,
  jointed,
  seed,
  partId,
}: {
  prim: Primitive;
  mat: MaterialDef;
  selected: boolean;
  hovered: boolean;
  partHovered: boolean;
  jointed: boolean;
  seed: string;
  partId: string;
}) {
  // Cylinders, engine-jointed boards, and rounded slabs (engine box UVs)
  // carry grain along V — rotated texture.
  const rotatedGrain =
    prim.shape === 'cylinder' ||
    prim.shape === 'jointedBoard' ||
    prim.shape === 'roundedSlab' ||
    prim.shape === 'mortisedPost';
  const grainTex = mat.grain ? getWoodTexture(mat.id, rotatedGrain) : null;

  const geo = useMemo(() => {
    // The offset is per part and UVs are computed in part space (uvOrigin), so the
    // grain runs solid across every board of a part instead of cutting at
    // primitive seams (a leg's shoulder and taper read as one piece of wood).
    const offset = grainOffset(seed);
    if (prim.shape === 'jointedBoard') {
      // Engine joinery geometry, with the engine's box UVs (grain along V).
      const geo = jointedBoardGeometry(prim);
      applyBoxUVs(geo, GRAIN_MM_U, prim.lengthAxis, offset[0], offset[1]);
      return geo;
    }
    if (prim.shape === 'taperedBox') {
      return taperedBoxGeometry(
        prim.top,
        prim.bottom,
        prim.height,
        prim.align,
        prim.shift ?? [0, 0],
        offset,
        prim.at,
        prim.axis ?? 'z',
      );
    }
    if (prim.shape === 'mortisedPost') {
      const geo = mortisedPostGeometry(prim.size[0], prim.size[1], prim.size[2], prim.radius, prim.mortises);
      applyBoxUVs(geo, GRAIN_MM_U, prim.grain ?? 'z', offset[0], offset[1]);
      return geo;
    }
    if (prim.shape === 'archedBoard') {
      return archedBoardGeometry(
        prim.size,
        prim.arch,
        prim.rise,
        prim.shoulder ?? 0,
        prim.endSkew ?? 0,
        offset,
      );
    }
    if (prim.shape === 'roundedSlab') {
      // 'y' axis stands the slab against the wall: build it flat, then tip
      // it up so the outline faces +Y and the thickness runs along depth.
      const vertical = prim.axis === 'y';
      const planSize: [number, number, number] = vertical
        ? [prim.size[0], prim.size[2], prim.size[1]]
        : prim.size;
      const geo = roundedSlabGeometry(
        planSize,
        prim.radius,
        prim.edge ?? 0,
        prim.corners ?? 'front',
        prim.edgeMode ?? 'both',
      );
      if (vertical) geo.rotateX(-Math.PI / 2);
      const grain = prim.grain ?? (vertical ? 'z' : 'x');
      applyBoxUVs(geo, GRAIN_MM_U, grain, offset[0], offset[1]);
      return geo;
    }
    if (prim.shape === 'box' && mat.grain) {
      const axis = prim.grain
        ? ({ x: 0, y: 1, z: 2 } as const)[prim.grain]
        : longestAxis(prim.size);
      return grainBoxGeometry(prim.size, axis, offset, prim.at);
    }
    return null;
  }, [prim, mat.grain, seed]);
  useEffect(() => () => geo?.dispose(), [geo]);

  // Hover/selection per UI standard §4.2: outline carries the accent; the surface only
  // brightens neutrally (a color tint would distort wood tones). The exact part under
  // the cursor brightens a step further than the rest of its assembly.
  const highlight = hovered && !selected;
  // A completed joint tints its parts green (unless the part is also under
  // the cursor / picked, where the white highlight wins for clarity).
  const showJointed = jointed && !partHovered;
  const material = (
    <meshStandardMaterial
      color={grainTex ? '#ffffff' : mat.color}
      map={grainTex}
      roughness={mat.roughness}
      metalness={mat.metalness}
      emissive={showJointed ? '#2bd47a' : highlight || selected || partHovered ? '#ffffff' : '#000000'}
      emissiveIntensity={showJointed ? 0.22 : partHovered ? 0.15 : highlight ? 0.08 : selected ? 0.04 : 0}
    />
  );
  const edges = (
    <Edges
      threshold={20}
      color={partHovered ? '#2DD4BF' : selected ? '#0F766E' : highlight ? '#14B8A6' : mat.edge}
    />
  );
  const userData = { partId };

  if (prim.shape === 'cylinder') {
    return (
      <mesh position={prim.at} rotation={[Math.PI / 2, 0, 0]} userData={userData}>
        <cylinderGeometry args={[prim.radiusTop, prim.radiusBottom, prim.height, 32]} />
        {material}
        {edges}
      </mesh>
    );
  }
  const tiltX = prim.shape === 'box' ? (prim.tiltX ?? 0) : 0;
  const tiltY = prim.shape === 'box' ? (prim.tilt ?? 0) : 0;
  if (geo) {
    return (
      <mesh position={prim.at} rotation={[tiltX, tiltY, 0]} geometry={geo} userData={userData}>
        {material}
        {edges}
      </mesh>
    );
  }
  // Only ungrained boxes reach here (cylinders returned above; tapered/grained use `geo`).
  if (prim.shape !== 'box') return null;
  return (
    <mesh position={prim.at} rotation={[tiltX, tiltY, 0]} userData={userData}>
      <boxGeometry args={prim.size} />
      {material}
      {edges}
    </mesh>
  );
}

function InstanceGroup({ inst }: { inst: Instance }) {
  const model = useMemo(() => evaluateInstance(inst), [inst]);
  // Wall-mounted pieces get a patch of wall behind them so they don't float in space.
  const wallBox = useMemo(
    () => (REGISTRY[inst.componentId]?.mount === 'wall' ? modelBBox(model) : null),
    [inst.componentId, model],
  );
  // Exploded view: parts fan out from the assembly center by the global
  // spread. Floor-standing pieces explode upward off the floor (z scales
  // about 0) so nothing sinks through the grid; wall pieces spread about
  // their own center.
  const explode = useStore((s) => s.explode);
  const explodeOffsets = useMemo(() => {
    if (!explode) return null;
    const box = modelBBox(model);
    if (!box) return null;
    const wall = REGISTRY[inst.componentId]?.mount === 'wall';
    const cx = (box.min[0] + box.max[0]) / 2;
    const cy = (box.min[1] + box.max[1]) / 2;
    const cz = (box.min[2] + box.max[2]) / 2;
    const offsets = new Map<string, [number, number, number]>();
    for (const part of model.parts) {
      const b = partBBox(part);
      if (!b) continue;
      const px = (b.min[0] + b.max[0]) / 2;
      const py = (b.min[1] + b.max[1]) / 2;
      const pz = (b.min[2] + b.max[2]) / 2;
      offsets.set(part.id, [
        (px - cx) * explode,
        (py - cy) * explode,
        (wall ? pz - cz : pz) * explode,
      ]);
    }
    return offsets;
  }, [explode, model, inst.componentId]);
  const selected = useStore((s) => s.selectedId === inst.id);
  const hovered = useStore((s) => s.hoveredId === inst.id && s.selectedId !== inst.id);
  const hoveredPartIds = useStore((s) =>
    s.hoveredPart?.instanceId === inst.id ? s.hoveredPart.partIds : null,
  );
  const jointPickIds = useStore((s) =>
    s.jointPick?.instanceId === inst.id ? s.jointPick.partIds : null,
  );
  const jointMode = useStore((s) => s.jointMode);
  // Part ids that participate in a completed joint (shown green in joint mode).
  const jointedIds = useMemo(() => {
    const set = new Set<string>();
    if (jointMode && inst.joints) {
      for (const key of Object.keys(inst.joints)) for (const id of key.split('|')) set.add(id);
    }
    return set;
  }, [jointMode, inst.joints]);
  const snap = useStore((s) => s.snap);
  const units = useStore((s) => s.doc.units);
  const { select, hover, setHoveredPart, setPosition, beginGesture, endGesture } =
    useStore.getState();
  useCursor(hovered, 'grab');

  const lastPartId = useRef<string | null>(null);
  const trackPart = (e: ThreeEvent<PointerEvent>) => {
    const partId =
      (e.object.userData?.partId as string | undefined) ??
      (e.object.parent?.userData?.partId as string | undefined) ??
      null;
    if (partId !== lastPartId.current) {
      lastPartId.current = partId;
      setHoveredPart(partId ? { instanceId: inst.id, partIds: [partId] } : null);
    }
  };

  const drag = useRef<{ start: [number, number]; base: [number, number]; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Joint editor: clicking a part picks it for the joint instead of moving.
    if (useStore.getState().jointMode) {
      const partId =
        (e.object.userData?.partId as string | undefined) ??
        (e.object.parent?.userData?.partId as string | undefined);
      if (partId) useStore.getState().pickJointPart(inst.id, partId);
      return;
    }
    select(inst.id);
    const gp = groundFromRay(e.ray);
    if (!gp) return;
    drag.current = { start: gp, base: inst.position, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
    beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) {
      trackPart(e);
      return;
    }
    e.stopPropagation();
    const gp = groundFromRay(e.ray);
    if (!gp) return;
    const dx = gp[0] - d.start[0];
    const dy = gp[1] - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) < 5) return; // click, not a drag
    d.moved = true;
    let nx = d.base[0] + dx;
    let ny = d.base[1] + dy;
    if (snap) {
      nx = snapMM(nx, units);
      ny = snapMM(ny, units);
    }
    setPosition(inst.id, [nx, ny], 'preview');
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    endGesture();
  };

  return (
    <group
      position={[inst.position[0], inst.position[1], 0]}
      rotation={[0, 0, inst.rotationZ]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        viewport.api?.frameSelection();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(inst.id);
        trackPart(e);
      }}
      onPointerOut={() => {
        lastPartId.current = null;
        hover(null);
      }}
    >
      {wallBox && (
        <mesh
          position={[
            (wallBox.min[0] + wallBox.max[0]) / 2,
            wallBox.min[1] - 12.5,
            (wallBox.max[2] + inch(8)) / 2,
          ]}
          raycast={() => null}
        >
          <boxGeometry
            args={[wallBox.max[0] - wallBox.min[0] + inch(16), 25, wallBox.max[2] + inch(8)]}
          />
          <meshStandardMaterial color="#F2EDE3" roughness={0.95} metalness={0} />
        </mesh>
      )}
      {model.parts.map((part) => {
        const mat = MATERIAL_BY_ID[part.material] ?? FALLBACK_MATERIAL;
        return (
          <group key={part.id} position={explodeOffsets?.get(part.id) ?? [0, 0, 0]}>
            {part.primitives.map((prim, i) => (
              <PrimitiveMesh
                key={`${i}-${JSON.stringify(prim)}`}
                prim={prim}
                mat={mat}
                selected={selected}
                hovered={hovered}
                partHovered={
                  (hoveredPartIds?.includes(part.id) ?? false) ||
                  (jointPickIds?.includes(part.id) ?? false)
                }
                jointed={jointedIds.has(part.id)}
                seed={`${inst.id}/${part.id}`}
                partId={part.id}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

const VIEW_DIRS: Record<ViewName, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.12, -1),
  right: new THREE.Vector3(1, 0.12, 0),
  top: new THREE.Vector3(0.001, 1, 0),
  hero: new THREE.Vector3(1, 0.8, -1),
};

/** Owns the viewport API: framing, standard views, drop-point raycasts. */
function Rig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const gl = useThree((s) => s.gl);
  const framedOnce = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const persp = camera as THREE.PerspectiveCamera;
    let anim = 0;

    const tween = (toPos: THREE.Vector3, toTarget: THREE.Vector3, duration: number) => {
      cancelAnimationFrame(anim);
      if (duration <= 0) {
        camera.position.copy(toPos);
        controls.target.copy(toTarget);
        controls.update();
        return;
      }
      const p0 = camera.position.clone();
      const t0 = controls.target.clone();
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(p0, toPos, e);
        controls.target.lerpVectors(t0, toTarget, e);
        controls.update();
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    };

    const frame = (bbox: BBox | null, dir?: THREE.Vector3, duration = 300) => {
      let center = new THREE.Vector3(0, 400, 0);
      let radius = 1400;
      if (bbox) {
        // Model (Z-up) → world (Y-up): world = (x, z, −y).
        const box = new THREE.Box3(
          new THREE.Vector3(bbox.min[0], bbox.min[2], -bbox.max[1]),
          new THREE.Vector3(bbox.max[0], bbox.max[2], -bbox.min[1]),
        );
        center = box.getCenter(new THREE.Vector3());
        radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 100);
      }
      const fov = (persp.fov * Math.PI) / 180;
      const dist = (radius / Math.sin(fov / 2)) * 1.1;
      const direction = (
        dir ? dir.clone() : camera.position.clone().sub(controls.target)
      ).normalize();
      tween(center.clone().add(direction.multiplyScalar(dist)), center, duration);
    };

    viewport.api = {
      frameAll: () => frame(docBBox(useStore.getState().doc)),
      frameSelection: () => {
        const { doc, selectedId } = useStore.getState();
        const inst = doc.instances.find((i) => i.id === selectedId);
        frame(inst ? instanceBBox(inst) : docBBox(doc));
      },
      setView: (view) => frame(docBBox(useStore.getState().doc), VIEW_DIRS[view]),
      zoomBy: (factor) => {
        const offset = camera.position.clone().sub(controls.target);
        const len = THREE.MathUtils.clamp(offset.length() * factor, 220, 38000);
        tween(controls.target.clone().add(offset.normalize().multiplyScalar(len)), controls.target.clone(), 150);
      },
      zoomWindow: (x0, y0, x1, y1) => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          (((x0 + x1) / 2 - rect.left) / rect.width) * 2 - 1,
          -(((y0 + y1) / 2 - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        const ray = raycaster.ray;
        // Re-target onto the horizontal plane at the current target height (keeps
        // wall-mounted work centered); fall back to a straight dolly if the ray misses.
        let newTarget = controls.target.clone();
        if (Math.abs(ray.direction.y) > 1e-6) {
          const tt = (controls.target.y - ray.origin.y) / ray.direction.y;
          if (tt > 0) newTarget = ray.origin.clone().addScaledVector(ray.direction, tt);
        }
        const scale = Math.min(
          1,
          Math.max(Math.abs(x1 - x0) / rect.width, Math.abs(y1 - y0) / rect.height, 0.02),
        );
        const offset = camera.position.clone().sub(controls.target);
        const len = Math.max(offset.length() * scale, 220);
        tween(newTarget.clone().add(offset.normalize().multiplyScalar(len)), newTarget, 250);
      },
      groundPoint: (clientX, clientY) => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, camera);
        return groundFromRay(raycaster.ray);
      },
    };

    if (!framedOnce.current) {
      framedOnce.current = true;
      frame(docBBox(useStore.getState().doc), VIEW_DIRS.hero, 0);
    }

    return () => {
      cancelAnimationFrame(anim);
      viewport.api = null;
    };
  }, [camera, controls, gl]);

  return null;
}

/** Rubber-band rectangle for zoom-window mode; lives on top of the canvas. */
function ZoomWindowOverlay() {
  const armed = useStore((s) => s.zoomWindowArmed);
  const [band, setBand] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!armed) return null;

  const disarm = () => {
    setBand(null);
    useStore.getState().setZoomWindowArmed(false);
  };

  const style = (() => {
    if (!band || !ref.current) return undefined;
    const host = ref.current.getBoundingClientRect();
    return {
      left: Math.min(band.x0, band.x1) - host.left,
      top: Math.min(band.y0, band.y1) - host.top,
      width: Math.abs(band.x1 - band.x0),
      height: Math.abs(band.y1 - band.y0),
    };
  })();

  return (
    <div
      ref={ref}
      className="zoom-overlay"
      onPointerDown={(e) => {
        if (e.button !== 0) {
          disarm();
          return;
        }
        (e.target as Element).setPointerCapture(e.pointerId);
        setBand({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
      }}
      onPointerMove={(e) => {
        setBand((b) => (b ? { ...b, x1: e.clientX, y1: e.clientY } : b));
      }}
      onPointerUp={() => {
        if (band && Math.abs(band.x1 - band.x0) > 8 && Math.abs(band.y1 - band.y0) > 8) {
          viewport.api?.zoomWindow(band.x0, band.y0, band.x1, band.y1);
        }
        disarm();
      }}
    >
      {style && <div className="zoom-rubberband" style={style} />}
    </div>
  );
}

/** Floating zoom cluster, bottom-right of the viewport. */
function ViewportTools() {
  const armed = useStore((s) => s.zoomWindowArmed);
  const explode = useStore((s) => s.explode);
  const jointMode = useStore((s) => s.jointMode);
  const { setZoomWindowArmed, setExplode, setJointMode } = useStore.getState();
  return (
    <div className="viewport-tools" role="toolbar" aria-label="Zoom tools">
      <button
        className={`btn btn--icon${jointMode ? ' btn--toggle-on' : ''}`}
        onClick={() => setJointMode(!jointMode)}
        title="Joint editor — click two parts that meet"
        aria-label="Joint editor"
        aria-pressed={jointMode}
      >
        <JointIcon />
      </button>
      {explode > 0 && (
        <input
          type="range"
          className="explode-slider"
          min={0}
          max={1}
          step={0.05}
          value={explode}
          onChange={(e) => setExplode(Number(e.target.value))}
          title="Explode distance"
          aria-label="Explode distance"
        />
      )}
      <button
        className={`btn btn--icon${explode > 0 ? ' btn--toggle-on' : ''}`}
        onClick={() => setExplode(explode > 0 ? 0 : 0.5)}
        title="Exploded view — see how it's built"
        aria-label="Exploded view"
        aria-pressed={explode > 0}
      >
        <ExplodeIcon />
      </button>
      <button className="btn btn--icon" onClick={() => viewport.api?.zoomBy(0.7)} title="Zoom in — +" aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button className="btn btn--icon" onClick={() => viewport.api?.zoomBy(1.4)} title="Zoom out — −" aria-label="Zoom out">
        <MinusIcon />
      </button>
      <button
        className={`btn btn--icon${armed ? ' btn--toggle-on' : ''}`}
        onClick={() => setZoomWindowArmed(!armed)}
        title="Zoom window — Z, then drag a box"
        aria-label="Zoom window"
        aria-pressed={armed}
      >
        <ZoomWindowIcon />
      </button>
      <button
        className="btn btn--icon"
        onClick={() => viewport.api?.frameSelection()}
        title="Zoom to selection — F"
        aria-label="Zoom to selection"
      >
        <FrameSelectionIcon />
      </button>
      <button
        className="btn btn--icon"
        onClick={() => viewport.api?.frameAll()}
        title="Zoom all — A or double-click empty space"
        aria-label="Zoom all"
      >
        <FrameIcon />
      </button>
    </div>
  );
}

export function Viewport() {
  const instances = useStore((s) => s.doc.instances);
  const units = useStore((s) => s.doc.units);

  return (
    <>
    <Canvas
      gl={{ toneMapping: THREE.NeutralToneMapping }}
      camera={{ position: [2800, 2000, -2800], fov: 35, near: 10, far: 80000 }}
      onPointerMissed={(e) => {
        if (e.button !== 0) return;
        if (e.detail >= 2) viewport.api?.frameAll();
        else useStore.getState().select(null);
      }}
    >
      <color attach="background" args={['#E9E5DE']} />
      <hemisphereLight args={['#ffffff', '#b8ad99', 0.9]} />
      <directionalLight position={[2500, 5500, -3500]} intensity={1.15} />
      <directionalLight position={[-3000, 2200, 2500]} intensity={0.35} />

      <Grid
        position={[0, 0, 0]}
        cellSize={units === 'imperial' ? 152.4 : 100}
        sectionSize={units === 'imperial' ? 609.6 : 500}
        cellColor="#d9d3c7"
        sectionColor="#c4bcab"
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={16000}
        fadeStrength={1}
        infiniteGrid
      />
      <ContactShadows
        position={[0, 1, 0]}
        scale={6000}
        far={2400}
        blur={2}
        opacity={0.35}
        resolution={1024}
        color="#3a3026"
      />

      <group rotation={[-Math.PI / 2, 0, 0]}>
        {instances.map((inst) => (
          <InstanceGroup key={inst.id} inst={inst} />
        ))}
      </group>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        zoomToCursor
        minDistance={200}
        maxDistance={40000}
        maxPolarAngle={Math.PI / 2 - 0.02}
        mouseButtons={{ MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
      />
      <Rig />
    </Canvas>
    <ZoomWindowOverlay />
    <ViewportTools />
    <JointPicker />
    </>
  );
}

const JOINT_LABELS: Record<JointStyle, string> = {
  butt: 'Butt / none',
  'mortise-tenon': 'Mortise & tenon',
  dowel: 'Dowel',
  'through-dovetail': 'Through dovetail',
  'half-blind-dovetail': 'Half-blind dovetail',
  'french-dovetail': 'French dovetail',
  'box-joint': 'Box joint',
};

/** Joint editor overlay: prompts for two parts, then offers the joinery
 * styles valid for the joint between them. */
function JointPicker() {
  const jointMode = useStore((s) => s.jointMode);
  const pick = useStore((s) => s.jointPick);
  const doc = useStore((s) => s.doc);
  const { setJoint, clearJointPick } = useStore.getState();
  if (!jointMode) return null;

  if (!pick || pick.partIds.length < 2) {
    return (
      <div className="joint-hint">
        Joint editor — click two parts that meet{pick?.partIds.length ? ' (one more)' : ''}.
      </div>
    );
  }

  const inst = doc.instances.find((i) => i.id === pick.instanceId);
  const model = inst ? evaluateInstance(inst) : null;
  const [idA, idB] = pick.partIds;
  const a = model?.parts.find((p) => p.id === idA);
  const b = model?.parts.find((p) => p.id === idB);
  if (!inst || !a || !b) return null;
  const ba = partBBox(a);
  const bb = partBBox(b);
  const joint = ba && bb ? detectJoint(a, b, ba, bb) : null;
  const styles = joint?.styles ?? (['butt'] as JointStyle[]);
  const current = inst.joints?.[jointKey(idA, idB)] ?? 'butt';

  return (
    <div className="joint-picker" role="dialog" aria-label="Choose joinery">
      <div className="joint-picker-head">
        <strong>{a.name}</strong> + <strong>{b.name}</strong>
        <button className="joint-picker-x" onClick={clearJointPick} aria-label="Cancel">
          ×
        </button>
      </div>
      <div className="joint-picker-kind">
        {joint
          ? joint.kind === 'end-face'
            ? 'End-to-face joint'
            : 'Corner joint'
          : "These parts don't meet — pick two that touch."}
        {current !== 'butt' && <span className="joint-picker-done"> · ✓ {JOINT_LABELS[current]} set</span>}
      </div>
      {joint && (
        <div className="joint-picker-styles">
          {styles.map((s) => (
            <button
              key={s}
              className={`btn${s === current ? ' btn--toggle-on' : ''}`}
              onClick={() => setJoint(inst.id, idA, idB, s)}
            >
              {JOINT_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
