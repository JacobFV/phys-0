# Phys-0 Feature Roadmap & Work Tracker

Tracking doc for the simulator capability expansion. Companion to
`docs/phys0-implementation-ledger.md` — the ledger records what is *built*, this
doc records what is *planned and in progress*.

Last updated: 2026-05-21

## Status Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked / needs decision

## Feature Summary

| # | Feature | Priority | Depends on | Status |
|---|---------|----------|-----------|--------|
| 1 | Rapier physics migration | P0 (foundation) | — | `[ ]` |
| 2 | Deterministic seeded simulation | P0 | F1 | `[ ]` |
| 3 | Concurrent multi-world simulation | P0 | F1, F2 | `[ ]` |
| 4 | Flying / aerial dynamics | P1 | F1 | `[ ]` |
| 5 | Chemical reactions runtime | P1 | F1 | `[ ]` |
| 6 | Real sensor simulation | P1 | F1, F3 | `[ ]` |
| 7 | Spatial / 3D audio | P2 | F1, F6 | `[ ]` |
| 8 | Asset expansion | P1 | F1 (validation) | `[~]` |
| 9 | Protocol/runtime adapters | P0/P1 | core world model, asset registry | `[~]` |

Build order: **F9 adapter hardening continues immediately** because real/sim
connectivity is orthogonal to the renderer physics migration. **F1 first** for
simulated dynamics (everything else in the renderer assumes a real physics
engine), then F2 + F3 together (determinism + multi-world are intertwined), then
F4–F8 in parallel tracks.

---

## F1 — Rapier physics migration

**Goal.** Replace the custom gravity + AABB settler with the Rapier physics
engine. The current engine (`virtual-world3d.mjs:140-478`,
`GRAVITY_M_PER_FRAME`, `settleRigidBodies()`) has no constraint solving, no
contact forces, and no joint dynamics — it cannot support flight, real
collisions, or articulated robots.

**Current state.** Custom JS settler. No Rapier/Cannon/Bullet dependency.

**TODOs.**

- [x] **DECIDED:** use `@dimforge/rapier3d-compat` — single async `RAPIER.init()`
      promise, no bundler-specific WASM-loader config, identical behavior in the
      Electron renderer and headless Node. Headless physics IS in scope (F3
      world stepping, F6 deterministic sensor rendering run outside the renderer).
- [ ] Add Rapier to `package.json`; wire WASM asset into the Electron build.
- [ ] Define a physics abstraction layer so the world/entity schema is not
      coupled to Rapier types directly (`src/lib/backend/src/types.ts` regimes).
- [ ] Map `PhysEntityKind` / `DynamicalRegimes` → Rapier rigid body types
      (dynamic, kinematic, fixed) and colliders.
- [ ] Translate existing collision shapes (box, cylinder — `virtual-world3d.mjs`
      lines ~1262-1318) to Rapier colliders; add mesh/convex-hull colliders.
- [ ] Articulated bodies: map robot joints (SO-101, URDF assets) to Rapier
      joints / multibody for real arm dynamics.
- [ ] Fixed-timestep stepping loop; decouple physics tick from render frame.
- [ ] Port `settleRigidBodies()` callers to the Rapier step; remove the custom
      settler once parity is verified.
- [ ] Sync Rapier transforms back to THREE.js scene objects each frame.
- [ ] Regression check: SO-101 spawn, pose, collision still behave (preserve
      chem-0 workflows per the ledger).

**Key files.** `src/apps/electron/src/renderer/virtual-world3d.mjs`,
`src/lib/backend/src/types.ts`, `src/lib/backend/src/physSchema.ts`,
`package.json`.

---

## F2 — Deterministic seeded simulation

**Goal.** A simulation seed must be settable so runs are reproducible — same
seed + same inputs ⇒ identical trajectories.

**Current state.** No seed concept; physics is frame-rate coupled and
non-deterministic.

**TODOs.**

