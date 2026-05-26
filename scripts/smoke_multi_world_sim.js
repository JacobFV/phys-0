#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Phys0Backend } = require("../src/lib/backend/dist");

async function buildWorld(backend, name, seed, height) {
  const { world } = await backend.callTool("create_world", { name, type: "virtual", seed });
  const { entity } = await backend.callTool("spawn_entity", {
    world_id: world.id,
    kind: "object",
    regimes: ["rigid_body"],
    pose: { x: 0, y: 0, z: height },
    metadata: { collision_shape: "box", dimensions_m: [0.05, 0.05, 0.05], mass_kg: 0.1 }
  });
  return { world, entity };
}

async function run() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phys0-multi-world-"));
  const backend = new Phys0Backend(path.resolve(__dirname, ".."), dataDir);
  try {
    await backend.init();
    const a = await buildWorld(backend, "A", 101, 1);
    const b = await buildWorld(backend, "B", 202, 2);
    await backend.callTool("start_sim", { world_id: a.world.id, session_id: "world-a", dt_s: 1 / 60 });
    await backend.callTool("start_sim", { world_id: b.world.id, session_id: "world-b", dt_s: 1 / 60 });
    for (let i = 0; i < 10; i += 1) {
      await backend.callTool("step_sim", { session_id: "world-a", dt_s: 1 / 60 });
      await backend.callTool("step_sim", { session_id: "world-b", dt_s: 1 / 60 });
    }
    await backend.callTool("pause_sim", { session_id: "world-a" });
    await backend.callTool("resume_sim", { session_id: "world-a" });
    const stateA = await backend.callTool("read_state", { entity_id: a.entity.id });
    const stateB = await backend.callTool("read_state", { entity_id: b.entity.id });
    if (stateA.state.sim.step_count !== 10 || stateB.state.sim.step_count !== 10) throw new Error("step counts did not sync");
    if (stateA.entity_id === stateB.entity_id) throw new Error("worlds were not isolated");
    await backend.callTool("stop_sim", { session_id: "world-a" });
    await backend.callTool("stop_sim", { session_id: "world-b" });
    process.stdout.write("multi-world simulation smoke ok\n");
  } finally {
    backend.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
