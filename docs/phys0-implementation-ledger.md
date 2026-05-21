# Phys-0 Implementation Ledger

This ledger is the contract for the phys-0 refactor. It exists to prevent
requirements from disappearing into vague roadmap language.

## Non-Negotiable Product Model

Phys-0 is a physical-process operating substrate:

```text
world = entities + fields + processes + constraints + observations + interventions + histories
```

It is not a rigid-body-only scene editor. Rigid bodies and articulated robots are
only two regimes inside the broader substrate.

## Implemented Core

- TypeScript model surface for world kinds, dynamical regimes, entities, fields,
  processes, observations, interventions, assets, protocols, poses, and
  controller records.
- SQLite persistence for `assets`, `world_entities`, `world_fields`,
  `world_processes`, `observations`, `interventions`, and `entity_controllers`.
- Registry loader for committed JSON manifests under `assets/registry`.
- Deterministic manifest shape validation and local path validation.
- Explicit spawn gating: failing or unknown asset validation cannot spawn unless
  the caller passes `allow_unvalidated: true`.
- First canonical committed SO-101 manifest with provenance, patch history,
  variants, protocols, and validation state.
- Source-record manifests for P0 assets that are important but not yet
  canonicalized. They are intentionally marked `validation.status: "failing"`.
- Backend tools for asset catalog, manifest lookup, import, patch, validation,
  entity spawning, fields, processes, observations, interventions, history,
  world export, controller records, adapter listing, state reads, commands, and
  simulation lifecycle recording.
- Protocol adapter interface plus LeRobot execution adapter and external runtime
  adapters for ROS 2, ROS 2 Control, MAVLink, Gazebo, MuJoCo, Isaac, Sapien,
  SDK, serial, and none.
- CLI package with executable commands for asset, world, and sim operations.
- Electron asset browser and process graph browser.

## Current Hard Truths

- SO-101 is the only committed asset that should currently be treated as
  phys-0 verified.
- UR5e, Panda, xArm6, PX4 X500, and YCB cracker box are cataloged as P0 source
  records only. They are not spawnable by default and must not be represented as
  verified until files, meshes, parser output, FK, bounding boxes, collision
  checks, and backend-specific smoke tests are committed.
- External adapters can detect runtime availability and hold controller
  configuration. They do not fabricate ROS/Gazebo/MAVLink success when the
  runtime is not installed or not connected.
- Simulation lifecycle tools currently record process-world interventions and
  delegate actual process launch to backend-specific adapters. The next step is
  to add per-runtime launch descriptors and log capture.

## Full Delivery Checklist

- Preserve chem-0 SO-101, camera, pH, experiment, voice, and SQLite workflows.
- Canonicalize assets before calling them verified.
- Track every asset patch with files, date, author, and rationale.
- Keep source records visibly separate from spawnable, verified, and gold
  assets.
- Make observations and interventions first-class history entries.
- Keep protocol adapters embodiment-aware; do not pretend MAVLink, ROS 2,
  MuJoCo, and chemistry are identical.
- Add high-fidelity validators incrementally behind deterministic CLI/API
  commands: xacro expansion, URDF/SDF/MJCF parsing, mesh resolution, joint graph,
  inertials, FK, bounding boxes, thumbnails, sim spawn, ROS 2 control load,
  MAVLink connect, SITL arm, and takeoff-hover-land.
- Expand UI inspectors: asset browser, world editor, robot inspector, drone
  inspector, chemistry/lab inspector, and process graph inspector.