- [ ] Add a `seed` field to the world / experiment schema and SQLite store.
- [ ] Confirm Rapier determinism mode (fixed timestep, deterministic flag,
      consistent collider insertion order).
- [ ] Replace any `Math.random()` in sim paths with a seeded PRNG.
- [ ] Make stepping fixed-timestep with accumulator (no frame-rate coupling).
- [ ] Ensure deterministic entity iteration order (sorted by id, not insertion).
- [ ] Surface seed in the CLI (`src/apps/*/cli`) and Electron world editor.
- [ ] Reproducibility test: run the same seed twice, assert identical end state.

**Key files.** `src/lib/backend/src/store.ts`, `src/lib/backend/src/types.ts`,
CLI package, virtual-world renderer.

---

## F3 — Concurrent multi-world simulation

**Goal.** Multiple worlds simulating at once (schema already has `worlds` and
`robot_world_assignments`).

**Current state.** Schema supports multiple worlds; runtime simulates one scene.

**TODOs.**

- [ ] One Rapier `World` instance per simulated world; isolate state.
- [ ] Scheduler/loop that steps N worlds: **DECIDED — independent per-world
      clocks**, each world keeps its own seed + fixed timestep from F2.
- [ ] Resource model: **DECIDED — one physics worker thread per world** (small
      pool), main thread renders only the focused world; non-focused worlds step
      headless in workers. **Default cap: 8 concurrent worlds**, configurable;
      worlds beyond the cap pause. Throttle inactive workers.
- [ ] Per-world entity/field/process isolation in the backend
      (`backend.ts`, `store.ts`).
- [ ] Electron UI: select / switch / view multiple active worlds.
- [ ] Lifecycle: create, pause, resume, step, destroy per world.
- [ ] Test: two worlds with different seeds run independently and reproducibly.

**Key files.** `src/lib/backend/src/store.ts` (`worlds`,
`robot_world_assignments`), `src/lib/backend/src/backend.ts`, renderer.

---

## F4 — Flying / aerial dynamics

**Goal.** Real flight — drones (PX4 X500 asset exists) get thrust/lift, not just
gravity. Optional gravity toggle / levitation for free-cam style entities.

**Current state.** `"drone"` embodiment type defined; drone falls like any rigid
body. No thrust, lift, or aerial control.

**TODOs.**

- [ ] Decide fidelity: simple force-based thrust vs full quadrotor rotor model.
- [ ] Add aerial dynamics for `drone` embodiment (forces/torques via Rapier).
- [ ] Per-entity gravity scale / gravity toggle.
- [ ] Flight control input path (manual + programmatic / adapter-driven).
- [ ] Integrate with MAVLink adapter (already listed in ledger) for drone cmd.
- [ ] Drone inspector UI panel (ledger already calls for "drone inspector").
- [ ] Test: PX4 X500 takeoff-hover-land.

**Key files.** `assets/registry/robots/p0/px4_x500.json`,
`src/lib/backend/src/types.ts` (embodiment), protocol adapters.

---

## F5 — Chemical reactions runtime

**Goal.** Reactions actually execute when materials mix / contact, transforming
entity state. Schema is fully built (`chemical_reaction` process,
`chemical_sample` entity, `mix`/`add_material`/`heat`/`cool` interventions) but
nothing consumes it at runtime.

**Current state.** Schema only — no runtime simulation.

**DECIDED.** Rules-based recipe table (reagent A + reagent B + heat ⇒ product),
executed by the F9 `custom` process backend. Physically simulated chemistry
(reaction kinetics / PDEs) is a later extension via the F9 `fenics` / `custom`
process backends — not part of the first runtime.

**TODOs.**

- [ ] Reaction definition format — recipe/process manifests under
      `assets/registry/` (kind `process`).
- [ ] Detect mixing: collision/containment events between `chemical_sample`
      entities (depends on F1 contact events).
