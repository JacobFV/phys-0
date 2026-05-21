import type { DynamicalRegime, JsonObject, PhysEntity, PhysEntityKind, Quaternion, Vec3 } from "./types";

export type PhysicsBodyType = "dynamic" | "kinematic" | "fixed";
export type PhysicsColliderShape =
  | { kind: "box"; halfExtents: Vec3 }
  | { kind: "cylinder"; radius: number; halfHeight: number }
  | { kind: "ball"; radius: number }
  | { kind: "convex_hull"; vertices: Vec3[] }
  | { kind: "trimesh"; vertices: Vec3[]; indices: number[] };

export interface PhysicsPose {
  position: Vec3;
  orientation: Quaternion;
}

export interface PhysicsBodyDescriptor {
  id: string;
  bodyType: PhysicsBodyType;
  collider: PhysicsColliderShape;
  pose: PhysicsPose;
  massKg?: number;
  gravityScale?: number;
  metadata?: JsonObject;
}

export interface PhysicsStepResult {
  poses: Record<string, PhysicsPose>;
  contacts: Array<{ a: string; b: string }>;
}

export interface PhysicsWorldRuntime {
  readonly worldId: string;
  readonly seed: number;
  readonly fixedTimeStepS: number;
  upsertBody(body: PhysicsBodyDescriptor): void;
  removeBody(id: string): void;
  setKinematicPose(id: string, pose: PhysicsPose): void;
  step(dtS?: number): PhysicsStepResult;
  snapshot(): PhysicsStepResult;
}

export interface PhysicsRuntimeFactory {
  createWorld(input: { worldId: string; seed?: number; fixedTimeStepS?: number; gravity?: Vec3 }): Promise<PhysicsWorldRuntime> | PhysicsWorldRuntime;
}

export function physicsBodyTypeForEntity(entity: Pick<PhysEntity, "kind" | "regimes" | "state" | "metadata">): PhysicsBodyType {
  if (entity.state?.static === true || entity.metadata?.static === true) return "fixed";
  if (entity.kind === "robot" || entity.regimes.includes("articulated_body")) return "kinematic";
  if (entity.regimes.includes("rigid_body")) return "dynamic";
  return "fixed";
}

export function regimesForPhysicsKind(kind: PhysEntityKind, regimes: DynamicalRegime[] = []): DynamicalRegime[] {
  const set = new Set<DynamicalRegime>(regimes);
  if (kind === "robot") {
    set.add("articulated_body");
    set.add("rigid_body");
  }
  if (kind === "object" || kind === "container" || kind === "electrical_component") set.add("rigid_body");
  if (kind === "chemical_sample" || kind === "material" || kind === "fluid_volume") set.add("chemical");
  return Array.from(set).sort();
}

export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: unknown, fallback: string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  if (typeof seed === "string" && seed.trim()) {
    const numeric = Number(seed);
    return Number.isFinite(numeric) ? numeric >>> 0 : seedFromString(seed);
  }
  return seedFromString(fallback);
}
