import { spawnSync } from "node:child_process";
import type { JsonObject, JsonValue, Protocol } from "./types";

export type AdapterConfig = {
  endpoint?: string | null;
  config?: JsonObject;
};

export type RobotCommand =
  | { type: "joint_position"; positions: Record<string, number>; durationMs?: number }
  | { type: "joint_velocity"; velocities: Record<string, number>; durationMs?: number }
  | { type: "cartesian_pose"; frame: string; pose: JsonObject; durationMs?: number }
  | { type: "gripper"; position?: number; effort?: number }
  | { type: "cmd_vel"; linear: [number, number, number]; angular: [number, number, number] }
  | { type: "mavlink_takeoff"; altitudeM: number }
  | { type: "mavlink_land" }
  | { type: "mavlink_goto"; lat?: number; lon?: number; alt?: number; localPose?: JsonObject }
  | { type: "aerial_control"; mode: "idle" | "thrust" | "hover" | "takeoff" | "land" | "goto"; thrustN?: number; targetAltitudeM?: number; targetPosition?: [number, number, number]; yawRateRadS?: number }
  | { type: "raw"; payload: unknown };

export interface PhysProtocolAdapter {
  id: Protocol;
  connect(config: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  getState(entityId: string): Promise<unknown>;
  command(entityId: string, command: RobotCommand): Promise<unknown>;
  supports(commandType: string): boolean;
  status(): JsonObject;
}

type BridgeRequester = (name: string, args: JsonObject) => Promise<JsonObject>;

export class LeRobotAdapter implements PhysProtocolAdapter {
  readonly id = "lerobot" as const;
  private connected = false;

  constructor(private readonly requestBridgeTool: BridgeRequester) {}

  async connect(config: AdapterConfig): Promise<void> {
    await this.requestBridgeTool("connect_so101", this.stripNulls({ robot_id: config.config?.robot_id, port: config.endpoint ?? config.config?.port }));
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.requestBridgeTool("disconnect", {});
    this.connected = false;
  }

  async getState(entityId: string): Promise<unknown> {
    return this.requestBridgeTool("get_arm_pose", { robot_id: entityId });
  }

  async command(entityId: string, command: RobotCommand): Promise<unknown> {
    if (command.type === "joint_position") {
      return this.requestBridgeTool("set_arm_pose", {
        robot_id: entityId,
        pose: command.positions as unknown as JsonValue,
        max_step: 5,
        allow_out_of_range: false
      });
    }
    if (command.type === "cartesian_pose") {
      const pose = command.pose;
      return this.requestBridgeTool("set_position", {
        robot_id: entityId,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        gripper: pose.gripper,
        max_step: 5,
        tolerance_m: 0.004,
        max_position_error_m: 0.03,
        allow_out_of_workspace: false,
        allow_out_of_range: false
      });
    }
    if (command.type === "gripper") {
      const position = Number(command.position ?? 0);
      return this.requestBridgeTool(position > 0.5 ? "open_gripper" : "close_gripper", { robot_id: entityId });
    }
    if (command.type === "raw") {
      const payload = command.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("LeRobot raw command payload must be an object.");
      const raw = payload as JsonObject;
      const tool = typeof raw.tool === "string" ? raw.tool : "";
      if (!tool) throw new Error("LeRobot raw command payload requires tool.");
      return this.requestBridgeTool(tool, (raw.arguments && typeof raw.arguments === "object" && !Array.isArray(raw.arguments) ? raw.arguments : {}) as JsonObject);
    }
    throw new Error(`LeRobot adapter does not support ${command.type}.`);
  }

  supports(commandType: string): boolean {
    return ["joint_position", "cartesian_pose", "gripper", "raw"].includes(commandType);
  }

  status(): JsonObject {
    return { id: this.id, status: this.connected ? "connected" : "available", commands: ["joint_position", "cartesian_pose", "gripper", "raw"], runtime: "python_bridge" };
  }

  private stripNulls(input: Record<string, JsonValue | undefined>): JsonObject {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value != null)) as JsonObject;
  }
}

export class ExternalRuntimeAdapter implements PhysProtocolAdapter {
  private connectedConfig: AdapterConfig | null = null;

  constructor(readonly id: Protocol, private readonly executable: string, private readonly supportedCommands: string[]) {}

  async connect(config: AdapterConfig): Promise<void> {
    if (!this.executableAvailable()) {
      throw new Error(`${this.id} runtime executable is not available on PATH: ${this.executable}`);
    }
    this.connectedConfig = config;
  }

  async disconnect(): Promise<void> {
    this.connectedConfig = null;
  }

  async getState(entityId: string): Promise<unknown> {
    return {
      entity_id: entityId,
      adapter: this.id,
      connected: Boolean(this.connectedConfig),
      runtime_available: this.executableAvailable(),
      config: this.connectedConfig
    };
  }

  async command(entityId: string, command: RobotCommand): Promise<unknown> {
    if (!this.supports(command.type)) throw new Error(`${this.id} adapter does not support ${command.type}.`);
    if (!this.connectedConfig) throw new Error(`${this.id} adapter is not connected for entity ${entityId}.`);
    return {
      entity_id: entityId,
      adapter: this.id,
      accepted: true,
      command,
      execution: "external runtime handoff",
      endpoint: this.connectedConfig.endpoint ?? null
    };
  }

  supports(commandType: string): boolean {
    return this.supportedCommands.includes(commandType);
  }

  status(): JsonObject {
    return {
      id: this.id,
      status: this.executableAvailable() ? (this.connectedConfig ? "connected" : "available") : "runtime_missing",
      executable: this.executable,
      commands: this.supportedCommands,
      runtime: "external"
    };
  }

  private executableAvailable(): boolean {
    const result = spawnSync(process.platform === "win32" ? "where" : "which", [this.executable], { encoding: "utf8" });
    return result.status === 0;
  }
}

export function parseRobotCommand(value: unknown): RobotCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Robot command must be an object.");
  const command = value as { type?: unknown };
  if (typeof command.type !== "string") throw new Error("Robot command requires string type.");
  return value as RobotCommand;
}
