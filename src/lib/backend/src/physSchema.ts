import type {
  AssetFormat,
  AssetKind,
  AssetManifest,
  AssetQuality,
  DynamicalRegime,
  FrameConvention,
  InterventionKind,
  ObservationKind,
  PhysBackend,
  PhysEntityKind,
  PhysFieldKind,
  PhysProcessKind,
  Protocol,
  RobotEmbodiment,
  WorldKind
} from "./types";

export const WORLD_KINDS = ["physical", "simulated", "hybrid", "recorded", "counterfactual"] as const satisfies readonly WorldKind[];
export const DYNAMICAL_REGIMES = [
  "rigid_body",
  "articulated_body",
  "soft_body",
  "fluid",
  "granular",
  "thermal",
  "chemical",
  "electrical",
  "optical",
  "acoustic",
  "biological",
  "behavioral",
  "causal_graph",
  "hybrid"
] as const satisfies readonly DynamicalRegime[];
export const FRAME_CONVENTIONS = ["ros_enu", "ned", "mujoco", "isaac", "custom"] as const satisfies readonly FrameConvention[];
export const PHYS_ENTITY_KINDS = [
  "robot",
  "object",
  "container",
  "material",
  "fluid_volume",
  "chemical_sample",
  "electrical_component",
  "organism",
  "human",
  "abstract_agent",
  "custom"
] as const satisfies readonly PhysEntityKind[];
export const PHYS_FIELD_KINDS = [
  "temperature",
  "pressure",
  "velocity",
  "concentration",
  "electric_potential",
  "magnetic",
  "light",
  "sound",
  "occupancy",
  "belief",
  "risk",
  "custom"
] as const satisfies readonly PhysFieldKind[];
export const PHYS_PROCESS_KINDS = [
  "rigid_dynamics",
  "articulation",
  "fluid_dynamics",
  "diffusion",
  "thermal_transfer",
  "chemical_reaction",
  "electrical_circuit",
  "optical_rendering",
  "acoustic_propagation",
  "controller",
  "policy",
  "behavior",
  "causal_transition",
  "custom"
] as const satisfies readonly PhysProcessKind[];
export const PHYS_BACKENDS = ["gazebo", "mujoco", "isaac", "sapien", "taichi", "fenics", "openfoam", "pybullet", "custom"] as const satisfies readonly PhysBackend[];
export const OBSERVATION_KINDS = [
  "image",
  "depth",
  "temperature",
  "force",
  "pose",
  "chemical_measurement",
  "electrical_signal",
  "audio",
  "state_estimate",
  "human_annotation",
  "custom"
] as const satisfies readonly ObservationKind[];
export const INTERVENTION_KINDS = [
  "robot_command",
  "apply_force",
  "move_object",
  "add_material",
  "remove_material",
  "heat",
  "cool",
  "mix",
  "measure",
  "electrical_stimulus",
  "environment_change",
  "custom"
] as const satisfies readonly InterventionKind[];
export const ASSET_KINDS = ["robot", "object", "scene", "sensor", "material", "process", "terrain", "marker", "field"] as const satisfies readonly AssetKind[];
export const ROBOT_EMBODIMENTS = [
  "manipulator",
  "mobile_base",
  "mobile_manipulator",
  "drone",
  "quadruped",
  "humanoid",
  "soft_robot",
  "custom"
] as const satisfies readonly RobotEmbodiment[];
export const ASSET_FORMATS = ["urdf", "xacro", "sdf", "mjcf", "usd", "stl", "dae", "obj", "gltf", "glb"] as const satisfies readonly AssetFormat[];
export const PROTOCOLS = [
  "ros2",
  "ros2_control",
  "mavlink",
  "lerobot",
  "mujoco",
  "gazebo",
  "isaac",
  "sapien",
  "sdk",
  "serial",
  "i2c",
  "spi",
  "uart",
  "can",
  "none"
] as const satisfies readonly Protocol[];
export const ASSET_QUALITIES = ["vendor_raw", "vendor_patched", "community", "phys0_verified", "phys0_gold"] as const satisfies readonly AssetQuality[];

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
}

export function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T | null {
  if (value == null || value === "") return null;
  return requireEnum(value, allowed, label);
}

export function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of strings.`);
  return value.map((item) => {
    if (typeof item !== "string") throw new Error(`${label} must be an array of strings.`);
    return item;
  });
}

export function validateManifestShape(manifest: AssetManifest): void {
  if (!manifest || typeof manifest !== "object") throw new Error("Asset manifest must be an object.");
  if (typeof manifest.id !== "string" || !manifest.id.trim()) throw new Error("Asset manifest id is required.");
  if (typeof manifest.name !== "string" || !manifest.name.trim()) throw new Error(`Asset ${manifest.id} name is required.`);
  requireEnum(manifest.kind, ASSET_KINDS, `Asset ${manifest.id} kind`);
  if (manifest.embodiment != null) requireEnum(manifest.embodiment, ROBOT_EMBODIMENTS, `Asset ${manifest.id} embodiment`);
  requireEnum(manifest.quality, ASSET_QUALITIES, `Asset ${manifest.id} quality`);
  if (!Array.isArray(manifest.formats) || manifest.formats.length === 0) throw new Error(`Asset ${manifest.id} formats are required.`);
  for (const format of manifest.formats) requireEnum(format, ASSET_FORMATS, `Asset ${manifest.id} format`);
  if (!manifest.variants || typeof manifest.variants !== "object" || Array.isArray(manifest.variants)) {
    throw new Error(`Asset ${manifest.id} variants are required.`);
  }
  if (!manifest.validation || typeof manifest.validation !== "object") throw new Error(`Asset ${manifest.id} validation block is required.`);
  requireEnum(manifest.validation.status, ["unknown", "failing", "passing", "gold"] as const, `Asset ${manifest.id} validation status`);
  if (!Array.isArray(manifest.validation.tests)) throw new Error(`Asset ${manifest.id} validation tests must be an array.`);
  if (manifest.protocols) {
    for (const protocol of manifest.protocols) requireEnum(protocol, PROTOCOLS, `Asset ${manifest.id} protocol`);
  }
}
