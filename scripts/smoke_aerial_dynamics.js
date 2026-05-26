#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Phys0Backend } = require("../src/lib/backend/dist");

async function stepMany(backend, sessionId, count) {
  for (let i = 0; i < count; i += 1) {
    await backend.callTool("step_sim", { session_id: sessionId, dt_s: 1 / 60 });
  }
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phys0-aerial-"));
  const backend = new Phys0Backend(path.resolve(__dirname, ".."), dataDir);
  try {
    await backend.init();
    const { world } = await backend.callTool("create_world", { name: "aerial", type: "virtual", seed: 404 });
    const { entity } = await backend.callTool("spawn_entity", {
      world_id: world.id,
      kind: "robot",
      regimes: ["rigid_body"],
      pose: { x: 0, y: 0, z: 0.08 },
      state: { embodiment: "drone", controller: "mavlink" },
      metadata: { embodiment: "drone", controller: "mavlink", collision_shape: "box", dimensions_m: [0.35, 0.35, 0.08], mass_kg: 1.2 }
    });
    await backend.callTool("start_sim", { world_id: world.id, session_id: "drone", dt_s: 1 / 60 });
    await backend.callTool("send_command", { entity_id: entity.id, command: { type: "mavlink_takeoff", altitudeM: 1.2 } });
    await stepMany(backend, "drone", 180);
    const airborne = await backend.callTool("read_state", { entity_id: entity.id });
    if (Number(airborne.state.sim?.step_count ?? 0) < 180) throw new Error("drone simulation did not step");
    if (Number(airborne.state.aerial_control?.targetAltitudeM ?? 0) < 1) throw new Error("takeoff command was not retained");
    if (Number(airborne.state.sim?.elapsed_s ?? 0) <= 0) throw new Error("drone elapsed time did not update");
    await backend.callTool("send_command", { entity_id: entity.id, command: { type: "mavlink_land" } });
    await stepMany(backend, "drone", 180);
    await backend.callTool("stop_sim", { session_id: "drone" });
    process.stdout.write("aerial dynamics smoke ok\n");
  } finally {
    backend.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
