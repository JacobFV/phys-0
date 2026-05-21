# Assets

Place repository images in this directory.

The README expects the welcome image at:

```text
assets/robot_lab_scene.png
```

The current welcome image is a PNG at 1536 x 1024.

Kinematic robot models live under:

```text
assets/kinematics/
```

`so101_kinematics.urdf` is a minimal FK/IK model for the MCP server.

Visual robot models live under:

```text
assets/so101/
```

Those files vendor the upstream SO-101 visual URDF and STL meshes used by the
Electron calibration viewer.

Phys-0 canonical asset manifests live under:

```text
assets/registry/
```

These manifests track provenance, quality tier, variants, protocols, patch
history, and validation status. The backend loads JSON manifests from this tree
at startup and exposes them through `list_asset_catalog` and
`get_asset_manifest`.
