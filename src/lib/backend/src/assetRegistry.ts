import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AssetFormat, AssetManifest, JsonObject } from "./types";
import { validateManifestShape } from "./physSchema";

export type AssetValidationResult = {
  asset_id: string;
  status: "unknown" | "failing" | "passing" | "gold";
  deterministic_checks: string[];
  failures: string[];
};

export class AssetRegistry {
  constructor(readonly repoRoot: string, readonly registryRoot = path.join(repoRoot, "assets", "registry")) {}

  loadManifests(): AssetManifest[] {
    if (!fs.existsSync(this.registryRoot)) return [];
    const manifests: AssetManifest[] = [];
    for (const absolute of this.walkJson(this.registryRoot)) {
      const manifest = JSON.parse(fs.readFileSync(absolute, "utf8")) as AssetManifest;
      validateManifestShape(manifest);
      manifests.push(manifest);
    }
    return manifests.sort((a, b) => a.id.localeCompare(b.id));
  }

  validateManifest(manifest: AssetManifest): AssetValidationResult {
    validateManifestShape(manifest);
    const failures: string[] = [...(manifest.validation.failures ?? [])];
    for (const [variantName, variant] of Object.entries(manifest.variants)) {
      const descriptionPath = typeof variant.descriptionPath === "string" ? variant.descriptionPath : "";
      const descriptionFormat = typeof variant.descriptionFormat === "string" ? variant.descriptionFormat : "";
      if (!descriptionPath) failures.push(`${variantName}: missing descriptionPath`);
      if (!descriptionFormat) failures.push(`${variantName}: missing descriptionFormat`);
      if (descriptionPath && !this.pathInsideRepoExists(descriptionPath)) failures.push(`${variantName}: missing description ${descriptionPath}`);
      const meshRoots = Array.isArray(variant.meshRoots) ? variant.meshRoots.map(String) : [];
      for (const root of meshRoots) {
        if (!this.pathInsideRepoExists(root)) failures.push(`${variantName}: missing mesh root ${root}`);
      }
    }
    return {
      asset_id: manifest.id,
      status: failures.length === 0 ? manifest.validation.status : "failing",
      deterministic_checks: ["manifest_schema", "description_path_exists", "mesh_roots_exist"],
      failures
    };
  }

  importDescription(input: {
    sourcePath: string;
    id: string;
    name?: string;
    format?: AssetFormat;
    kind?: AssetManifest["kind"];
    embodiment?: AssetManifest["embodiment"];
    metadata?: JsonObject;
  }): AssetManifest {
    const sourcePath = path.resolve(this.repoRoot, input.sourcePath);
    if (!fs.existsSync(sourcePath)) throw new Error(`Asset source does not exist: ${input.sourcePath}`);
    const id = input.id.trim();
    if (!id) throw new Error("Asset id is required.");
    const format = input.format ?? this.formatFromPath(sourcePath);
    const assetDir = path.join(this.repoRoot, "assets", "imported", ...id.split("/"));
    fs.mkdirSync(assetDir, { recursive: true });
    const descriptionName = path.basename(sourcePath);
    const destination = path.join(assetDir, descriptionName);
    if (fs.statSync(sourcePath).isDirectory()) {
      fs.cpSync(sourcePath, destination, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, destination);
    }
    const descriptionPath = path.relative(this.repoRoot, destination).split(path.sep).join("/");
    const manifest: AssetManifest = {
      id,
      name: input.name?.trim() || id,
      kind: input.kind ?? "robot",
      embodiment: input.embodiment,
      source: {
        name: "local import",
        notes: `Imported from ${input.sourcePath}`,
        ...(input.metadata ?? {})
      },
      quality: "vendor_raw",
      formats: [format],
      variants: {
        default: {
          descriptionPath,
          descriptionFormat: format,
          meshRoots: []
        }
      },
      protocols: ["none"],
      patches: [],
      validation: {
        status: "unknown",
        tests: ["xml_parse", "mesh_resolve"],
        failures: ["Full parser/mesh/FK validation has not been run for this imported asset."]
      }
    };
    this.writeManifest(manifest);
    return manifest;
  }

  writeManifest(manifest: AssetManifest): void {
    validateManifestShape(manifest);
    const target = this.manifestPath(manifest.id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  patchManifest(manifest: AssetManifest, patch: JsonObject): AssetManifest {
    const next: AssetManifest = {
      ...manifest,
      patches: [...(manifest.patches ?? []), { ...patch, date: typeof patch.date === "string" ? patch.date : new Date().toISOString().slice(0, 10) }]
    };
    this.writeManifest(next);
    return next;
  }

  private *walkJson(root: string): Generator<string> {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) {
        yield* this.walkJson(absolute);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        yield absolute;
      }
    }
  }

  private pathInsideRepoExists(relativePath: string): boolean {
    const absolute = path.resolve(this.repoRoot, relativePath);
    if (!absolute.startsWith(this.repoRoot)) return false;
    return fs.existsSync(absolute);
  }

  private manifestPath(assetId: string): string {
    const parts = assetId.split("/").filter(Boolean);
    const filename = parts.pop() ?? `asset_${randomUUID()}`;
    const dir = path.join(this.registryRoot, ...parts);
    return path.join(dir, `${filename}.json`);
  }

  private formatFromPath(sourcePath: string): AssetFormat {
    const ext = path.extname(sourcePath).slice(1).toLowerCase();
    if (["urdf", "xacro", "sdf", "mjcf", "usd", "stl", "dae", "obj", "gltf", "glb"].includes(ext)) return ext as AssetFormat;
    throw new Error(`Unsupported asset format: ${ext || "(none)"}`);
  }
}
