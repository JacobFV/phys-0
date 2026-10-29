import React, { useEffect, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { continueRender, delayRender, staticFile } from "remotion";

// The real SO-101, built from the repo's URDF (assets/so101/so101_new_calib.urdf,
// copied to public/so101) and its Onshape STL meshes. Joint angles are in
// radians on the URDF's own joints, so poses here mean the same thing as on
// the bench.
export type So101Pose = {
  shoulder_pan: number;
  shoulder_lift: number;
  elbow_flex: number;
  wrist_flex: number;
  wrist_roll: number;
  gripper: number;
};

type Origin = { xyz: THREE.Vector3Tuple; rpy: THREE.Vector3Tuple };
type Visual = { origin: Origin; mesh: string; color: string };
type Joint = { name: string; type: string; parent: string; child: string; origin: Origin; axis: THREE.Vector3Tuple };
type Model = { root: string; visuals: Map<string, Visual[]>; joints: Joint[]; geometries: Map<string, THREE.BufferGeometry> };

const BASE = "so101/";
let modelPromise: Promise<Model> | null = null;

const nums = (s: string | null, fallback = "0 0 0") =>
  (s ?? fallback).trim().split(/\s+/).map(Number) as THREE.Vector3Tuple;

const parseOrigin = (el: Element | null): Origin => ({
  xyz: nums(el?.getAttribute("xyz") ?? null),
  rpy: nums(el?.getAttribute("rpy") ?? null),
});

const toHex = (rgba: string) => {
  const [r, g, b] = rgba.trim().split(/\s+/).map(Number);
  return new THREE.Color(r, g, b).getStyle();
};

const loadModel = async (): Promise<Model> => {
  const text = await (await fetch(staticFile(BASE + "so101_new_calib.urdf"))).text();
  const robot = new DOMParser().parseFromString(text, "application/xml").documentElement;
  const tops = Array.from(robot.children);

  const colors = new Map<string, string>();
  for (const m of tops.filter((e) => e.tagName === "material")) {
    const c = m.querySelector("color")?.getAttribute("rgba");
    if (c) colors.set(m.getAttribute("name")!, toHex(c));
  }

  const visuals = new Map<string, Visual[]>();
  for (const link of tops.filter((e) => e.tagName === "link")) {
    const vs: Visual[] = [];
    for (const v of Array.from(link.children).filter((e) => e.tagName === "visual")) {
      const mesh = v.querySelector("geometry > mesh")?.getAttribute("filename");
      if (!mesh) continue;
      const mat = v.querySelector("material");
      const named = mat?.getAttribute("name");
      const inline = mat?.querySelector("color")?.getAttribute("rgba");
      const color = (named && colors.get(named)) ?? (inline ? toHex(inline) : "#cccccc");
      vs.push({ origin: parseOrigin(v.querySelector("origin")), mesh, color });
    }
    visuals.set(link.getAttribute("name")!, vs);
  }

  // Only top-level <joint>s; <transmission> blocks also contain <joint name=...>.
  const joints: Joint[] = tops
    .filter((e) => e.tagName === "joint")
    .map((j) => ({
      name: j.getAttribute("name")!,
      type: j.getAttribute("type")!,
      parent: j.querySelector("parent")!.getAttribute("link")!,
      child: j.querySelector("child")!.getAttribute("link")!,
      origin: parseOrigin(j.querySelector("origin")),
      axis: nums(j.querySelector("axis")?.getAttribute("xyz") ?? null, "1 0 0"),
    }));

  const children = new Set(joints.map((j) => j.child));
  const root = Array.from(visuals.keys()).find((l) => !children.has(l))!;

  const loader = new STLLoader();
  const files = Array.from(new Set(Array.from(visuals.values()).flat().map((v) => v.mesh)));
  const geometries = new Map<string, THREE.BufferGeometry>();
  await Promise.all(
    files.map(async (f) => {
      const g = loader.parse(await (await fetch(staticFile(BASE + f))).arrayBuffer());
      g.computeVertexNormals();
      geometries.set(f, g);
    }),
  );
  return { root, visuals, joints, geometries };
};

const useModel = () => {
  const [model, setModel] = useState<Model | null>(null);
  const [handle] = useState(() => delayRender("Loading SO-101 URDF"));
  useEffect(() => {
    modelPromise ??= loadModel();
    modelPromise.then((m) => {
      setModel(m);
      continueRender(handle);
    });
  }, [handle]);
  return model;
};

const euler = ([r, p, y]: THREE.Vector3Tuple) => new THREE.Euler(r, p, y, "ZYX");

export const So101: React.FC<{
  pose: So101Pose;
  ghost?: boolean;
  // Rendered at the gripper's tool frame, e.g. a setpoint marker.
  tip?: React.ReactNode;
  scale?: number;
}> = ({ pose, ghost = false, tip, scale = 1 }) => {
  const model = useModel();
  const materials = React.useMemo(() => new Map<string, THREE.Material>(), []);
  if (!model) return null;

  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = ghost
        ? new THREE.MeshStandardMaterial({ color: "#f5d76e", emissive: "#f5d76e", emissiveIntensity: 0.35, transparent: true, opacity: 0.22, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 });
      materials.set(color, m);
    }
    return m;
  };

  const renderLink = (name: string): React.ReactNode => (
    <group key={name}>
      {(model.visuals.get(name) ?? []).map((v, i) => (
        <mesh
          key={i}
          geometry={model.geometries.get(v.mesh)}
          material={material(v.color)}
          position={v.origin.xyz}
          rotation={euler(v.origin.rpy)}
        />
      ))}
      {name === "gripper_frame_link" && tip}
      {model.joints
        .filter((j) => j.parent === name)
        .map((j) => {
          const angle = j.type === "revolute" ? (pose[j.name as keyof So101Pose] ?? 0) : 0;
          const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...j.axis).normalize(), angle);
          return (
            <group key={j.name} position={j.origin.xyz} rotation={euler(j.origin.rpy)}>
              <group quaternion={q}>{renderLink(j.child)}</group>
            </group>
          );
        })}
    </group>
  );

  // URDF is Z-up in metres; the stage is Y-up.
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} scale={scale}>
      {renderLink(model.root)}
    </group>
  );
};
