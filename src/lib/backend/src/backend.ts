import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Worker } from "node:worker_threads";
import OpenAI from "openai";
import { AudioService } from "./audio";
import { AssetRegistry } from "./assetRegistry";
import { PythonBridge } from "./pythonBridge";
import {
  DYNAMICAL_REGIMES,
  INTERVENTION_KINDS,
  OBSERVATION_KINDS,
  PHYS_BACKENDS,
  PHYS_ENTITY_KINDS,
  PHYS_FIELD_KINDS,
  PHYS_PROCESS_KINDS,
  PROTOCOLS,
  optionalEnum,
  requireEnum,
  requireStringArray
} from "./physSchema";
import { ExternalRuntimeAdapter, LeRobotAdapter, parseRobotCommand, type PhysProtocolAdapter } from "./protocolAdapters";
import { poseToJson } from "./rapierPhysics";
import { Phys0Store, DEFAULT_PHYSICAL_WORLD_ID } from "./store";
import type { AerialControlCommand } from "./physics";
import type { AssetFormat, AssetKind, AssetManifest, Experiment, JsonObject, JsonValue, PhysEntity, Protocol, RobotEmbodiment, RobotKind, WorldType } from "./types";

const DEFAULT_MODEL = "gpt-5.5";
const MAX_AGENT_STEPS = 8;
const DEFAULT_SIM_WORLD_CAP = 8;
const ROBOT_TOOL_NAMES = new Set([
  "connect_so101",
  "observe",
  "get_arm_pose",
  "get_position",
  "set_arm_pose",
  "set_position",
  "open_gripper",
  "close_gripper",
  "move_relative",
  "disconnect"
]);

type SimStatus = "running" | "paused" | "stopped" | "error";

type SimWorkerResponse = {
  world_id: string;
  seed: number;
  fixed_time_step_s: number;
  elapsed_s: number;
  step_count: number;
  snapshot?: {
    poses?: Record<string, { position: [number, number, number]; orientation: [number, number, number, number] }>;
    velocities?: Record<string, { linear: [number, number, number]; angular: [number, number, number] }>;
    contacts?: Array<{ a: string; b: string }>;
  };
};

type SimSession = {
  id: string;
  worldId: string;
  backend: string;
  seed: number;
  fixedTimeStepS: number;
  status: SimStatus;
  worker: Worker;
  requestId: number;
  pending: Map<number, { resolve: (value: SimWorkerResponse) => void; reject: (error: Error) => void }>;
  startedAt: string;
  updatedAt: string;
  lastSnapshot: SimWorkerResponse | null;
};

export class Phys0Backend extends EventEmitter {
  readonly store: Phys0Store;
  readonly bridge: PythonBridge;
  readonly audio: AudioService;
  readonly assetRegistry: AssetRegistry;
  private readonly adapters: Map<Protocol, PhysProtocolAdapter>;
  private readonly simSessions = new Map<string, SimSession>();
  private readonly maxSimWorlds: number;
  private initialized = false;

  constructor(readonly repoRoot: string, dataDir = path.join(repoRoot, "data")) {
    super();
    this.loadEnv();
    this.store = new Phys0Store(repoRoot, dataDir);
    this.audio = new AudioService(dataDir);
    this.bridge = new PythonBridge(repoRoot);
    this.assetRegistry = new AssetRegistry(repoRoot);
    this.maxSimWorlds = Math.max(1, Number(process.env.PHYS0_MAX_SIM_WORLDS ?? DEFAULT_SIM_WORLD_CAP));
    this.adapters = new Map<Protocol, PhysProtocolAdapter>([
      ["lerobot", new LeRobotAdapter((tool, toolArgs) => this.executeTool(tool, toolArgs))],
      ["ros2", new ExternalRuntimeAdapter("ros2", "ros2", ["raw"])],
      ["ros2_control", new ExternalRuntimeAdapter("ros2_control", "ros2", ["joint_position", "joint_velocity", "raw"])],
      ["mavlink", new ExternalRuntimeAdapter("mavlink", "mavproxy.py", ["mavlink_takeoff", "mavlink_land", "mavlink_goto", "raw"])],
      ["gazebo", new ExternalRuntimeAdapter("gazebo", "gz", ["raw"])],
      ["mujoco", new ExternalRuntimeAdapter("mujoco", "python", ["raw"])],
      ["isaac", new ExternalRuntimeAdapter("isaac", "python", ["raw"])],
      ["sapien", new ExternalRuntimeAdapter("sapien", "python", ["raw"])],
      ["sdk", new ExternalRuntimeAdapter("sdk", "python", ["raw"])],
      ["serial", new ExternalRuntimeAdapter("serial", "python", ["raw"])],
      ["none", new ExternalRuntimeAdapter("none", "true", [])]
    ]);
    this.bridge.on("stderr", (text) => this.emit("stderr", text));
  }

  private loadEnv(): void {
    const envPath = path.join(this.repoRoot, ".env");
    if (!fs.existsSync(envPath) || typeof process.loadEnvFile !== "function") return;
    process.loadEnvFile(envPath);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.store.init();
    this.loadAssetRegistry();
    this.bridge.start();
    this.initialized = true;
  }

  async listTools(): Promise<JsonObject> {
    await this.init();
    const result = await this.bridge.request("tools/list");
    const tools = ((result.tools ?? []) as JsonObject[]).map((tool) => this.withExperimentId(tool));
    return { tools: [...tools, ...this.backendTools()] };
  }

  async readResource(uri: string): Promise<JsonObject> {
    await this.init();
    return this.bridge.request("resources/read", { uri });
  }

