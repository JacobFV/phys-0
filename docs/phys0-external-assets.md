# Phys-0 External Asset Source Records

This file is intentionally used by registry manifests whose upstream asset files
have not yet been committed into `assets/`. Those manifests are allowed in the
catalog only as provenance and support-level records.

Rules:

- `validation.status: "failing"` means the asset must not be treated as
  spawnable by default.
- `spawn_robot` and `spawn_object` reject failing or unknown assets unless the
  caller explicitly passes `allow_unvalidated: true`.
- A source record is not a verified asset. It becomes a committed asset only
  after the description files, meshes, patch history, and validation evidence are
  checked into the repository.
