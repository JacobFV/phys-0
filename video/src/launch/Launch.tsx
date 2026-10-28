import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { palette, type, fps } from "../theme";
import { CalibrationStage } from "../three/CalibrationStage";

// The launch cut. Real screen recordings of the Lab Console (recorded on a
// virtual display, cursor and all), real annotated frames from the vision runs,
// and the existing procedural SO-101 for the two moments that are animation —
// which say so on screen.

const sec = (s: number) => Math.round(s * fps);

type SceneDef = { id: string; audio: string; audioSec: number; Comp: React.FC };

const TAIL = 1.3;

// ---------------------------------------------------------------- pieces

const fadeInOut = (frame: number, dur: number) =>
  Math.min(
    interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" }),
    interpolate(frame, [dur - 10, dur], [1, 0], { extrapolateLeft: "clamp" }),
  );

const Marker: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      left: 80,
      top: 60,
      fontFamily: type.mono,
      fontSize: 18,
      letterSpacing: "0.32em",
      color: palette.accent,
      textTransform: "uppercase",
    }}
  >
    {text}
  </div>
);

const Line: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const t = spring({ frame: frame - delay, fps: f, config: { damping: 200, mass: 0.6 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 64,
        fontFamily: type.sans,
        fontSize: 40,
        lineHeight: 1.25,
        color: palette.text1,
        opacity: t,
        transform: `translateY(${interpolate(t, [0, 1], [14, 0])}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Badge: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      position: "absolute",
      right: 80,
      top: 54,
      fontFamily: type.mono,
      fontSize: 16,
      letterSpacing: "0.2em",
      color: palette.text2,
      border: `1px solid ${palette.border2}`,
      padding: "8px 14px",
      textTransform: "uppercase",
    }}
  >
    {text}
  </div>
);

// A recording in a window frame, optionally zoomed into a region.
const Screen: React.FC<{
  src: string;
  startSec: number;
  rate: number;
  zoom?: number;
  origin?: string;
  top?: number;
  height?: number;
}> = ({ src, startSec, rate, zoom = 1, origin = "50% 50%", top = 130, height = 760 }) => {
  const frame = useCurrentFrame();
  const z = interpolate(frame, [0, 60], [1, zoom], { extrapolateRight: "clamp", easing: (t) => 1 - Math.pow(1 - t, 3) });
  const w = Math.round((height * 16) / 9);
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: (1920 - w) / 2,
        width: w,
        height,
        overflow: "hidden",
        borderRadius: 10,
        border: `1px solid ${palette.border2}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        background: "#fff",
      }}
    >
      <div style={{ width: "100%", height: "100%", transform: `scale(${z})`, transformOrigin: origin }}>
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={sec(startSec)}
          playbackRate={rate}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- scenes



const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const t = spring({ frame: frame - 6, fps: f, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      <div style={{ position: "absolute", right: 60, top: 140, width: 900, height: 800, opacity: 0.95 }}>
        <CalibrationStage
          width={900}
          height={800}
          target={{ pan: -0.2, lift: -0.7, elbow: -0.4, wristFlex: 0.3, wristRoll: 0.2, gripper: 0.2 }}
          start={{ pan: 0.6, lift: 0.3, elbow: -1.0, wristFlex: -0.4, wristRoll: -0.6, gripper: 0.4 }}
          cameraPos={[6.2, 4.6, 9.4]}
          lookAt={[0, 1.7, 0]}
        />
      </div>
      <div style={{ position: "absolute", left: 120, top: 360, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
        <div style={{ fontFamily: type.mono, fontSize: 26, letterSpacing: "0.4em", color: palette.accent }}>LAB CONSOLE · MCP · OPEN SOURCE</div>
        <div style={{ fontFamily: type.display, fontWeight: 800, fontSize: 210, letterSpacing: "-0.04em", color: palette.text1, lineHeight: 1 }}>phys-0</div>
        <div style={{ fontFamily: type.sans, fontSize: 44, color: palette.text2, maxWidth: 760, marginTop: 18 }}>
          an AI agent, a real robot arm, and a log of every move
        </div>
      </div>
      <Badge text="animation" />
    </AbsoluteFill>
  );
};

const Pitch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const items = [
    ["$600", "SO-101 arm, a USB camera, your laptop"],
    ["1", "local console for experiments, worlds and agents"],
    ["every", "move is a named, validated, logged tool call"],
  ];
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      <Marker text="the idea" />
      <div style={{ position: "absolute", left: 120, top: 250 }}>
        {items.map(([big, small], i) => {
          const t = spring({ frame: frame - 20 - i * 70, fps: f, config: { damping: 200 } });
          return (
            <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 40, marginBottom: 56, opacity: t, transform: `translateX(${(1 - t) * -30}px)` }}>
              <div style={{ fontFamily: type.display, fontWeight: 800, fontSize: 120, color: palette.accent, width: 330, textAlign: "right", letterSpacing: "-0.03em" }}>{big}</div>
              <div style={{ fontFamily: type.sans, fontSize: 48, color: palette.text1 }}>{small}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const Console: React.FC = () => (
  <AbsoluteFill style={{ background: palette.bg0 }}>
    <Marker text="the console" />
    <Badge text="screen recording" />
    <Screen src="launch/clips/console.webm" startSec={1} rate={2.1} zoom={2.1} origin="0% 22%" />
    <Line delay={6}>Create an experiment, spin up a virtual titration station.</Line>
  </AbsoluteFill>
);

const Agent: React.FC = () => (
  <AbsoluteFill style={{ background: palette.bg0 }}>
    <Marker text="the agent" />
    <Badge text="screen recording · gpt-5.5" />
    <Sequence durationInFrames={sec(5)}>
      <Screen src="launch/clips/agent.webm" startSec={2.5} rate={1.6} zoom={3.4} origin="100% 100%" />
    </Sequence>
    <Sequence from={sec(5)}>
      <Screen src="launch/clips/agent.webm" startSec={21} rate={2.4} zoom={3.4} origin="100% 8%" />
    </Sequence>
    <Line delay={6}>list_worlds → create_virtual_arm → list_virtual_entities</Line>
  </AbsoluteFill>
);

const Editor: React.FC = () => (
  <AbsoluteFill style={{ background: palette.bg0 }}>
    <Marker text="worlds in 3d" />
    <Badge text="screen recording" />
    <Screen src="launch/clips/editor.webm" startSec={1.5} rate={2.4} zoom={1.25} origin="45% 55%" />
    <Line delay={6}>Drag in the arm and the glassware. Real URDF meshes, gizmos, collision checks.</Line>
  </AbsoluteFill>
);

const VISION = ["frame_20260517_124018", "frame_20260517_124738", "frame_20260517_130127", "frame_20260517_131328"];
const Vision: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const per = durationInFrames / VISION.length;
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      <Marker text="the real bench" />
      <Badge text="real camera · 17 may 2026" />
      {VISION.map((v, i) => {
        const local = frame - i * per;
        const op = interpolate(local, [-12, 0, per - 6, per + 6], [0, 1, 1, i === VISION.length - 1 ? 1 : 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const s = interpolate(local, [0, per], [1.04, 1.12], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <div key={v} style={{ position: "absolute", top: 130, left: 285, width: 1350, height: 760, overflow: "hidden", borderRadius: 10, opacity: op, border: `1px solid ${palette.border2}` }}>
            <Img src={staticFile(`launch/vision/${v}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s})`, transformOrigin: "20% 30%" }} />
          </div>
        );
      })}
      <Line delay={6}>Find each vial, read the indicator dye, estimate pH, log it.</Line>
    </AbsoluteFill>
  );
};

const Calibration: React.FC = () => (
  <AbsoluteFill style={{ background: palette.bg0 }}>
    <Marker text="calibration" />
    <Badge text="animation" />
    <div style={{ position: "absolute", left: 510, top: 130, width: 900, height: 800 }}>
      <CalibrationStage
        width={900}
        height={800}
        target={{ pan: 0, lift: -0.9, elbow: -0.2, wristFlex: 0.1, wristRoll: 0, gripper: 0 }}
        start={{ pan: 0.5, lift: 0.4, elbow: -0.9, wristFlex: -0.35, wristRoll: -0.5, gripper: 0.3 }}
        cameraPos={[6.2, 4.6, 9.4]}
        lookAt={[0, 1.7, 0]}
      />
    </div>
    <Line delay={6}>A ghost setpoint, the live servo pose, six endpoints.</Line>
  </AbsoluteFill>
);

// The live tool list (84 tools reported by the running app's listTools()).
const TOOLS = [
  "connect_so101", "set_arm_pose", "move_relative", "open_gripper", "close_gripper", "observe", "view_camera",
  "prepare_so101_calibration", "finalize_so101_calibration", "start_lerobot_teleop", "save_lerobot_episode",
  "train_policy", "run_policy", "replay_episode", "create_world", "create_virtual_arm", "create_virtual_camera",
  "create_virtual_rigid_body", "list_virtual_entities", "spawn_robot", "start_sim", "step_sim", "record_ph",
  "record_observation", "record_intervention", "query_history", "read_state", "send_command", "validate_asset",
  "import_asset", "export_world", "set_aerial_control", "speak_to_human", "listen_to_human",
];
const Stack: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.min(84, Math.round(interpolate(frame, [10, 120], [0, 84], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      <Marker text="under the hood" />
      <div style={{ position: "absolute", left: 120, top: 200, fontFamily: type.display, fontWeight: 800, fontSize: 200, color: palette.accent, letterSpacing: "-0.04em" }}>
        {n}
      </div>
      <div style={{ position: "absolute", left: 130, top: 430, fontFamily: type.sans, fontSize: 40, color: palette.text1 }}>MCP tools, one backend</div>
      <div style={{ position: "absolute", left: 130, top: 500, fontFamily: type.mono, fontSize: 24, color: palette.text2, lineHeight: 1.7 }}>
        Electron console · MCP server · phys0 CLI · Python vision + IK
      </div>
      <div style={{ position: "absolute", right: 120, top: 150, width: 720, height: 760, overflow: "hidden", maskImage: "linear-gradient(transparent, black 12%, black 88%, transparent)" }}>
        <div style={{ transform: `translateY(${-frame * 2.2}px)`, fontFamily: type.mono, fontSize: 26, lineHeight: 1.85, color: palette.text1 }}>
          {[...TOOLS, ...TOOLS].map((t, i) => (
            <div key={i}>
              <span style={{ color: palette.text3 }}>tool </span>
              {t}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps: f } = useVideoConfig();
  const t = spring({ frame: frame - 4, fps: f, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: palette.bg0, alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", opacity: t }}>
        <div style={{ fontFamily: type.display, fontWeight: 800, fontSize: 180, color: palette.text1, letterSpacing: "-0.04em" }}>phys-0</div>
        <div style={{ fontFamily: type.mono, fontSize: 36, color: palette.accent, marginTop: 10 }}>github.com/JacobFV/phys-0</div>
      </div>
    </AbsoluteFill>
  );
};

export const LAUNCH_SCENES: SceneDef[] = [
  { id: "title", audio: "01-title", audioSec: 6.05, Comp: Title },
  { id: "pitch", audio: "02-pitch", audioSec: 15.65, Comp: Pitch },
  { id: "console", audio: "03-console", audioSec: 9.55, Comp: Console },
  { id: "agent", audio: "04-agent", audioSec: 9.36, Comp: Agent },
  { id: "editor", audio: "05-editor", audioSec: 11.21, Comp: Editor },
  { id: "vision", audio: "06-vision", audioSec: 8.21, Comp: Vision },
  { id: "calibration", audio: "07-calibration", audioSec: 6.91, Comp: Calibration },
  { id: "stack", audio: "08-stack", audioSec: 10.75, Comp: Stack },
  { id: "close", audio: "09-close", audioSec: 4.75, Comp: Close },
];

export const LAUNCH_FRAMES = LAUNCH_SCENES.reduce((s, sc) => s + sec(sc.audioSec + TAIL), 0);

export const Launch: React.FC = () => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: palette.bg0 }}>
      {LAUNCH_SCENES.map((sc) => {
        const dur = sec(sc.audioSec + TAIL);
        const from = offset;
        offset += dur;
        const { Comp } = sc;
        return (
          <Sequence key={sc.id} from={from} durationInFrames={dur} name={sc.id}>
            <Fade dur={dur}>
              <Comp />
            </Fade>
            <Sequence from={sec(0.25)}>
              <Audio src={staticFile(`launch/audio/${sc.audio}.mp3`)} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Fade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: fadeInOut(frame, dur) }}>{children}</AbsoluteFill>;
};