  async callTool(name: string, args: JsonObject = {}): Promise<JsonObject> {
    await this.init();
    if (name === "create_experiment") {
      const worldId = typeof args.world_id === "string" && args.world_id.trim() ? args.world_id : DEFAULT_PHYSICAL_WORLD_ID;
      return this.createExperiment(String(args.name ?? "Untitled experiment"), (args.metadata as JsonObject) ?? {}, worldId, args.seed);
    }
    if (name === "list_experiments") {
      return { experiments: this.store.listExperiments() as unknown as JsonObject[] };
    }
    if (name === "list_worlds") {
      return {
        worlds: this.store.listWorlds() as unknown as JsonObject[],
        assignments: this.store.listRobotWorldAssignments() as unknown as JsonObject[],
        virtual_entities: this.store.listVirtualEntities() as unknown as JsonObject[],
        phys_entities: this.store.listWorldEntities() as unknown as JsonObject[]
      };
    }
    if (name === "create_world") {
      return {
        world: this.store.createWorld({
          name: String(args.name ?? ""),
          type: String(args.type ?? "physical") as WorldType,
          metadata: (args.metadata as JsonObject) ?? {},
          seed: args.seed
        }) as unknown as JsonObject
      };
    }
    if (name === "update_world") {
      return {
        world: this.store.updateWorld({
          worldId: String(args.world_id ?? ""),
          name: typeof args.name === "string" ? args.name : undefined,
          metadata: (args.metadata as JsonObject) ?? undefined
        }) as unknown as JsonObject
      };
    }
    if (name === "delete_world") {
      const worldId = String(args.world_id ?? "").trim();
      if (!worldId) throw new Error("delete_world requires world_id.");
      this.store.deleteWorld(worldId);
      return { ok: true, world_id: worldId };
    }
    if (name === "assign_robot_to_world") {
      return {
        assignment: this.store.assignRobotToWorld({
          robotId: String(args.robot_id ?? ""),
          worldId: String(args.world_id ?? ""),
          robotKind: String(args.robot_kind ?? "physical") as RobotKind,
          port: typeof args.port === "string" ? args.port : null,
          metadata: (args.metadata as JsonObject) ?? {},
          makeDefault: args.make_default === true
        }) as unknown as JsonObject
      };
    }
    if (name === "delete_robot_assignment") {
      const robotId = String(args.robot_id ?? "").trim();
      if (!robotId) throw new Error("delete_robot_assignment requires robot_id.");
      this.store.deleteRobotAssignment(robotId);
      return { ok: true, robot_id: robotId };
    }
    if (name === "list_virtual_entities") {
      const worldId = typeof args.world_id === "string" && args.world_id.trim() ? args.world_id : undefined;
      return { entities: this.store.listVirtualEntities(worldId) as unknown as JsonObject[] };
    }
    if (name === "create_virtual_arm") {
      const entity = this.store.createVirtualEntity({
        worldId: String(args.world_id ?? ""),
        kind: "arm",
        name: String(args.name ?? "Virtual SO-101"),
        pose: (args.pose as JsonObject) ?? {},
        spec: {
          model: typeof args.model === "string" ? args.model : "so101",
          collision_shape: "so101_urdf",
          collision_mode: "full",
          collides_with: ["rigid_body"],
          ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
        },
        collisionEnabled: true
      });
      const assignment = this.store.assignRobotToWorld({
        robotId: entity.id,
        worldId: entity.world_id,
        robotKind: "virtual",
        metadata: { entity_id: entity.id, model: entity.spec.model ?? "so101", collision_mode: "full" },
        makeDefault: args.make_default === true
      });
      const physEntity = this.store.spawnEntity({
        worldId: entity.world_id,
        kind: "robot",
        assetId: this.store.getAssetManifest("so_arm/so101") ? "so_arm/so101" : null,
        regimes: ["articulated_body", "rigid_body"],
        pose: entity.pose,
        state: { virtual_entity_id: entity.id, controller_status: "virtual" },
        metadata: { name: entity.name, legacy_virtual_entity: true, ...entity.spec }
      });
      return { entity: entity as unknown as JsonObject, phys_entity: physEntity as unknown as JsonObject, assignment: assignment as unknown as JsonObject };
    }
    if (name === "create_virtual_camera") {
      return {
        entity: this.store.createVirtualEntity({
          worldId: String(args.world_id ?? ""),
          kind: "camera",
          name: String(args.name ?? "Virtual camera"),
          pose: (args.pose as JsonObject) ?? {},
          spec: {
            resolution: "1280x720",
            fov_degrees: 60,
            ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
          },
          collisionEnabled: false
        }) as unknown as JsonObject
      };
    }
    if (name === "create_virtual_light") {
      return {
        entity: this.store.createVirtualEntity({
          worldId: String(args.world_id ?? ""),
          kind: "light",
          name: String(args.name ?? "Virtual light"),
          pose: (args.pose as JsonObject) ?? {},
          spec: {
            type: "area",
            intensity: 1,
            color: "#ffffff",
            ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
          },
          collisionEnabled: false
        }) as unknown as JsonObject
      };
    }
    if (name === "create_virtual_rigid_body") {
      return {
        entity: this.store.createVirtualEntity({
          worldId: String(args.world_id ?? ""),
          kind: "rigid_body",
          name: String(args.name ?? "Rigid body"),
          pose: (args.pose as JsonObject) ?? {},
          spec: {
            mass_kg: 0.1,
            collision_shape: "box",
            dimensions_m: [0.05, 0.05, 0.05],
            collision_mode: "full",
            collides_with: ["arm", "rigid_body"],
            ...(args.spec && typeof args.spec === "object" && !Array.isArray(args.spec) ? (args.spec as JsonObject) : {})
          },
          collisionEnabled: args.collision_enabled !== false
        }) as unknown as JsonObject
      };
    }
    if (name === "delete_virtual_entity") {
      const entityId = String(args.entity_id ?? "").trim();
      if (!entityId) throw new Error("delete_virtual_entity requires entity_id.");
      this.store.deleteVirtualEntity(entityId);
      return { ok: true, entity_id: entityId };
    }
    if (name === "update_virtual_entity") {
      return {
        entity: this.store.updateVirtualEntity({
          entityId: String(args.entity_id ?? ""),
          name: typeof args.name === "string" ? args.name : undefined,
          pose: (args.pose as JsonObject) ?? undefined,
          spec: (args.spec as JsonObject) ?? undefined,
          collisionEnabled: typeof args.collision_enabled === "boolean" ? args.collision_enabled : undefined
        }) as unknown as JsonObject
      };
    }
    if (name === "list_agent_session_events") {
      return { events: this.store.listEvents(String(args.experiment_id)) as unknown as JsonObject[] };
    }
    if (name === "list_asset_catalog") {
      return { assets: this.store.listAssetCatalog() as unknown as JsonObject[] };
    }
    if (name === "get_asset_manifest") {
      const assetId = String(args.asset_id ?? "").trim();
      if (!assetId) throw new Error("get_asset_manifest requires asset_id.");
      const asset = this.store.getAssetManifest(assetId);
      if (!asset) throw new Error(`Unknown asset_id: ${assetId}`);
      return { asset: asset as unknown as JsonObject };
    }
    if (name === "validate_asset") {
      const assetId = String(args.asset_id ?? "").trim();
      if (!assetId) throw new Error("validate_asset requires asset_id.");
      return { validation: this.validateAsset(assetId) };
    }
    if (name === "import_asset") {
      const manifest = this.assetRegistry.importDescription({
        sourcePath: String(args.path ?? ""),
        id: String(args.id ?? ""),
        name: typeof args.name === "string" ? args.name : undefined,
        format: optionalEnum(args.format, ["urdf", "xacro", "sdf", "mjcf", "usd", "stl", "dae", "obj", "gltf", "glb"] as const, "format") as AssetFormat | null ?? undefined,
        kind: optionalEnum(args.kind, ["robot", "object", "scene", "sensor", "material", "process", "terrain", "marker", "field"] as const, "kind") as AssetKind | null ?? undefined,
        embodiment: optionalEnum(args.embodiment, ["manipulator", "mobile_base", "mobile_manipulator", "drone", "quadruped", "humanoid", "soft_robot", "custom"] as const, "embodiment") as RobotEmbodiment | null ?? undefined,
        metadata: (args.metadata as JsonObject) ?? {}
      });
      return { asset: this.store.upsertAssetManifest(manifest) as unknown as JsonObject };
    }
    if (name === "patch_asset") {
      const assetId = String(args.asset_id ?? "").trim();
      if (!assetId) throw new Error("patch_asset requires asset_id.");
      const asset = this.store.getAssetManifest(assetId);
      if (!asset) throw new Error(`Unknown asset_id: ${assetId}`);
      const manifest = this.assetRegistry.patchManifest(asset.manifest, (args.patch as JsonObject) ?? {});
      return { asset: this.store.upsertAssetManifest(manifest) as unknown as JsonObject };
    }
    if (name === "spawn_entity") {
      return {
        entity: this.store.spawnEntity({
          worldId: String(args.world_id ?? ""),
          kind: requireEnum(args.kind ?? "custom", PHYS_ENTITY_KINDS, "entity kind"),
          assetId: typeof args.asset_id === "string" && args.asset_id.trim() ? args.asset_id : null,
          regimes: (Array.isArray(args.regimes) ? args.regimes.map((value) => requireEnum(value, DYNAMICAL_REGIMES, "regime")) : []),
          state: (args.state as JsonObject) ?? {},
          pose: (args.pose as JsonObject) ?? null,
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "spawn_robot") {
      this.assertAssetSpawnable(String(args.asset_id ?? ""), args.allow_unvalidated === true);
      return {
        entity: this.store.spawnEntity({
          worldId: String(args.world_id ?? ""),
          kind: "robot",
          assetId: String(args.asset_id ?? ""),
          regimes: ["articulated_body", "rigid_body"],
          pose: (args.pose as JsonObject) ?? null,
          state: {
            backend: typeof args.backend === "string" ? args.backend : null,
            controller: typeof args.controller === "string" ? args.controller : null,
            variant: typeof args.variant === "string" ? args.variant : "default"
          },
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "spawn_object") {
      this.assertAssetSpawnable(String(args.asset_id ?? ""), args.allow_unvalidated === true);
      return {
        entity: this.store.spawnEntity({
          worldId: String(args.world_id ?? ""),
          kind: "object",
          assetId: String(args.asset_id ?? ""),
          regimes: ["rigid_body"],
          pose: (args.pose as JsonObject) ?? null,
          state: { static: args.static === true, variant: typeof args.variant === "string" ? args.variant : "default" },
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "add_field") {
      return {
        field: this.store.addField({
          worldId: String(args.world_id ?? ""),
          kind: requireEnum(args.kind ?? "custom", PHYS_FIELD_KINDS, "field kind"),
          domain: (args.domain as JsonObject) ?? { type: "symbolic" },
          units: typeof args.units === "string" ? args.units : null,
          stateRef: typeof args.state_ref === "string" ? args.state_ref : null,
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "add_process") {
      return {
        process: this.store.addProcess({
          worldId: String(args.world_id ?? ""),
          kind: requireEnum(args.kind ?? "custom", PHYS_PROCESS_KINDS, "process kind"),
          inputs: requireStringArray(args.inputs, "inputs"),
          outputs: requireStringArray(args.outputs, "outputs"),
          backend: optionalEnum(args.backend, PHYS_BACKENDS, "process backend"),
          parameters: (args.parameters as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "record_observation") {
      return {
        observation: this.store.recordObservation({
          worldId: String(args.world_id ?? ""),
          sourceId: String(args.source_id ?? ""),
          targetIds: Array.isArray(args.target_ids) ? args.target_ids.map(String) : null,
          kind: requireEnum(args.kind ?? "custom", OBSERVATION_KINDS, "observation kind"),
          timestamp: typeof args.timestamp === "string" ? args.timestamp : undefined,
          dataRef: typeof args.data_ref === "string" ? args.data_ref : null,
          value: (args.value ?? null) as JsonValue,
          uncertainty: (args.uncertainty ?? null) as JsonValue,
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "record_intervention") {
      return {
        intervention: this.store.recordIntervention({
          worldId: String(args.world_id ?? ""),
          actorId: typeof args.actor_id === "string" ? args.actor_id : null,
          targetIds: requireStringArray(args.target_ids, "target_ids"),
          kind: requireEnum(args.kind ?? "custom", INTERVENTION_KINDS, "intervention kind"),
          timestamp: typeof args.timestamp === "string" ? args.timestamp : undefined,
          payload: (args.payload ?? {}) as JsonValue,
          expectedEffects: Array.isArray(args.expected_effects) ? args.expected_effects.map(String) : null,
          metadata: (args.metadata as JsonObject) ?? {}
        }) as unknown as JsonObject
      };
    }
    if (name === "query_history") {
      return this.store.queryHistory(String(args.world_id ?? ""), Number(args.limit ?? 100)) as unknown as JsonObject;
    }
    if (name === "export_world") {
      return { world: this.exportWorld(String(args.world_id ?? "")) };
    }
    if (name === "list_protocol_adapters") {
      return { adapters: this.protocolAdapters() as unknown as JsonObject[] };
    }
    if (name === "list_sim_sessions") {
      return {
        sessions: Array.from(this.simSessions.values()).map((session) => this.simSessionPayload(session, session.lastSnapshot)) as unknown as JsonObject[]
      };
    }
    if (name === "set_aerial_control") {
      return this.setAerialControl(args);
    }
    if (name === "connect_controller") {
      const protocol = requireEnum(args.protocol ?? "none", PROTOCOLS, "protocol");
      const controller = this.store.connectController({
          entityId: String(args.entity_id ?? ""),
          protocol,
          endpoint: typeof args.endpoint === "string" ? args.endpoint : null,
          config: (args.config as JsonObject) ?? {}
      });
      const adapter = this.adapters.get(protocol);
      if (adapter && protocol !== "none") {
        await adapter.connect({ endpoint: controller.endpoint, config: controller.config });
        return { controller: this.store.updateControllerStatus(controller.id, "connected") as unknown as JsonObject };
      }
      return { controller: controller as unknown as JsonObject };
    }
    if (name === "read_state") {
      const entityId = String(args.entity_id ?? "");
      const entity = this.store.getWorldEntity(entityId);
      if (!entity) throw new Error(`Unknown entity_id: ${entityId}`);
      const controllers = this.store.listEntityControllers(entity.id);
      const adapterState = await this.readAdapterState(entity.id);
      return { entity_id: entity.id, state: entity.state, controllers: controllers as unknown as JsonObject[], adapter_state: adapterState };
    }
    if (name === "send_command") {
      const entityId = String(args.entity_id ?? "");
      const command = parseRobotCommand(args.command);
      const entity = this.store.getWorldEntity(entityId);
      if (!entity) throw new Error(`Unknown entity_id: ${entityId}`);
      const result = await this.dispatchCommand(entity.id, command);
      const intervention = this.store.recordIntervention({
        worldId: entity.world_id,
        actorId: typeof args.actor_id === "string" ? args.actor_id : null,
        targetIds: [entity.id],
        kind: "robot_command",
        payload: command as unknown as JsonValue,
        metadata: { via: "send_command", adapter_result: result as JsonValue }
      });
      return { ok: true, result: result as JsonValue, intervention: intervention as unknown as JsonObject };
    }
    if (name === "disconnect_controller") {
      const controllerId = String(args.controller_id ?? "");
      const controller = this.store.listEntityControllers().find((item) => item.id === controllerId);
      if (!controller) throw new Error(`Unknown controller_id: ${controllerId}`);
      const adapter = this.adapters.get(controller.protocol);
      if (adapter) await adapter.disconnect();
      return { controller: this.store.updateControllerStatus(controllerId, "disconnected") as unknown as JsonObject };
    }
    if (["start_sim", "pause_sim", "resume_sim", "stop_sim", "reset_sim", "step_sim"].includes(name)) {
      return this.handleSimTool(name, args);
    }
    if (name === "list_experiment_artifacts") {
      return { artifacts: this.store.listArtifacts(String(args.experiment_id)) };
    }
    if (name === "set_default_robot") {
      const robotId = String(args.robot_id ?? "").trim();
      if (!robotId) throw new Error("set_default_robot requires robot_id.");
      const worldId = this.worldIdForArgs(args);
      this.store.setDefaultRobotForWorld(worldId, robotId);
      return { robot_id: robotId, world_id: worldId };
    }
    if (name === "get_default_robot") {
      const worldId = this.worldIdForArgs(args);
      return { robot_id: this.store.getWorld(worldId)?.default_robot_id ?? null, world_id: worldId };
    }
    if (name === "record_ph") {
      const value = Number(args.value);
      const note = typeof args.note === "string" ? args.note : "";
      const experimentIdArg = typeof args.experiment_id === "string" ? args.experiment_id : "";
      if (!experimentIdArg) return { ok: false, error: "experiment_id required" };
      if (!Number.isFinite(value)) return { ok: false, error: "value must be numeric" };
      const timestamp = Date.now();
      this.store.appendEvent({
        experimentId: experimentIdArg,
        type: "tool_call",
        name,
        content: { arguments: { value, note } }
      });
      this.store.appendEvent({
        experimentId: experimentIdArg,
        type: "ph_sample",
        role: "system",
        content: { value, note, timestamp }
      });
      this.emit("agent-event", {
        type: "ph_sample",
        experiment_id: experimentIdArg,
        value,
        note,
        timestamp
      });
      const result = { ok: true, value, note, timestamp };
      this.store.appendEvent({ experimentId: experimentIdArg, type: "tool_response", name, content: result });
      return result;
    }

    const experimentId = typeof args.experiment_id === "string" ? args.experiment_id : undefined;
    const cleanArgs = this.withRobotId(name, { ...args });
    delete cleanArgs.experiment_id;
    delete cleanArgs.world_id;
    if (experimentId) {
      this.store.appendEvent({ experimentId, type: "tool_call", name, content: { arguments: cleanArgs } });
    }
    const result = await this.executeTool(name, cleanArgs);
    if (name === "list_connected_robots") this.recordDetectedPhysicalRobots(result);
    if (experimentId) {
      const enriched = this.persistArtifacts(experimentId, name, result);
      this.store.appendEvent({ experimentId, type: "tool_response", name, content: enriched });
      return enriched;
    }
    return result;
  }

  createExperiment(name: string, metadata: JsonObject = {}, worldId = DEFAULT_PHYSICAL_WORLD_ID, seed?: unknown): JsonObject {
    const experiment = this.store.createExperiment(name, metadata, worldId, seed);
    const session = this.store.createSession(experiment.id, DEFAULT_MODEL);
    this.store.appendEvent({
      experimentId: experiment.id,
      sessionId: session.id,
      type: "message",
      role: "system",
      content: { text: "Experiment created." }
    });
    return { experiment: experiment as unknown as JsonObject, session: session as unknown as JsonObject };
  }

  listExperiments(): Experiment[] {
    return this.store.listExperiments();
  }

  async streamAgentMessage(input: {
    experimentId: string;
    sessionId?: string;
    message: string;
    model?: string;
  }): Promise<void> {
    await this.init();
    const sessionId = input.sessionId ?? this.store.createSession(input.experimentId, input.model ?? DEFAULT_MODEL).id;
    const model = input.model ?? DEFAULT_MODEL;
    this.store.appendEvent({
      experimentId: input.experimentId,
      sessionId,
      type: "message",
      role: "user",
      content: { text: input.message }
    });
    this.emit("agent-event", { type: "message", role: "user", text: input.message, experiment_id: input.experimentId, session_id: sessionId });

    const client = new OpenAI();
    try {
      let text = "";
      const instructions =
        "You are controlling a local LeRobot experiment through phys-0. Your agent session is scoped to one world through the experiment; do not ask the user for world_id or pass world_id to tools unless explicitly changing world management. Use tools when hardware state, camera state, arm motion, or human voice interaction is required. Use speak_to_human to talk out loud. Treat listen_to_human transcripts as human messages. When you observe a universal-indicator color in a camera frame, estimate the pH and call record_ph(value) so the operator's real-time chart updates. Keep motions conservative and prefer known pose-table references.";
      let nextInput: unknown = this.sessionMessages(input.experimentId, sessionId);
      let previousResponseId: string | undefined;
      const tools = await this.openAiTools();

      for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
        const stream = await client.responses.create({
          model,
          instructions,
          input: nextInput as never,
          previous_response_id: previousResponseId,
          tools: tools as never,
          stream: true
        });
        let response: unknown = null;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta") {
            text += event.delta;
            this.store.appendEvent({
              experimentId: input.experimentId,
              sessionId,
              type: "assistant_delta",
              role: "assistant",
              content: { text: event.delta }
            });
            this.emit("agent-event", {
              type: "assistant_delta",
              text: event.delta,
              experiment_id: input.experimentId,
              session_id: sessionId
            });
          }
          if (event.type === "response.completed") {
            response = event.response;
          }
        }

        const completed = response as {
          id?: string;
          output?: Array<{ type?: string; call_id?: string; name?: string; arguments?: string }>;
        } | null;
        previousResponseId = completed?.id ?? previousResponseId;
        const calls = (completed?.output ?? []).filter((item) => item.type === "function_call" && item.call_id && item.name);
        if (calls.length === 0) {
          this.store.appendEvent({
            experimentId: input.experimentId,
            sessionId,
            type: "assistant_done",
            role: "assistant",
            content: { text, response: (completed ?? {}) as unknown as JsonObject }
          });
          this.store.appendEvent({
            experimentId: input.experimentId,
            sessionId,
            type: "message",
            role: "assistant",
            content: { text }
          });
          this.emit("agent-event", { type: "assistant_done", text, experiment_id: input.experimentId, session_id: sessionId });
          return;
        }

        const outputs: JsonObject[] = [];
        for (const call of calls) {
          const toolArgs = this.parseToolArguments(call.arguments ?? "{}");
          const result = await this.callTool(String(call.name), { ...toolArgs, experiment_id: input.experimentId });
          outputs.push({
            type: "function_call_output",
            call_id: String(call.call_id),
            output: JSON.stringify(result)
          });
          this.emit("agent-event", {
            type: "tool_response",
            name: String(call.name),
            result,
            experiment_id: input.experimentId,
            session_id: sessionId
          });
        }
        nextInput = outputs;
      }

      this.store.appendEvent({
        experimentId: input.experimentId,
        sessionId,
        type: "error",
        role: "system",
        content: { message: `Agent exceeded ${MAX_AGENT_STEPS} tool iterations.` }
      });
      this.emit("agent-event", {
        type: "error",
        message: `Agent exceeded ${MAX_AGENT_STEPS} tool iterations.`,
        experiment_id: input.experimentId,
        session_id: sessionId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.store.appendEvent({
        experimentId: input.experimentId,
        sessionId,
        type: "error",
        role: "system",
        content: { message }
      });
      this.emit("agent-event", { type: "error", message, experiment_id: input.experimentId, session_id: sessionId });
    }
  }

  stop(): void {
    for (const session of this.simSessions.values()) {
      void session.worker.terminate();
    }
    this.simSessions.clear();
    this.bridge.stop();
  }

  private persistArtifacts(experimentId: string, toolName: string, result: JsonObject): JsonObject {
    const content = Array.isArray(result.content) ? result.content : [];
    const artifacts: JsonObject[] = [];
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const block = item as JsonObject;
      if (block.type !== "image" || typeof block.data !== "string") continue;
      const mimeType = typeof block.mimeType === "string" ? block.mimeType : "application/octet-stream";
      const artifact = this.store.writeArtifact(
        experimentId,
        "tool_image",
        mimeType,
        Buffer.from(block.data, "base64"),
        { tool: toolName }
      );
      artifacts.push(artifact);
    }
    const audio = result.audio;
    if (audio && typeof audio === "object" && !Array.isArray(audio)) {
      const audioObject = audio as JsonObject;
      if (typeof audioObject.absolute_path === "string") {
        const mimeType = typeof audioObject.mime_type === "string" ? audioObject.mime_type : "application/octet-stream";
        const artifact = this.store.writeArtifact(
          experimentId,
          "tool_audio",
          mimeType,
          fs.readFileSync(audioObject.absolute_path),
          { tool: toolName }
        );
        artifacts.push(artifact);
      }
    }
    if (artifacts.length === 0) return result;
    return { ...result, artifacts };
  }

  private async executeTool(name: string, args: JsonObject): Promise<JsonObject> {
    if (name === "speak_to_human") return this.audio.speakToHuman(args);
    if (name === "listen_to_human") return this.audio.listenToHuman(args);
    return this.bridge.request("tools/call", { name, arguments: args });
  }

  private withExperimentId(tool: JsonObject): JsonObject {
    const schema = (tool.inputSchema ?? {}) as JsonObject;
    const properties = ((schema.properties ?? {}) as JsonObject);
    const shouldIncludeRobot = typeof tool.name === "string" && ROBOT_TOOL_NAMES.has(tool.name);
    return {
      ...tool,
      inputSchema: {
        ...schema,
        properties: {
          ...properties,
          experiment_id: {
            type: "string",
            description: "Optional experiment id used by the Node backend to log MCP tool calls and responses."
          },
          ...(shouldIncludeRobot
            ? {
                robot_id: {
                  type: ["string", "null"],
                  default: null,
                  description: "Optional robot selector. If omitted or null, the backend default robot is used."
                }
              }
            : {})
        }
      }
    };
  }

  private withRobotId(name: string, args: JsonObject): JsonObject {
    if (!ROBOT_TOOL_NAMES.has(name)) return args;
    if (typeof args.robot_id === "string" && args.robot_id.trim()) return args;
    const worldId = this.worldIdForArgs(args);
    const robotId = this.store.getWorld(worldId)?.default_robot_id;
    if (robotId) return { ...args, robot_id: robotId };
    delete args.robot_id;
    return args;
  }

  private worldIdForArgs(args: JsonObject): string {
    if (typeof args.world_id === "string" && args.world_id.trim()) return args.world_id;
    if (typeof args.experiment_id === "string" && args.experiment_id.trim()) {
      return this.store.getExperiment(args.experiment_id)?.world_id ?? DEFAULT_PHYSICAL_WORLD_ID;
    }
    return DEFAULT_PHYSICAL_WORLD_ID;
  }

  private recordDetectedPhysicalRobots(result: JsonObject): void {
    const parsed = this.parseToolResultJson(result);
    const robots = parsed && Array.isArray(parsed.robots) ? parsed.robots : [];
    for (const raw of robots) {
      if (!raw || typeof raw !== "object") continue;
      const robot = raw as JsonObject;
      const robotId = String(robot.suggested_robot_id ?? robot.robot_id ?? "").trim();
      if (!robotId) continue;
      this.store.assignRobotToWorld({
        robotId,
        worldId: DEFAULT_PHYSICAL_WORLD_ID,
        robotKind: "physical",
        port: typeof robot.port === "string" ? robot.port : null,
        metadata: {
          looks_like_so101: robot.looks_like_so101 === true,
          servo_ids: Array.isArray(robot.servo_ids) ? robot.servo_ids : []
        }
      });
    }
  }

  private parseToolResultJson(result: JsonObject): JsonObject | null {
    const content = result.content;
    const text = Array.isArray(content) && typeof (content[0] as JsonObject | undefined)?.text === "string"
      ? String((content[0] as JsonObject).text)
      : "";
    if (!text) return result;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      return null;
    }
    return null;
  }

  private loadAssetRegistry(): void {
    for (const manifest of this.assetRegistry.loadManifests()) this.store.upsertAssetManifest(manifest);
  }

  private validateAsset(assetId: string): JsonObject {
    const asset = this.store.getAssetManifest(assetId);
    if (!asset) throw new Error(`Unknown asset_id: ${assetId}`);
    return this.assetRegistry.validateManifest(asset.manifest) as unknown as JsonObject;
  }

  private assertAssetSpawnable(assetId: string, allowUnvalidated: boolean): void {
    const asset = this.store.getAssetManifest(assetId);
    if (!asset) throw new Error(`Unknown asset_id: ${assetId}`);
    const validation = this.assetRegistry.validateManifest(asset.manifest);
    if ((validation.status === "failing" || validation.status === "unknown") && !allowUnvalidated) {
      throw new Error(`Asset ${assetId} is not spawnable without allow_unvalidated=true; validation status is ${validation.status}.`);
    }
  }

  private exportWorld(worldId: string): JsonObject {
    const world = this.store.getWorld(worldId);
    if (!world) throw new Error(`Unknown world_id: ${worldId}`);
    const entities = this.store.listWorldEntities(worldId);
    const fields = this.store.listWorldFields(worldId);
    const processes = this.store.listWorldProcesses(worldId);
    const regimes = Array.from(new Set(entities.flatMap((entity) => entity.regimes)));
    return {
      id: world.id,
      name: world.name,
      kind: world.type === "virtual" ? "simulated" : "physical",
      seed: world.seed,
      regimes,
      frameConvention: typeof world.metadata.frameConvention === "string" ? world.metadata.frameConvention : "ros_enu",
      entities: entities as unknown as JsonObject[],
      fields: fields as unknown as JsonObject[],
      processes: processes as unknown as JsonObject[],
      constraints: [],
      sensors: [],
      actuators: [],
      metadata: world.metadata
    };
  }

  private protocolAdapters(): JsonObject[] {
    const configured = Array.from(this.adapters.values()).map((adapter) => adapter.status());
    const planned = ["i2c", "spi", "uart", "can"].map((id) => ({ id, status: "planned", commands: [], runtime: "hardware_bus" }));
    return [...configured, ...planned];
  }

  private async dispatchCommand(entityId: string, command: ReturnType<typeof parseRobotCommand>): Promise<unknown> {
    const simResult = await this.dispatchAerialCommandToSim(entityId, command);
    if (simResult) return simResult;
    const controllers = this.store.listEntityControllers(entityId);
    const protocol = controllers[0]?.protocol ?? (this.store.getWorldEntity(entityId)?.state.controller as Protocol | undefined) ?? "none";
    const adapter = this.adapters.get(protocol);
    if (!adapter) throw new Error(`No adapter registered for protocol: ${protocol}`);
    if (!adapter.supports(command.type)) throw new Error(`${protocol} adapter does not support command ${command.type}.`);
    return adapter.command(entityId, command);
  }

  private async dispatchAerialCommandToSim(entityId: string, command: ReturnType<typeof parseRobotCommand>): Promise<unknown | null> {
    const control = this.aerialControlFromCommand(command);
    if (!control) return null;
    const entity = this.store.getWorldEntity(entityId);
    if (!entity) throw new Error(`Unknown entity_id: ${entityId}`);
    const session = Array.from(this.simSessions.values()).find((item) => item.worldId === entity.world_id && item.status === "running");
    if (!session) return null;
    return this.sendSimAerialControl(session, entityId, control);
  }

  private async readAdapterState(entityId: string): Promise<JsonValue> {
    const controllers = this.store.listEntityControllers(entityId);
    const states: JsonValue[] = [];
    for (const controller of controllers) {
      const adapter = this.adapters.get(controller.protocol);
      if (!adapter) continue;
      states.push(await adapter.getState(entityId) as JsonValue);
    }
    return states;
  }

  private async handleSimTool(name: string, args: JsonObject): Promise<JsonObject> {
    if (name === "start_sim") return this.startSim(args);
    if (name === "pause_sim") return this.pauseSim(args);
    if (name === "resume_sim") return this.resumeSim(args);
    if (name === "step_sim") return this.stepSim(args);
    if (name === "reset_sim") return this.resetSim(args);
    if (name === "stop_sim") return this.stopSim(args);
    throw new Error(`Unknown simulation tool: ${name}`);
  }

  private async startSim(args: JsonObject): Promise<JsonObject> {
    const worldId = this.requiredWorldId(args);
    const world = this.store.getWorld(worldId);
    if (!world) throw new Error(`Unknown world_id: ${worldId}`);
    const backend = optionalEnum(args.backend, PHYS_BACKENDS, "sim backend") ?? "custom";
    const sessionId = typeof args.session_id === "string" && args.session_id.trim() ? args.session_id : `sim_${worldId}`;
    const existing = this.simSessions.get(sessionId);
    if (existing && existing.status !== "stopped") throw new Error(`Simulation session already exists: ${sessionId}`);
    this.enforceSimWorldCap(worldId);
    const fixedTimeStepS = Number(args.dt_s ?? args.fixed_time_step_s ?? 1 / 60);
    const session = this.createSimSession({
      id: sessionId,
      worldId,
      backend,
      seed: Number(args.seed ?? world.seed),
      fixedTimeStepS: Number.isFinite(fixedTimeStepS) && fixedTimeStepS > 0 ? fixedTimeStepS : 1 / 60
    });
    this.simSessions.set(session.id, session);
    const result = await this.sendSimRequest(session, {
      op: "init",
      worldId,
      seed: session.seed,
      fixedTimeStepS: session.fixedTimeStepS,
      entities: this.store.listWorldEntities(worldId)
    });
    session.lastSnapshot = result;
    this.recordSimLifecycle(worldId, "start_sim", session, result);
    return this.simSessionPayload(session, result);
  }

  private async setAerialControl(args: JsonObject): Promise<JsonObject> {
    const entityId = String(args.entity_id ?? "").trim();
    if (!entityId) throw new Error("set_aerial_control requires entity_id.");
    const entity = this.store.getWorldEntity(entityId);
    if (!entity) throw new Error(`Unknown entity_id: ${entityId}`);
    const session = this.resolveSimSession({ ...args, world_id: args.world_id ?? entity.world_id });
    if (session.status !== "running") throw new Error(`Simulation session is not running: ${session.id}`);
    const control = this.aerialControlFromArgs(args);
    const result = await this.sendSimAerialControl(session, entityId, control);
    const intervention = this.store.recordIntervention({
      worldId: entity.world_id,
      targetIds: [entity.id],
      kind: "robot_command",
      payload: control as unknown as JsonValue,
      metadata: { tool: "set_aerial_control", simulator: "rapier" }
    });
    return { ...result, intervention: intervention as unknown as JsonObject };
  }

  private async stepSim(args: JsonObject): Promise<JsonObject> {
    const session = this.resolveSimSession(args);
    if (session.status !== "running") throw new Error(`Simulation session is not running: ${session.id}`);
    const dtS = Number(args.dt_s ?? session.fixedTimeStepS);
    const result = await this.sendSimRequest(session, { op: "step", dtS: Number.isFinite(dtS) && dtS > 0 ? dtS : session.fixedTimeStepS });
    session.lastSnapshot = result;
    session.updatedAt = new Date().toISOString();
    this.applySimSnapshot(session.worldId, result);
    this.recordSimLifecycle(session.worldId, "step_sim", session, result);
    return this.simSessionPayload(session, result);
  }

  private async pauseSim(args: JsonObject): Promise<JsonObject> {
    const session = this.resolveSimSession(args);
    if (session.status !== "running") throw new Error(`Simulation session is not running: ${session.id}`);
    const snapshot = await this.sendSimRequest(session, { op: "snapshot" });
    session.status = "paused";
    session.updatedAt = new Date().toISOString();
    session.lastSnapshot = snapshot;
    this.recordSimLifecycle(session.worldId, "pause_sim", session, snapshot);
    return this.simSessionPayload(session, snapshot);
  }

  private async sendSimAerialControl(session: SimSession, entityId: string, control: AerialControlCommand): Promise<JsonObject> {
    const result = await this.sendSimRequest(session, { op: "control", entityId, control });
    session.lastSnapshot = result;
    session.updatedAt = new Date().toISOString();
    const entity = this.store.getWorldEntity(entityId);
    if (entity) {
      this.store.updateWorldEntity({
        entityId,
        state: { ...entity.state, aerial_control: control as unknown as JsonValue, sim: { seed: result.seed, step_count: result.step_count, elapsed_s: result.elapsed_s } }
      });
    }
    return this.simSessionPayload(session, result);
  }

  private aerialControlFromCommand(command: ReturnType<typeof parseRobotCommand>): AerialControlCommand | null {
    if (command.type === "mavlink_takeoff") return { mode: "takeoff", targetAltitudeM: command.altitudeM };
    if (command.type === "mavlink_land") return { mode: "land", targetAltitudeM: 0.06 };
    if (command.type === "mavlink_goto") {
      const local = command.localPose && typeof command.localPose === "object" && !Array.isArray(command.localPose) ? command.localPose : {};
      return {
        mode: "goto",
        targetAltitudeM: Number(command.alt ?? local.z ?? 1),
        targetPosition: [Number(local.x ?? 0), Number(local.y ?? 0), Number(command.alt ?? local.z ?? 1)]
      };
    }
    if (command.type === "aerial_control") {
      return {
        mode: command.mode,
        thrustN: command.thrustN,
        targetAltitudeM: command.targetAltitudeM,
        targetPosition: command.targetPosition,
        yawRateRadS: command.yawRateRadS
      };
    }
    return null;
  }

  private aerialControlFromArgs(args: JsonObject): AerialControlCommand {
    const mode = String(args.mode ?? "hover") as AerialControlCommand["mode"];
    if (!["idle", "thrust", "hover", "takeoff", "land", "goto"].includes(mode)) throw new Error("Invalid aerial control mode.");
    const targetPosition = Array.isArray(args.target_position)
      ? [Number(args.target_position[0] ?? 0), Number(args.target_position[1] ?? 0), Number(args.target_position[2] ?? 0)] as [number, number, number]
      : undefined;
    return {
      mode,
      thrustN: numberArg(args.thrust_n),
      targetAltitudeM: numberArg(args.target_altitude_m),
      targetPosition,
      yawRateRadS: numberArg(args.yaw_rate_rad_s),
      torqueNm: Array.isArray(args.torque_nm)
        ? [Number(args.torque_nm[0] ?? 0), Number(args.torque_nm[1] ?? 0), Number(args.torque_nm[2] ?? 0)]
        : undefined
    };
  }

  private async resumeSim(args: JsonObject): Promise<JsonObject> {
    const sessionId = typeof args.session_id === "string" && args.session_id.trim() ? args.session_id : "";
    const session = sessionId
      ? this.simSessions.get(sessionId)
      : Array.from(this.simSessions.values()).find((item) => item.worldId === this.requiredWorldId(args) && item.status === "paused");
    if (!session) throw new Error("Unknown paused simulation session.");
    if (session.status !== "paused") throw new Error(`Simulation session is not paused: ${session.id}`);
    const snapshot = await this.sendSimRequest(session, { op: "snapshot" });
    session.status = "running";
    session.updatedAt = new Date().toISOString();
    session.lastSnapshot = snapshot;
    this.recordSimLifecycle(session.worldId, "resume_sim", session, snapshot);
    return this.simSessionPayload(session, snapshot);
  }

  private async resetSim(args: JsonObject): Promise<JsonObject> {
    const session = this.resolveSimSession(args);
    const world = this.store.getWorld(session.worldId);
    const seed = Number(args.seed ?? world?.seed ?? session.seed);
    const result = await this.sendSimRequest(session, {
      op: "reset",
      seed,
      entities: this.store.listWorldEntities(session.worldId)
    });
    session.seed = result.seed;
    session.status = "running";
    session.updatedAt = new Date().toISOString();
    session.lastSnapshot = result;
    this.applySimSnapshot(session.worldId, result);
    this.recordSimLifecycle(session.worldId, "reset_sim", session, result);
    return this.simSessionPayload(session, result);
  }

  private async stopSim(args: JsonObject): Promise<JsonObject> {
    const session = this.resolveSimSession(args);
    const snapshot = await this.sendSimRequest(session, { op: "snapshot" }).catch(() => session.lastSnapshot);
    await this.sendSimRequest(session, { op: "destroy" }).catch(() => null);
    await session.worker.terminate();
    session.status = "stopped";
    session.updatedAt = new Date().toISOString();
    this.simSessions.delete(session.id);
    if (snapshot) this.recordSimLifecycle(session.worldId, "stop_sim", session, snapshot);
    return this.simSessionPayload(session, snapshot ?? session.lastSnapshot);
  }

  private createSimSession(input: { id: string; worldId: string; backend: string; seed: number; fixedTimeStepS: number }): SimSession {
    const worker = new Worker(path.join(__dirname, "simWorker.js"));
    const pending = new Map<number, { resolve: (value: SimWorkerResponse) => void; reject: (error: Error) => void }>();
    const session: SimSession = {
      id: input.id,
      worldId: input.worldId,
      backend: input.backend,
      seed: input.seed,
      fixedTimeStepS: input.fixedTimeStepS,
      status: "running",
      worker,
      requestId: 0,
      pending,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSnapshot: null
    };
    worker.on("message", (message: { id?: number; ok?: boolean; result?: SimWorkerResponse; error?: string }) => {
      const id = Number(message.id);
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      if (message.ok) waiter.resolve(message.result as SimWorkerResponse);
      else waiter.reject(new Error(message.error ?? "Simulation worker request failed."));
    });
    worker.on("error", (error) => {
      session.status = "error";
      for (const [, waiter] of pending) waiter.reject(error);
      pending.clear();
    });
    return session;
  }

  private sendSimRequest(session: SimSession, payload: Record<string, unknown>): Promise<SimWorkerResponse> {
    const id = ++session.requestId;
    return new Promise((resolve, reject) => {
      session.pending.set(id, { resolve, reject });
      session.worker.postMessage({ id, ...payload });
    });
  }

  private applySimSnapshot(worldId: string, result: SimWorkerResponse): void {
    const poses = result.snapshot?.poses ?? {};
    for (const [entityId, pose] of Object.entries(poses).sort(([a], [b]) => a.localeCompare(b))) {
      const entity = this.store.getWorldEntity(entityId);
      if (!entity || entity.world_id !== worldId) continue;
      this.store.updateWorldEntity({
        entityId,
        pose: poseToJson(pose),
        state: { ...entity.state, sim: { seed: result.seed, step_count: result.step_count, elapsed_s: result.elapsed_s } }
      });
    }
    if ((result.snapshot?.contacts ?? []).length > 0) {
      this.store.recordObservation({
        worldId,
        sourceId: "simulation",
        kind: "state_estimate",
        value: { contacts: result.snapshot?.contacts ?? [], step_count: result.step_count } as JsonValue,
        metadata: { simulator: "rapier" }
      });
    }
  }

  private recordSimLifecycle(worldId: string, tool: string, session: SimSession, result: SimWorkerResponse): void {
    this.store.recordIntervention({
      worldId,
      targetIds: [],
      kind: "environment_change",
      payload: this.simSessionPayload(session, result) as unknown as JsonValue,
      metadata: { tool, simulator: "rapier" }
    });
  }

  private simSessionPayload(session: SimSession, result: SimWorkerResponse | null): JsonObject {
    return {
      session_id: session.id,
      world_id: session.worldId,
      backend: session.backend,
      status: session.status,
      seed: result?.seed ?? session.seed,
      fixed_time_step_s: result?.fixed_time_step_s ?? session.fixedTimeStepS,
      elapsed_s: result?.elapsed_s ?? session.lastSnapshot?.elapsed_s ?? 0,
      step_count: result?.step_count ?? session.lastSnapshot?.step_count ?? 0,
      snapshot: (result?.snapshot ?? session.lastSnapshot?.snapshot ?? {}) as unknown as JsonObject,
      worker: { mode: "worker_thread", max_worlds: this.maxSimWorlds },
      started_at: session.startedAt,
      updated_at: session.updatedAt
    };
  }

  private resolveSimSession(args: JsonObject): SimSession {
    const sessionId = typeof args.session_id === "string" && args.session_id.trim() ? args.session_id : "";
    if (sessionId) {
      const session = this.simSessions.get(sessionId);
      if (!session) throw new Error(`Unknown simulation session: ${sessionId}`);
      return session;
    }
    const worldId = this.requiredWorldId(args);
    const sessions = Array.from(this.simSessions.values()).filter((session) => session.worldId === worldId && session.status !== "stopped");
    if (sessions.length !== 1) throw new Error(`Expected exactly one simulation session for world_id ${worldId}; found ${sessions.length}.`);
    return sessions[0];
  }

  private requiredWorldId(args: JsonObject): string {
    const worldId = typeof args.world_id === "string" && args.world_id.trim() ? args.world_id : "";
    if (!worldId) throw new Error("Simulation tool requires world_id.");
    return worldId;
  }

  private enforceSimWorldCap(nextWorldId: string): void {
    const activeWorlds = new Set(Array.from(this.simSessions.values()).filter((session) => session.status === "running").map((session) => session.worldId));
    activeWorlds.add(nextWorldId);
    if (activeWorlds.size > this.maxSimWorlds) throw new Error(`Concurrent simulated world cap exceeded: ${activeWorlds.size}/${this.maxSimWorlds}.`);
  }

  private backendTools(): JsonObject[] {
    return [
      {
        name: "create_experiment",
        description: "Create a tracked experiment and default agent session in the Node backend.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the default physical world."
            },
            metadata: { type: "object", additionalProperties: true }
          },
          additionalProperties: false
        }
      },
      {
        name: "list_worlds",
        description: "List physical and virtual worlds plus robot-world assignments.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "create_world",
        description: "Create a physical or virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", enum: ["physical", "virtual"] },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["name", "type"],
          additionalProperties: false
        }
      },
      {
        name: "delete_world",
        description: "Delete a world with no experiments. The default physical world is protected.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" } },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "update_world",
        description: "Update world settings such as display name and metadata.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "assign_robot_to_world",
        description: "Assign a physical robot to a physical world or a virtual robot to a virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            robot_id: { type: "string" },
            world_id: { type: "string" },
            robot_kind: { type: "string", enum: ["physical", "virtual"] },
            port: { type: ["string", "null"] },
            make_default: { type: "boolean", default: false },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["robot_id", "world_id", "robot_kind"],
          additionalProperties: false
        }
      },
      {
        name: "delete_robot_assignment",
        description: "Remove a robot assignment from its world without touching physical hardware.",
        inputSchema: {
          type: "object",
          properties: { robot_id: { type: "string" } },
          required: ["robot_id"],
          additionalProperties: false
        }
      },
      {
        name: "list_virtual_entities",
        description: "List virtual arms, cameras, and rigid bodies placed in virtual worlds.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string", description: "Optional virtual world id filter." }
          },
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_arm",
        description:
          "Place a virtual SO-101 arm in a virtual world and register it as a virtual robot. The entity is collidable using full URDF collision mode.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            model: { type: "string", default: "so101" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true },
            make_default: { type: "boolean", default: false }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_camera",
        description: "Place a virtual camera in a virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_light",
        description: "Place a virtual light in a virtual world.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "create_virtual_rigid_body",
        description:
          "Place a virtual rigid body in a virtual world with full collision enabled by default. Provide collision shape, dimensions, and mass through spec.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true },
            collision_enabled: { type: "boolean", default: true }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "delete_virtual_entity",
        description: "Delete a virtual arm, camera, or rigid body.",
        inputSchema: {
          type: "object",
          properties: { entity_id: { type: "string" } },
          required: ["entity_id"],
          additionalProperties: false
        }
      },
      {
        name: "update_virtual_entity",
        description: "Update virtual entity name, pose, spec, or collision state.",
        inputSchema: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            name: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            spec: { type: "object", additionalProperties: true },
            collision_enabled: { type: "boolean" }
          },
          required: ["entity_id"],
          additionalProperties: false
        }
      },
      {
        name: "list_experiments",
        description: "List tracked experiments from the local SQLite store.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "list_asset_catalog",
        description: "List committed phys-0 asset manifests with quality, provenance, variants, protocols, and validation status.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "get_asset_manifest",
        description: "Return a single phys-0 asset manifest.",
        inputSchema: {
          type: "object",
          properties: { asset_id: { type: "string" } },
          required: ["asset_id"],
          additionalProperties: false
        }
      },
      {
        name: "validate_asset",
        description: "Run deterministic local manifest/path validation for a committed asset. This is the phase-2 validator, not full sim spawn certification.",
        inputSchema: {
          type: "object",
          properties: { asset_id: { type: "string" } },
          required: ["asset_id"],
          additionalProperties: false
        }
      },
      {
        name: "import_asset",
        description: "Import a local asset description bundle into assets/imported and create a canonical phys-0 manifest.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" },
            id: { type: "string" },
            name: { type: "string" },
            kind: { type: "string" },
            embodiment: { type: "string" },
            format: { type: "string" },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["path", "id"],
          additionalProperties: false
        }
      },
      {
        name: "patch_asset",
        description: "Append an explicit patch-history entry to an asset manifest and persist it in assets/registry.",
        inputSchema: {
          type: "object",
          properties: {
            asset_id: { type: "string" },
            patch: { type: "object", additionalProperties: true }
          },
          required: ["asset_id", "patch"],
          additionalProperties: false
        }
      },
      {
        name: "spawn_robot",
        description: "Spawn a robot asset as a generic phys-0 world entity. Controller connectivity is tracked separately.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            asset_id: { type: "string" },
            variant: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            backend: { type: "string" },
            controller: { type: "string" },
            allow_unvalidated: { type: "boolean", default: false },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "asset_id"],
          additionalProperties: false
        }
      },
      {
        name: "spawn_object",
        description: "Spawn an object asset as a phys-0 world entity.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            asset_id: { type: "string" },
            variant: { type: "string" },
            pose: { type: "object", additionalProperties: true },
            static: { type: "boolean" },
            allow_unvalidated: { type: "boolean", default: false },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "asset_id"],
          additionalProperties: false
        }
      },
      {
        name: "spawn_entity",
        description: "Spawn any phys-0 entity kind for process-world modeling.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            kind: { type: "string" },
            asset_id: { type: ["string", "null"] },
            regimes: { type: "array", items: { type: "string" } },
            state: { type: "object", additionalProperties: true },
            pose: { type: "object", additionalProperties: true },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "kind"],
          additionalProperties: false
        }
      },
      {
        name: "add_field",
        description: "Add a first-class physical field such as temperature, concentration, belief, risk, light, or electric potential.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            kind: { type: "string" },
            domain: { type: "object", additionalProperties: true },
            units: { type: "string" },
            state_ref: { type: "string" },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "kind", "domain"],
          additionalProperties: false
        }
      },
      {
        name: "add_process",
        description: "Add a world process graph node such as chemical reaction, controller, diffusion, thermal transfer, or rigid dynamics.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            kind: { type: "string" },
            inputs: { type: "array", items: { type: "string" } },
            outputs: { type: "array", items: { type: "string" } },
            backend: { type: "string" },
            parameters: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "kind", "inputs", "outputs"],
          additionalProperties: false
        }
      },
      {
        name: "record_observation",
        description: "Record a first-class observation such as image, pose, pH/chemical measurement, electrical signal, audio, or human annotation.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            source_id: { type: "string" },
            target_ids: { type: "array", items: { type: "string" } },
            kind: { type: "string" },
            timestamp: { type: "string" },
            data_ref: { type: "string" },
            value: {},
            uncertainty: {},
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "source_id", "kind"],
          additionalProperties: false
        }
      },
      {
        name: "record_intervention",
        description: "Record a first-class intervention such as robot command, material addition, mixing, heating, measurement, or environment change.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            actor_id: { type: "string" },
            target_ids: { type: "array", items: { type: "string" } },
            kind: { type: "string" },
            timestamp: { type: "string" },
            payload: {},
            expected_effects: { type: "array", items: { type: "string" } },
            metadata: { type: "object", additionalProperties: true }
          },
          required: ["world_id", "target_ids", "kind", "payload"],
          additionalProperties: false
        }
      },
      {
        name: "query_history",
        description: "Return observation and intervention history for a world.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, limit: { type: "number", default: 100 } },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "export_world",
        description: "Export a canonical phys-0 world document with entities, fields, processes, and metadata.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" } },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "list_protocol_adapters",
        description: "List implemented, stubbed, and planned protocol/runtime adapters.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "connect_controller",
        description: "Attach a protocol/controller configuration to an entity without assuming it is currently connected.",
        inputSchema: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            protocol: { type: "string" },
            endpoint: { type: "string" },
            config: { type: "object", additionalProperties: true }
          },
          required: ["entity_id", "protocol"],
          additionalProperties: false
        }
      },
      {
        name: "disconnect_controller",
        description: "Disconnect an entity controller adapter and mark the controller record disconnected.",
        inputSchema: {
          type: "object",
          properties: { controller_id: { type: "string" } },
          required: ["controller_id"],
          additionalProperties: false
        }
      },
      {
        name: "read_state",
        description: "Read the stored phys-0 entity state and associated controller records.",
        inputSchema: {
          type: "object",
          properties: { entity_id: { type: "string" } },
          required: ["entity_id"],
          additionalProperties: false
        }
      },
      {
        name: "send_command",
        description: "Record a robot/controller command as an intervention. Current generic adapter path is dry-run unless bridged by an embodiment-specific tool.",
        inputSchema: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            actor_id: { type: "string" },
            command: {}
          },
          required: ["entity_id", "command"],
          additionalProperties: false
        }
      },
      {
        name: "start_sim",
        description: "Start a deterministic worker-thread simulation session for a world/backend pair.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: { type: "string" },
            backend: { type: "string" },
            session_id: { type: "string" },
            seed: { type: ["number", "string"] },
            dt_s: { type: "number" },
            fixed_time_step_s: { type: "number" }
          },
          required: ["world_id"],
          additionalProperties: false
        }
      },
      {
        name: "stop_sim",
        description: "Stop a running simulation session and terminate its worker.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, backend: { type: "string" }, session_id: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        name: "pause_sim",
        description: "Pause a running simulation session without terminating its worker.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, session_id: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        name: "resume_sim",
        description: "Resume a paused simulation session.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, session_id: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        name: "reset_sim",
        description: "Reset a running simulation session from current world entities.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, backend: { type: "string" }, session_id: { type: "string" }, seed: { type: ["number", "string"] } },
          additionalProperties: false
        }
      },
      {
        name: "step_sim",
        description: "Step a running deterministic simulation session and sync poses into world_entities.",
        inputSchema: {
          type: "object",
          properties: { world_id: { type: "string" }, backend: { type: "string" }, session_id: { type: "string" }, dt_s: { type: "number" } },
          additionalProperties: false
        }
      },
      {
        name: "list_sim_sessions",
        description: "List active in-process simulation sessions and their latest snapshots.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: "set_aerial_control",
        description: "Set force-based aerial control for a simulated drone entity in a running simulation session.",
        inputSchema: {
          type: "object",
          properties: {
            entity_id: { type: "string" },
            world_id: { type: "string" },
            session_id: { type: "string" },
            mode: { type: "string", enum: ["idle", "thrust", "hover", "takeoff", "land", "goto"] },
            thrust_n: { type: "number" },
            target_altitude_m: { type: "number" },
            target_position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 },
            yaw_rate_rad_s: { type: "number" },
            torque_nm: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }
          },
          required: ["entity_id", "mode"],
          additionalProperties: false
        }
      },
      {
        name: "list_agent_session_events",
        description: "List logged agent session events for an experiment.",
        inputSchema: {
          type: "object",
          properties: { experiment_id: { type: "string" } },
          required: ["experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "list_experiment_artifacts",
        description: "List blob-store artifact references for an experiment.",
        inputSchema: {
          type: "object",
          properties: { experiment_id: { type: "string" } },
          required: ["experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "set_default_robot",
        description: "Set the backend default robot id used when robot tools omit robot_id.",
        inputSchema: {
          type: "object",
          properties: {
            robot_id: { type: "string" },
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the experiment world when experiment_id is provided, otherwise the default physical world."
            },
            experiment_id: {
              type: "string",
              description: "Optional experiment id used to infer world scope."
            }
          },
          required: ["robot_id"],
          additionalProperties: false
        }
      },
      {
        name: "get_default_robot",
        description: "Return the backend default robot id, or null if no default has been set.",
        inputSchema: {
          type: "object",
          properties: {
            world_id: {
              type: "string",
              description: "Optional world id. Defaults to the experiment world when experiment_id is provided, otherwise the default physical world."
            },
            experiment_id: {
              type: "string",
              description: "Optional experiment id used to infer world scope."
            }
          },
          additionalProperties: false
        }
      },
      {
        name: "record_ph",
        description: "Record a pH reading (typically 0-14) for the current experiment after observing the universal indicator color from a camera frame. Updates the operator's real-time pH chart.",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "number" },
            note: { type: "string" },
            experiment_id: { type: "string" }
          },
          required: ["value", "experiment_id"],
          additionalProperties: false
        }
      },
      {
        name: "speak_to_human",
        description:
          "Speak a short message to the nearby human. Uses ElevenLabs when ELEVENLABS_API_KEY is configured, or macOS system speech with provider: system.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "The exact message to speak aloud." },
            provider: { type: "string", enum: ["openai", "elevenlabs", "system"], default: "openai" },
            voice: { type: "string", description: "Optional OpenAI TTS voice." },
            voice_id: { type: "string", description: "Optional ElevenLabs voice id." },
            model_id: { type: "string", description: "Optional provider model id." },
            instructions: { type: "string", description: "Optional OpenAI TTS style instructions." },
            response_format: { type: "string", enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"], default: "mp3" },
            play: { type: "boolean", default: true },
            experiment_id: { type: "string" }
          },
          required: ["text"],
          additionalProperties: false
        }
      },
      {
        name: "listen_to_human",
        description:
          "Transcribe human speech from an audio file or Electron-recorded audio clip. Requires OPENAI_API_KEY.",
        inputSchema: {
          type: "object",
          properties: {
            audio_path: { type: "string", description: "Local audio file path visible to the backend process." },
            audio_base64: { type: "string", description: "Base64 audio payload, primarily used by the Electron recorder." },
            mime_type: { type: "string", default: "audio/webm" },
            language: { type: "string" },
            model: { type: "string", default: "gpt-4o-mini-transcribe" },
            experiment_id: { type: "string" }
          },
          additionalProperties: false
        }
      }
    ];
  }

  private sessionMessages(experimentId: string, sessionId: string): JsonObject[] {
    return this.store
      .listEvents(experimentId)
      .filter((event) => event.session_id === sessionId && (event.type === "message" || event.type === "assistant_done"))
      .filter((event) => event.role === "user" || event.role === "assistant")
      .map((event) => ({
        role: event.role,
        content: typeof event.content.text === "string" ? event.content.text : JSON.stringify(event.content)
      }));
  }

  private async openAiTools(): Promise<JsonObject[]> {
    const listed = await this.listTools();
    return ((listed.tools ?? []) as JsonObject[])
      .filter((tool) => tool.name !== "create_experiment")
      .map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description ?? "",
        parameters: tool.inputSchema ?? { type: "object", properties: {} }
      }));
  }

  private parseToolArguments(raw: string): JsonObject {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      // Fall through to an empty argument object.
    }
    return {};
  }
}

function numberArg(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
