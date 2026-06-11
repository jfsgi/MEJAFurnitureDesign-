// The Design-workspace 3D viewport. Conventions per UI standard §7:
// scroll = zoom to cursor, right-drag = orbit, middle-drag = pan, left = select/move.
// Model space is Z-up mm; the root group rotation maps it into three.js's Y-up world.

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Grid, OrbitControls, useCursor } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Instance, Primitive } from '../core/types';
import type { MaterialDef } from '../core/materials';
import { MATERIAL_BY_ID, MATERIALS } from '../core/materials';
import { docBBox, evaluateInstance, instanceBBox, type BBox } from '../core/evaluate';
import { snapMM } from '../core/units';
import { useStore } from '../core/store';
import { grainBoxGeometry, longestAxis, taperedBoxGeometry } from './geometry';
import { getWoodTexture, grainOffset } from './woodTexture';
import { viewport, type ViewName } from './viewportApi';

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
  seed,
}: {
  prim: Primitive;
  mat: MaterialDef;
  selected: boolean;
  hovered: boolean;
  seed: string;
}) {
  const grainTex = mat.grain ? getWoodTexture(mat.id, prim.shape === 'cylinder') : null;

  const geo = useMemo(() => {
    const offset = grainOffset(seed);
    if (prim.shape === 'taperedBox') {
      return taperedBoxGeometry(prim.top, prim.bottom, prim.height, prim.align, offset);
    }
    if (prim.shape === 'box' && mat.grain) {
      return grainBoxGeometry(prim.size, longestAxis(prim.size), offset);
    }
    return null;
  }, [prim, mat.grain, seed]);
  useEffect(() => () => geo?.dispose(), [geo]);

  // Hover/selection per UI standard §4.2: outline carries the accent; the surface only
  // brightens neutrally (a color tint would distort wood tones).
  const highlight = hovered && !selected;
  const material = (
    <meshStandardMaterial
      color={grainTex ? '#ffffff' : mat.color}
      map={grainTex}
      roughness={mat.roughness}
      metalness={mat.metalness}
      emissive={highlight || selected ? '#ffffff' : '#000000'}
      emissiveIntensity={highlight ? 0.08 : selected ? 0.04 : 0}
    />
  );
  const edges = (
    <Edges threshold={20} color={selected ? '#0F766E' : highlight ? '#14B8A6' : mat.edge} />
  );

  if (prim.shape === 'cylinder') {
    return (
      <mesh position={prim.at} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[prim.radiusTop, prim.radiusBottom, prim.height, 32]} />
        {material}
        {edges}
      </mesh>
    );
  }
  if (geo) {
    return (
      <mesh position={prim.at} geometry={geo}>
        {material}
        {edges}
      </mesh>
    );
  }
  // Only ungrained boxes reach here (cylinders returned above; tapered/grained use `geo`).
  if (prim.shape !== 'box') return null;
  return (
    <mesh position={prim.at}>
      <boxGeometry args={prim.size} />
      {material}
      {edges}
    </mesh>
  );
}

function InstanceGroup({ inst }: { inst: Instance }) {
  const model = useMemo(() => evaluateInstance(inst), [inst]);
  const selected = useStore((s) => s.selectedId === inst.id);
  const hovered = useStore((s) => s.hoveredId === inst.id && s.selectedId !== inst.id);
  const snap = useStore((s) => s.snap);
  const units = useStore((s) => s.doc.units);
  const { select, hover, setPosition, beginGesture, endGesture } = useStore.getState();
  useCursor(hovered, 'grab');

  const drag = useRef<{ start: [number, number]; base: [number, number]; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select(inst.id);
    const gp = groundFromRay(e.ray);
    if (!gp) return;
    drag.current = { start: gp, base: inst.position, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
    beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
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
      onPointerOver={(e) => {
        e.stopPropagation();
        hover(inst.id);
      }}
      onPointerOut={() => hover(null)}
    >
      {model.parts.map((part) => {
        const mat = MATERIAL_BY_ID[part.material] ?? FALLBACK_MATERIAL;
        return part.primitives.map((prim, i) => (
          <PrimitiveMesh
            key={`${part.id}-${i}-${JSON.stringify(prim)}`}
            prim={prim}
            mat={mat}
            selected={selected}
            hovered={hovered}
            seed={`${inst.id}/${part.id}/${i}`}
          />
        ));
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

export function Viewport() {
  const instances = useStore((s) => s.doc.instances);
  const units = useStore((s) => s.doc.units);

  return (
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
  );
}
