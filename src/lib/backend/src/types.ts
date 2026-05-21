export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number];
export type Pose3 = {
  position?: Vec3;
  orientation?: Quaternion;
  frame?: string;
};

export type WorldKind = "physical" | "simulated" | "hybrid" | "recorded" | "counterfactual";
export type DynamicalRegime =
  | "rigid_body"
  | "articulated_body"
  | "soft_body"
  | "fluid"
  | "granular"
  | "thermal"
  | "chemical"
  | "electrical"
  | "optical"
  | "acoustic"
  | "biological"
  | "behavioral"
  | "causal_graph"
  | "hybrid";

export type PhysEntityKind =
  | "robot"
  | "object"
  | "container"
  | "material"
  | "fluid_volume"
  | "chemical_sample"
  | "electrical_component"
  | "organism"
  | "human"
  | "abstract_agent"
  | "custom";

export type PhysFieldKind =
  | "temperature"
  | "pressure"
  | "velocity"
  | "concentration"
  | "electric_potential"
  | "magnetic"
  | "light"
  | "sound"
  | "occupancy"
  | "belief"
  | "risk"
  | "custom";

export type PhysProcessKind =
  | "rigid_dynamics"
  | "articulation"
  | "fluid_dynamics"
  | "diffusion"
  | "thermal_transfer"
  | "chemical_reaction"
  | "electrical_circuit"
  | "optical_rendering"
  | "acoustic_propagation"
  | "controller"
  | "policy"
  | "behavior"
  | "causal_transition"
  | "custom";

export type PhysBackend = "gazebo" | "mujoco" | "isaac" | "sapien" | "taichi" | "fenics" | "openfoam" | "pybullet" | "custom";
export type FrameConvention = "ros_enu" | "ned" | "mujoco" | "isaac" | "custom";

export interface PhysWorld {
  id: string;
  name: string;
  kind: WorldKind;
  seed?: number;
  regimes: DynamicalRegime[];
  frameConvention?: FrameConvention;
  entities: PhysEntity[];
  fields: PhysField[];
  processes: PhysProcess[];
  constraints: JsonObject[];
  sensors: JsonObject[];
  actuators: JsonObject[];
  metadata?: JsonObject;
}

export interface PhysEntity {
  id: string;
  world_id: string;
  asset_id: string | null;
  kind: PhysEntityKind;
  regimes: DynamicalRegime[];
  state: JsonObject;
  pose: JsonObject | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface PhysField {
  id: string;
  world_id: string;
  kind: PhysFieldKind;
  domain: JsonObject;
  units: string | null;
  state_ref: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface PhysProcess {
  id: string;
  world_id: string;
  kind: PhysProcessKind;
  inputs: string[];
  outputs: string[];
  backend: PhysBackend | null;
  parameters: JsonObject;
  created_at: string;
  updated_at: string;
}

export type ObservationKind =
  | "image"
  | "depth"
  | "temperature"
  | "force"
  | "pose"
  | "chemical_measurement"
  | "electrical_signal"
  | "audio"
  | "state_estimate"
  | "human_annotation"
  | "custom";

export type InterventionKind =
  | "robot_command"
  | "apply_force"
  | "move_object"
  | "add_material"
  | "remove_material"
  | "heat"
  | "cool"
  | "mix"
  | "measure"
  | "electrical_stimulus"
  | "environment_change"
  | "custom";

export interface Observation {
  id: string;
  world_id: string;
  source_id: string;
  target_ids: string[] | null;
  kind: ObservationKind;
  timestamp: string;
  data_ref: string | null;
  value: JsonValue | null;
  uncertainty: JsonValue | null;
  metadata: JsonObject;
}

export interface Intervention {
  id: string;
  world_id: string;
  actor_id: string | null;
  target_ids: string[];
  kind: InterventionKind;
  timestamp: string;
  payload: JsonValue;
  expected_effects: string[] | null;
  metadata: JsonObject;
}

export type AssetKind = "robot" | "object" | "scene" | "sensor" | "material" | "process" | "terrain" | "marker" | "field";
export type RobotEmbodiment =
  | "manipulator"
  | "mobile_base"
  | "mobile_manipulator"
  | "drone"
  | "quadruped"
  | "humanoid"
  | "soft_robot"
  | "custom";
export type AssetFormat = "urdf" | "xacro" | "sdf" | "mjcf" | "usd" | "stl" | "dae" | "obj" | "gltf" | "glb";
export type Protocol =
  | "ros2"
  | "ros2_control"
  | "mavlink"
  | "lerobot"
  | "mujoco"
  | "gazebo"
  | "isaac"
  | "sapien"
  | "sdk"
  | "serial"
  | "i2c"
  | "spi"
  | "uart"
  | "can"
  | "none";
export type AssetQuality = "vendor_raw" | "vendor_patched" | "community" | "phys0_verified" | "phys0_gold";

export interface AssetManifest {
  id: string;
  name: string;
  kind: AssetKind;
  embodiment?: RobotEmbodiment;
  source: JsonObject;
  quality: AssetQuality;
  formats: AssetFormat[];
  variants: Record<string, JsonObject>;
  protocols?: Protocol[];
  patches?: JsonObject[];
  validation: {
    status: "unknown" | "failing" | "passing" | "gold";
    tests: string[];
    lastValidatedAt?: string;
    failures?: string[];
  };
}

export interface AssetCatalogEntry {
  id: string;
  kind: AssetKind;
  embodiment: RobotEmbodiment | null;
  name: string;
  manifest: AssetManifest;
  quality: AssetQuality;
  created_at: string;
  updated_at: string;
}

export interface EntityController {
  id: string;
  entity_id: string;
  protocol: Protocol;
  endpoint: string | null;
  config: JsonObject;
  status: string;
  created_at: string;
  updated_at: string;
}

export type AgentSessionEventType =
  | "message"
  | "assistant_delta"
  | "assistant_done"
  | "tool_call"
  | "tool_response"
  | "artifact"
  | "ph_sample"
  | "audio"
  | "error";

export interface Experiment {
  id: string;
  world_id: string;
  name: string;
  status: string;
  seed: number;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export interface AgentSession {
  id: string;
  experiment_id: string;
  world_id: string;
  model: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type WorldType = "physical" | "virtual";

export interface World {
  id: string;
  name: string;
  type: WorldType;
  status: string;
  default_robot_id: string | null;
  seed: number;
  created_at: string;
  updated_at: string;
  metadata: JsonObject;
}

export type RobotKind = "physical" | "virtual";

export interface RobotWorldAssignment {
  robot_id: string;
  world_id: string;
  robot_kind: RobotKind;
  port: string | null;
  metadata: JsonObject;
  updated_at: string;
}

export type VirtualEntityKind = "arm" | "camera" | "light" | "rigid_body";

export interface VirtualWorldEntity {
  id: string;
  world_id: string;
  kind: VirtualEntityKind;
  name: string;
  pose: JsonObject;
  spec: JsonObject;
  collision_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentSessionEvent {
  id: string;
  experiment_id: string;
  session_id: string | null;
  type: AgentSessionEventType;
  role: string | null;
  name: string | null;
  content: JsonObject;
  artifact_id: string | null;
  created_at: string;
}
