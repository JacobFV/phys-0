import RAPIER from "@dimforge/rapier3d-compat";
import type { Collider, RigidBody, World } from "@dimforge/rapier3d-compat";
import type { JsonObject, PhysEntity, Quaternion, Vec3 } from "./types";
import {
  normalizeSeed,
  physicsBodyTypeForEntity,
  type PhysicsBodyDescriptor,
  type PhysicsColliderShape,
  type PhysicsPose,
  type PhysicsRuntimeFactory,
  type PhysicsStepResult,
  type PhysicsWorldRuntime,
  type AerialControlCommand
} from "./physics";

const DEFAULT_TIMESTEP_S = 1 / 60;
const DEFAULT_GRAVITY: Vec3 = [0, 0, -9.81];

type BodyRecord = {
  descriptor: PhysicsBodyDescriptor;
  body: RigidBody;
  collider: Collider;
  aerialControl?: AerialControlCommand;
};

let rapierReady: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init().then(() => undefined);
  return rapierReady;
}

export class RapierPhysicsRuntimeFactory implements PhysicsRuntimeFactory {
  async createWorld(input: { worldId: string; seed?: number; fixedTimeStepS?: number; gravity?: Vec3 }): Promise<RapierPhysicsWorldRuntime> {
    await initRapier();
    return new RapierPhysicsWorldRuntime(input);
  }
}

export class RapierPhysicsWorldRuntime implements PhysicsWorldRuntime {
  readonly worldId: string;
  readonly seed: number;
  readonly fixedTimeStepS: number;
  private readonly world: World;
  private readonly bodies = new Map<string, BodyRecord>();
  private readonly colliderToBody = new Map<number, string>();

