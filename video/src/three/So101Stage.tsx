import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { PerspectiveCamera } from "@react-three/drei";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useThree } from "@react-three/fiber";
import { So101, So101Pose } from "./So101";

// Two SO-101s sharing one stage, both built from the real URDF and meshes: a
// translucent "ghost" pinned at the wizard's setpoint, and a live arm whose
// joints ease toward it over the scene. Reads as "the operator is bringing the
// real servo readings into alignment with the setpoint."
export const So101Stage: React.FC<{
  width: number;
  height: number;
  // The pose the wizard wants the arm at. The solid arm tweens toward this.
  target: So101Pose;
  // Where the live arm starts.
  start: So101Pose;
  showGhost?: boolean;
  background?: string;
  cameraPos?: [number, number, number];
  lookAt?: [number, number, number];
}> = ({ width, height, target, start, showGhost = true, background = "#050505", cameraPos = [3.4, 2.6, 4.6], lookAt = [0, 1.1, 0] }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const linear = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames - 12)));
  const t = 0.5 - 0.5 * Math.cos(Math.PI * linear);

  const live = Object.fromEntries(
    (Object.keys(target) as (keyof So101Pose)[]).map((k) => [k, lerp(start[k], target[k], t)]),
  ) as So101Pose;

  return (
    <ThreeCanvas width={width} height={height}>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 6, 16]} />
      <hemisphereLight args={["#ffffff", "#202020", 0.7]} />
      <directionalLight position={[3, 6, 3]} intensity={1.6} />
      <directionalLight position={[-4, 3, -2]} intensity={0.5} color="#f5d76e" />

      <PerspectiveCamera makeDefault position={cameraPos} fov={32} near={0.05} far={100} />
      <LookAt target={lookAt} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.95} />
      </mesh>
      <gridHelper args={[8, 32, "#2a2a2a", "#1a1a1a"]} position={[0, 0.001, 0]} />

      {showGhost && (
        <So101
          pose={target}
          ghost
          scale={SCALE}
          tip={
            <mesh>
              <sphereGeometry args={[0.009, 16, 16]} />
              <meshStandardMaterial color="#f5d76e" emissive="#f5d76e" emissiveIntensity={1.2} />
            </mesh>
          }
        />
      )}
      <So101 pose={live} scale={SCALE} />
    </ThreeCanvas>
  );
};

// Metres to stage units: the arm stands about 1.5 units tall at rest.
const SCALE = 5;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const LookAt: React.FC<{ target: [number, number, number] }> = ({ target }) => {
  const camera = useThree((st) => st.camera);
  camera.lookAt(target[0], target[1], target[2]);
  return null;
};
