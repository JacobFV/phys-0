import { parentPort } from "node:worker_threads";
import type { JsonObject, PhysEntity } from "./types";
import { normalizeSeed, type AerialControlCommand } from "./physics";
import { initRapier, physicsBodyFromEntity, RapierPhysicsWorldRuntime } from "./rapierPhysics";

type WorkerRequest =
  | { id: number; op: "init"; worldId: string; seed?: number; fixedTimeStepS?: number; entities: PhysEntity[] }
  | { id: number; op: "reset"; seed?: number; entities: PhysEntity[] }
  | { id: number; op: "control"; entityId: string; control: AerialControlCommand }
  | { id: number; op: "step"; dtS?: number; kinematicPoses?: Record<string, JsonObject> }
  | { id: number; op: "snapshot" }
  | { id: number; op: "destroy" };

let runtime: RapierPhysicsWorldRuntime | null = null;
let worldId = "";
let seed = 0;
let fixedTimeStepS = 1 / 60;
let elapsedS = 0;
let stepCount = 0;

if (!parentPort) throw new Error("simWorker must run in a worker thread.");

parentPort.on("message", (message: WorkerRequest) => {
  void handle(message)
    .then((result) => parentPort?.postMessage({ id: message.id, ok: true, result }))
    .catch((error) => parentPort?.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) }));
});

async function handle(message: WorkerRequest): Promise<unknown> {
  if (message.op === "destroy") {
    runtime = null;
    return { destroyed: true };
  }
  if (message.op === "init") {
    worldId = message.worldId;
    seed = normalizeSeed(message.seed, worldId);
    fixedTimeStepS = message.fixedTimeStepS && message.fixedTimeStepS > 0 ? message.fixedTimeStepS : fixedTimeStepS;
    await buildRuntime(message.entities);
    return status(runtime?.snapshot());
  }
  if (message.op === "reset") {
    if (!worldId) throw new Error("Worker is not initialized.");
    seed = normalizeSeed(message.seed ?? seed, worldId);
    elapsedS = 0;
    stepCount = 0;
    await buildRuntime(message.entities);
    return status(runtime?.snapshot());
  }
  if (!runtime) throw new Error("Worker is not initialized.");
  if (message.op === "control") {
    runtime.setAerialControl(message.entityId, message.control);
    return status(runtime.snapshot());
  }
  if (message.op === "step") {
    const dtS = message.dtS && message.dtS > 0 ? message.dtS : fixedTimeStepS;
    const snapshot = runtime.step(dtS);
    elapsedS += dtS;
    stepCount += 1;
    return status(snapshot);
  }
  if (message.op === "snapshot") return status(runtime.snapshot());
  throw new Error(`Unknown worker op: ${(message as { op?: string }).op}`);
}

async function buildRuntime(entities: PhysEntity[]): Promise<void> {
  await initRapier();
  runtime = new RapierPhysicsWorldRuntime({ worldId, seed, fixedTimeStepS });
  for (const entity of [...entities].sort((a, b) => a.id.localeCompare(b.id))) {
    runtime.upsertBody(physicsBodyFromEntity(entity));
  }
}

function status(snapshot: unknown): JsonObject {
  return {
    world_id: worldId,
    seed,
    fixed_time_step_s: fixedTimeStepS,
    elapsed_s: elapsedS,
    step_count: stepCount,
    snapshot: snapshot as JsonObject
  };
}