- [ ] Reaction executor: consume reagents, produce products, update entity
      state, emit `observation` history entries.
- [ ] Honor `heat` / `cool` interventions as reaction preconditions.
- [ ] Chemistry/lab inspector UI panel (ledger already calls for this).
- [ ] Test: defined reaction fires on mix and logs to history.

**Key files.** `src/lib/backend/src/types.ts`,
`src/lib/backend/src/physSchema.ts`, `src/lib/backend/src/backend.ts`,
`assets/registry/`.

---

## F6 — Real sensor simulation

**Goal.** Sensors render real simulated feeds — no placeholder/template
geometry. Camera and depth-camera templates currently exist as geometry only.

**Current state.** Camera + depth camera are world templates
(`virtual-world.ts`) with placeholder geometry; no actual sensing.

**TODOs.**

- [ ] Camera sensor: render the scene from the sensor's pose to an offscreen
      target; expose the image frame.
- [ ] Depth camera: depth render target → depth buffer output.
- [ ] Sensor entities as first-class `sensor` assets (AssetKind `sensor`
      exists) instead of template primitives.
- [ ] Per-sensor intrinsics (FOV, resolution, near/far) in the schema.
- [ ] Feed sensor output into observations / artifacts
      (`list_experiment_artifacts`).
- [ ] Make sensor rendering deterministic + per-world (respect F2/F3).
- [ ] Remove camera/depth-camera template entries once sensor assets land.
- [ ] Test: camera at a known pose produces an expected frame.

**Key files.** `src/apps/electron/src/renderer/virtual-world.ts` (lines ~31-67),
`virtual-world3d.mjs`, `src/lib/backend/src/assetRegistry.ts`, `types.ts`.

---

## F7 — Spatial / 3D audio

**Goal.** In-world positional audio — speaker entities emit sound from world
positions, microphone entities capture it. Distinct from the existing
agent-facing TTS/STT (`audio.ts`), which stays as is.

**Current state.** TTS/STT only (`src/lib/backend/src/audio.ts`). No
`THREE.AudioListener`, no `PositionalAudio`, no speaker/mic entities.
`PhysFieldKind` has `"sound"`; `ObservationKind` has `"audio"`.

**TODOs.**

- [ ] `THREE.AudioListener` attached to the active camera.
- [ ] Speaker entity: `THREE.PositionalAudio` source at a world position.
- [ ] Microphone entity: capture audio relative to a world pose.
- [ ] Wire to the `sound` field kind / `audio` observation kind.
- [ ] Decide whether sound respects occlusion / propagation or just distance
      attenuation (recommend distance-only first).
- [ ] Per-world audio isolation (multi-world from F3).
- [ ] Audio sensor output into observations / artifacts.
- [ ] Test: speaker + mic at varying distances yields expected attenuation.

**Key files.** `src/apps/electron/src/renderer/virtual-world3d.mjs`,
`src/lib/backend/src/audio.ts` (reference only), `types.ts`.

---

## F8 — Asset expansion

**Goal.** Grow both asset pipelines: the **registry** (validated, importable
robots/objects) and the **world template palette** (placeable primitives). The
palette is currently lab/chemistry-skewed; the registry has 6 manifests with
only SO-101 verified.

**Current state.** 6 registry manifests (SO-101 verified; UR5e, Panda, xArm6,
PX4 X500, YCB cracker box are source records only). 37 world templates, mostly
glassware/lab equipment.

**DECIDED.** Import-first: pull from existing libraries (Objaverse for objects,
full YCB set, upstream robot URDF zoos — incl. the SO-101 upstream URDF already
in use). Author new assets only for phys-0-specific lab items with no upstream
source. Every import enters as a `vendor_raw` source record and must pass the
validation framework before promotion to `phys0_verified` (ledger rule).

**TODOs.**

- [ ] Canonicalize the P0 source records (UR5e, Panda, xArm6, PX4 X500, YCB) —
      commit files, meshes, FK, bbox, collision per the ledger checklist.