  constructor(input: { worldId: string; seed?: number; fixedTimeStepS?: number; gravity?: Vec3 }) {
    this.worldId = input.worldId;
    this.seed = normalizeSeed(input.seed, input.worldId);
    this.fixedTimeStepS = input.fixedTimeStepS && input.fixedTimeStepS > 0 ? input.fixedTimeStepS : DEFAULT_TIMESTEP_S;
    const gravity = input.gravity ?? DEFAULT_GRAVITY;
    this.world = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
    this.world.integrationParameters.dt = this.fixedTimeStepS;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, -0.0025));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(100, 100, 0.0025), ground);
  }

  upsertBody(descriptor: PhysicsBodyDescriptor): void {
    this.removeBody(descriptor.id);
    const bodyDesc = this.bodyDesc(descriptor);
    const body = this.world.createRigidBody(bodyDesc);
    const collider = this.world.createCollider(this.colliderDesc(descriptor.collider), body);
    this.bodies.set(descriptor.id, { descriptor, body, collider });
    this.colliderToBody.set(collider.handle, descriptor.id);
  }

  removeBody(id: string): void {
    const current = this.bodies.get(id);
    if (!current) return;
    this.colliderToBody.delete(current.collider.handle);
    this.world.removeRigidBody(current.body);
    this.bodies.delete(id);
  }

  setKinematicPose(id: string, pose: PhysicsPose): void {
    const record = this.bodies.get(id);
    if (!record) throw new Error(`Unknown physics body: ${id}`);
    const q = pose.orientation;
    if (record.body.isKinematic()) {
      record.body.setNextKinematicTranslation(vec(pose.position));
      record.body.setNextKinematicRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    } else {
      record.body.setTranslation(vec(pose.position), true);
      record.body.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }, true);
      record.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      record.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  setAerialControl(id: string, control: AerialControlCommand): void {
    const record = this.bodies.get(id);
    if (!record) throw new Error(`Unknown physics body: ${id}`);
    record.aerialControl = control;
    if (control.mode === "idle") {
      record.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      record.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  step(dtS = this.fixedTimeStepS): PhysicsStepResult {
    this.world.integrationParameters.dt = dtS > 0 ? dtS : this.fixedTimeStepS;
    this.applyAerialControls(dtS);
    this.world.step();
    return this.snapshot();
  }

  snapshot(): PhysicsStepResult {
    const poses: Record<string, PhysicsPose> = {};
    const velocities: Record<string, { linear: Vec3; angular: Vec3 }> = {};
    const contacts: Array<{ a: string; b: string }> = [];
    const seenContacts = new Set<string>();
    for (const [id, record] of Array.from(this.bodies.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const t = record.body.translation();
      const r = record.body.rotation();
      const linvel = record.body.linvel();
      const angvel = record.body.angvel();
      poses[id] = { position: [t.x, t.y, t.z], orientation: [r.x, r.y, r.z, r.w] };
      velocities[id] = { linear: [linvel.x, linvel.y, linvel.z], angular: [angvel.x, angvel.y, angvel.z] };
      this.world.contactPairsWith(record.collider, (other) => {
        const otherId = this.colliderToBody.get(other.handle);
        if (!otherId || otherId === id) return;
        const pair = [id, otherId].sort().join("\u0000");
        if (seenContacts.has(pair)) return;
        seenContacts.add(pair);
        contacts.push({ a: id < otherId ? id : otherId, b: id < otherId ? otherId : id });
      });
    }
    return { poses, velocities, contacts };
  }

  private applyAerialControls(dtS: number): void {
    for (const record of this.bodies.values()) {
      const control = record.aerialControl;
      if (!control || control.mode === "idle" || !isAerialDescriptor(record.descriptor)) continue;
      const body = record.body;
      const mass = Math.max(0.001, body.mass());
      const translation = body.translation();
      const linvel = body.linvel();
      let force = { x: 0, y: 0, z: 0 };
      if (control.mode === "thrust") {
        force.z = Number(control.thrustN ?? 0);
      } else {
        const target = control.mode === "land" ? 0.06 : Number(control.targetAltitudeM ?? control.targetPosition?.[2] ?? translation.z);
        const error = target - translation.z;
        const kp = Number(record.descriptor.metadata?.aerial_kp ?? 18);
        const kd = Number(record.descriptor.metadata?.aerial_kd ?? 7);
        force.z = mass * (9.81 + kp * error - kd * linvel.z);
        if (control.mode === "goto" && control.targetPosition) {
          const xyKp = Number(record.descriptor.metadata?.aerial_xy_kp ?? 4);
          const xyKd = Number(record.descriptor.metadata?.aerial_xy_kd ?? 2);
          force.x = mass * (xyKp * (control.targetPosition[0] - translation.x) - xyKd * linvel.x);
          force.y = mass * (xyKp * (control.targetPosition[1] - translation.y) - xyKd * linvel.y);
        }
      }
      body.addForce(force, true);
      if (control.torqueNm) body.addTorque(vec(control.torqueNm), true);
      if (control.yawRateRadS != null) {
        const angvel = body.angvel();
        body.setAngvel({ x: angvel.x, y: angvel.y, z: control.yawRateRadS }, true);
      }
      if (control.mode === "land" && translation.z <= 0.07 && Math.abs(linvel.z) < 0.08) {
        record.aerialControl = { mode: "idle" };
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  }

  private bodyDesc(descriptor: PhysicsBodyDescriptor): RAPIER.RigidBodyDesc {
    const pose = descriptor.pose;
    const q = pose.orientation;
    const desc = descriptor.bodyType === "dynamic"
      ? RAPIER.RigidBodyDesc.dynamic()
      : descriptor.bodyType === "kinematic"
        ? RAPIER.RigidBodyDesc.kinematicPositionBased()
        : RAPIER.RigidBodyDesc.fixed();
    desc.setTranslation(pose.position[0], pose.position[1], pose.position[2]);
    desc.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    if (descriptor.massKg != null) desc.setAdditionalMass(Math.max(0.001, descriptor.massKg));
    if (descriptor.gravityScale != null) desc.setGravityScale(descriptor.gravityScale);
    return desc;
  }

  private colliderDesc(shape: PhysicsColliderShape): RAPIER.ColliderDesc {
    if (shape.kind === "box") return RAPIER.ColliderDesc.cuboid(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
    if (shape.kind === "cylinder") return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    if (shape.kind === "ball") return RAPIER.ColliderDesc.ball(shape.radius);
    if (shape.kind === "convex_hull") {
      const points = new Float32Array(shape.vertices.flat());
      return RAPIER.ColliderDesc.convexHull(points) ?? RAPIER.ColliderDesc.ball(0.01);
    }
    const vertices = new Float32Array(shape.vertices.flat());
    const indices = new Uint32Array(shape.indices);
    return RAPIER.ColliderDesc.trimesh(vertices, indices);
  }
}

export function physicsBodyFromEntity(entity: PhysEntity): PhysicsBodyDescriptor {
  const pose = poseFromJson(entity.pose ?? {});
  const source = { ...entity.metadata, ...entity.state };
  return {
    id: entity.id,
    bodyType: isDroneEntity(entity) ? "dynamic" : physicsBodyTypeForEntity(entity),
    pose,
    collider: colliderFromJson(source),
    massKg: numberOrUndefined(source.mass_kg),
    gravityScale: numberOrUndefined(source.gravity_scale),
    metadata: source
  };
}

export function isDroneEntity(entity: Pick<PhysEntity, "asset_id" | "state" | "metadata">): boolean {
  return entity.asset_id === "px4/x500" ||
    entity.state?.embodiment === "drone" ||
    entity.metadata?.embodiment === "drone" ||
    entity.state?.controller === "mavlink" ||
    entity.metadata?.controller === "mavlink";
}

function isAerialDescriptor(descriptor: PhysicsBodyDescriptor): boolean {
  return descriptor.metadata?.embodiment === "drone" || descriptor.metadata?.controller === "mavlink" || descriptor.id.includes("drone");
}

export function poseToJson(pose: PhysicsPose): JsonObject {
  const euler = quaternionToEulerDegrees(pose.orientation);
  return {
    x: pose.position[0],
    y: pose.position[1],
    z: pose.position[2],
    roll: euler[0],
    pitch: euler[1],
    yaw: euler[2]
  };
}

function poseFromJson(input: JsonObject): PhysicsPose {
  return {
    position: [numberOr(input.x, 0), numberOr(input.y, 0), numberOr(input.z, 0)],
    orientation: eulerDegreesToQuaternion(numberOr(input.roll, 0), numberOr(input.pitch, 0), numberOr(input.yaw, 0))
  };
}

function colliderFromJson(input: JsonObject): PhysicsColliderShape {
  const shape = String(input.collision_shape ?? input.shape ?? "box");
  if (shape === "cylinder") return { kind: "cylinder", radius: numberOr(input.radius_m, 0.025), halfHeight: numberOr(input.height_m, 0.05) / 2 };
  if (shape === "sphere" || shape === "ball") return { kind: "ball", radius: numberOr(input.radius_m, 0.025) };
  const dims = Array.isArray(input.dimensions_m) ? input.dimensions_m.map(Number) : [0.05, 0.05, 0.05];
  return {
    kind: "box",
    halfExtents: [Math.max(0.001, dims[0] || 0.05) / 2, Math.max(0.001, dims[1] || 0.05) / 2, Math.max(0.001, dims[2] || 0.05) / 2]
  };
}

function eulerDegreesToQuaternion(rollDeg: number, pitchDeg: number, yawDeg: number): Quaternion {
  const roll = rollDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const yaw = yawDeg * Math.PI / 180;
  const cy = Math.cos(yaw * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cp = Math.cos(pitch * 0.5);
  const sp = Math.sin(pitch * 0.5);
  const cr = Math.cos(roll * 0.5);
  const sr = Math.sin(roll * 0.5);
  return [
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
    cr * cp * cy + sr * sp * sy
  ];
}

function quaternionToEulerDegrees(q: Quaternion): Vec3 {
  const [x, y, z, w] = q;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll * 180 / Math.PI, pitch * 180 / Math.PI, yaw * 180 / Math.PI];
}

function vec(input: Vec3): { x: number; y: number; z: number } {
  return { x: input[0], y: input[1], z: input[2] };
}

function numberOr(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function numberOrUndefined(input: unknown): number | undefined {
  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}