- [ ] Add general-purpose / environment assets (currently lab-only): terrain,
      furniture, props, structural pieces.
- [ ] Expand the world template palette beyond glassware.
- [ ] Run new assets through the validation framework (xml_parse, mesh_resolve,
      joint_limits, fk, bbox, collision_exists, inertials_sane, sim_spawn).
- [ ] Keep source records visibly separate from verified/gold (ledger rule).
- [ ] Asset browser UI updates for new categories.

**Key files.** `assets/registry/`,
`src/apps/electron/src/renderer/virtual-world.ts`,
`src/lib/backend/src/assetRegistry.ts`, `docs/phys0-external-assets.md`.

---

## F9 — Protocol / Runtime Adapters

**Goal.** Phys-0 must be able to host the same canonical world/entity/history
model against different real and simulated runtimes:

```text
phys-0 entity -> controller record -> protocol adapter -> real/sim runtime
```

Examples:

```text
SO-101 -> lerobot -> Python bridge -> USB serial -> real arm
UR5e -> ros2_control -> ROS 2 controller manager -> Gazebo or real driver
PX4 X500 -> mavlink -> PX4 SITL / flight controller -> Gazebo or real drone
AcmeBot -> sdk -> AcmeRoboKit -> USB / TCP / Unity sim
```

The adapter layer is explicitly not a fake universal robotics abstraction.
Adapters normalize what phys-0 owns — assets, entities, controller records,
observations, interventions, histories, validation/support levels — while
remaining embodiment/runtime-specific for actual control.

**Current state.**

- `[x]` `PhysProtocolAdapter` interface exists.
- `[x]` `lerobot` adapter has a real execution path through the Python bridge.
- `[~]` External runtime adapters exist and report runtime availability honestly.
- `[~]` Controller records are persisted in `entity_controllers`.
- `[~]` `send_command` records robot commands as interventions and dispatches to
      a selected adapter when possible.
- `[ ]` ROS 2 / MAVLink / Gazebo / MuJoCo command paths are not complete yet.

### In-Scope Adapters

#### Implemented execution now

- `[x]` `lerobot`
  - SO-101 / LeRobot Python bridge.
  - Real serial hardware path.
  - Normalized commands currently mapped: `joint_position`, `cartesian_pose`,
    `gripper`, `raw`.

#### Must implement next

- `[ ]` `ros2`
  - Generic ROS 2 node/topic/service/action bridge.
  - Package introspection.
  - Robot description discovery.
  - State read from topics/services/actions.
- `[ ]` `ros2_control`
  - Controller manager discovery.
  - Joint state read.
  - Joint trajectory command.
  - Controller load/start/stop/status.
  - Real vs simulated controller endpoint distinction.
- `[ ]` `gazebo`
  - Spawn SDF/URDF assets.
  - Start/stop/reset/step sim.
  - World/model state read.
  - PX4/Gazebo model support.
  - Log capture and sim-session trace.
- `[ ]` `mavlink`
  - PX4 / ArduPilot connection.
  - Arm/disarm.
  - Takeoff/land.
  - Local/global goto.
  - Telemetry/state read.
  - SITL and real flight-controller endpoint support.
- `[ ]` `mujoco`
  - Load MJCF and URDF-derived models.
  - Step/reset sim.
  - State read/write.
  - Actuator control.
  - Record observations/interventions per step/command.

#### Also in scope

- `[ ]` `sdk`
  - Generic vendor SDK adapter slot.
  - Examples: AcmeRoboKit, Unitree SDK, Boston Dynamics SDK, custom lab drivers.
  - Configurable library/module/endpoint selection.
- `[ ]` `serial`
  - Generic serial protocol adapter for non-LeRobot hardware.
  - Port discovery, baud config, read/write framing, trace logging.
- `[ ]` `isaac`
  - USD/Isaac Sim export or launch bridge.
  - Spawn/read/control where available.
- `[ ]` `sapien`
  - Manipulation/mobile simulation bridge.
- `[ ]` `i2c`
  - Sensor/embedded hardware bus support.
- `[ ]` `spi`
  - Sensor/embedded hardware bus support.
- `[ ]` `uart`
  - Serial-like embedded bus support.
- `[ ]` `can`
  - Motor controllers, mobile robots, vehicles, drone electronics.
- `[x]` `none`
  - Passive/static/no-controller assets.
  - Source-only records and manually updated entities.

### Process Backend Adapters

These are in scope for phys-0 even when they are not robot command protocols:

- `[ ]` `taichi`
  - Soft bodies, particles, fluids, granular reduced models.
- `[ ]` `openfoam`
  - Fluid / airflow backend.
- `[ ]` `fenics`
  - PDE, thermal, diffusion style process backend.
- `[~]` `custom`
  - Reduced-order chemistry, electrical, behavioral, causal graph processes.
  - Current state: schema/process graph exists; runtime executors still needed.

### Implementation Order

1. `[ ]` `ros2`
2. `[ ]` `ros2_control`
3. `[ ]` `gazebo`
4. `[ ]` `mavlink`
5. `[ ]` `mujoco`
6. `[ ]` `sdk`
7. `[ ]` `serial`
8. `[ ]` `isaac`
9. `[ ]` `sapien`
10. `[ ]` process backends: `taichi`, `openfoam`, `fenics`, `custom`

### Adapter Acceptance Criteria

For an adapter to be marked complete:

- [ ] `connect(config)` establishes or validates a real runtime connection.
- [ ] `disconnect()` closes or releases the runtime connection.
- [ ] `getState(entityId)` returns meaningful runtime state, not just stored
      metadata.
- [ ] `command(entityId, command)` executes at least one normalized command path
      and records the resulting intervention.
- [ ] `supports(commandType)` is precise and tested.
- [ ] Missing runtime / missing endpoint / unsupported command errors are
      explicit.
- [ ] Controller records distinguish configured, connected, disconnected,
      runtime_missing, and error states.
- [ ] Observations/interventions are written for meaningful state reads and
      commands.
- [ ] Smoke test exists for runtime-present and runtime-missing cases.

**Key files.** `src/lib/backend/src/protocolAdapters.ts`,
`src/lib/backend/src/backend.ts`, `src/lib/backend/src/store.ts`,
`src/lib/backend/src/types.ts`, `assets/registry/`, `docs/phys0-implementation-ledger.md`.

---

## Resolved Decisions

All blocking decisions settled 2026-05-21. No open questions remain.

1. **F1 — Rapier flavor:** `@dimforge/rapier3d-compat`. Single async
   `RAPIER.init()`, no bundler WASM-loader config, same build usable in the
   Electron renderer and headless Node. Headless physics is in scope.
2. **F3 — multi-world scaling:** default cap of 8 concurrent worlds
   (configurable); one physics worker thread per world; main thread renders only
   the focused world; non-focused worlds step headless; independent per-world
   clocks + seeds.
3. **F5 — chemical reactions:** rules-based recipe table first, run by the F9
   `custom` process backend. Physically simulated chemistry deferred to a later
   `fenics`/`custom` extension.
4. **F8 — asset sourcing:** import-first from existing libraries; author new only
   for phys-0-specific lab items with no upstream source. Imports enter as
   `vendor_raw` and must pass validation before being called verified.

## Cross-Cutting Notes

- The ledger (`phys0-implementation-ledger.md`) is the source of truth for
  "verified" status — do not mark assets verified until canonicalized.
- Preserve chem-0 SO-101 / camera / pH / experiment / voice / SQLite workflows
  through every change.
- F2 (determinism) and F3 (multi-world) constrain F4–F7: every new subsystem
  must be seed-respecting and per-world isolated.
