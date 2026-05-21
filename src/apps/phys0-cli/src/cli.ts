#!/usr/bin/env node
import path from "node:path";
import { Chem0Backend, type JsonObject } from "@chem0/backend";

type Parsed = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

const repoRoot = path.resolve(__dirname, "../../../..");

function parse(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2).replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function flagString(flags: Parsed["flags"], key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

function json(input: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as JsonObject;
}

function parsePose(flags: Parsed["flags"]): JsonObject | undefined {
  const raw = flagString(flags, "pose");
  if (!raw) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--pose must be a JSON object.");
  return parsed as JsonObject;
}

async function main(): Promise<void> {
  const parsed = parse(process.argv.slice(2));
  const [scope, action, arg] = parsed.positional;
  const backend = new Chem0Backend(repoRoot);
  await backend.init();
  try {
    if (!scope || scope === "help" || parsed.flags.help) {
      print({
        usage: [
          "phys0 asset list",
          "phys0 asset validate <asset_id>",
          "phys0 asset import <path> --id <asset_id> [--name <name>] [--kind robot] [--format urdf]",
          "phys0 asset patch <asset_id> --patch '{...}'",
          "phys0 world create <name> [--type physical|virtual]",
          "phys0 world spawn-robot <asset_id> --world-id <id> [--backend gazebo] [--controller ros2_control]",
          "phys0 world spawn-object <asset_id> --world-id <id>",
          "phys0 world add-field <kind> --world-id <id> --domain '{...}'",
          "phys0 world add-process <kind> --world-id <id> --inputs a,b --outputs c",
          "phys0 sim start|step|reset|stop --world-id <id> [--backend gazebo]"
        ]
      });
      return;
    }

    if (scope === "asset" && action === "list") {
      print(await backend.callTool("list_asset_catalog", {}));
      return;
    }
    if (scope === "asset" && action === "validate") {
      print(await backend.callTool("validate_asset", { asset_id: arg }));
      return;
    }
    if (scope === "asset" && action === "import") {
      print(await backend.callTool("import_asset", json({
        path: arg,
        id: flagString(parsed.flags, "id"),
        name: flagString(parsed.flags, "name"),
        kind: flagString(parsed.flags, "kind"),
        format: flagString(parsed.flags, "format"),
        embodiment: flagString(parsed.flags, "embodiment")
      })));
      return;
    }
    if (scope === "asset" && action === "patch") {
      const patch = JSON.parse(flagString(parsed.flags, "patch") ?? "{}") as JsonObject;
      print(await backend.callTool("patch_asset", { asset_id: arg, patch }));
      return;
    }

    if (scope === "world" && action === "create") {
      print(await backend.callTool("create_world", { name: arg ?? "World", type: flagString(parsed.flags, "type") ?? "physical" }));
      return;
    }
    if (scope === "world" && action === "spawn-robot") {
      print(await backend.callTool("spawn_robot", json({
        world_id: flagString(parsed.flags, "worldId"),
        asset_id: arg,
        pose: parsePose(parsed.flags),
        backend: flagString(parsed.flags, "backend"),
        controller: flagString(parsed.flags, "controller")
      })));
      return;
    }
    if (scope === "world" && action === "spawn-object") {
      print(await backend.callTool("spawn_object", json({
        world_id: flagString(parsed.flags, "worldId"),
        asset_id: arg,
        pose: parsePose(parsed.flags),
        static: parsed.flags.static === true
      })));
      return;
    }
    if (scope === "world" && action === "add-field") {
      print(await backend.callTool("add_field", json({
        world_id: flagString(parsed.flags, "worldId"),
        kind: arg,
        domain: JSON.parse(flagString(parsed.flags, "domain") ?? "{\"type\":\"symbolic\"}"),
        units: flagString(parsed.flags, "units")
      })));
      return;
    }
    if (scope === "world" && action === "add-process") {
      print(await backend.callTool("add_process", json({
        world_id: flagString(parsed.flags, "worldId"),
        kind: arg,
        inputs: (flagString(parsed.flags, "inputs") ?? "").split(",").filter(Boolean),
        outputs: (flagString(parsed.flags, "outputs") ?? "").split(",").filter(Boolean),
        backend: flagString(parsed.flags, "backend"),
        parameters: JSON.parse(flagString(parsed.flags, "parameters") ?? "{}")
      })));
      return;
    }

    if (scope === "sim" && ["start", "step", "reset", "stop"].includes(action ?? "")) {
      print(await backend.callTool(`${action}_sim`, json({
        world_id: flagString(parsed.flags, "worldId"),
        backend: flagString(parsed.flags, "backend"),
        session_id: flagString(parsed.flags, "sessionId"),
        dt_s: Number(flagString(parsed.flags, "dtS") ?? "0")
      })));
      return;
    }

    throw new Error(`Unknown phys0 command: ${parsed.positional.join(" ")}`);
  } finally {
    backend.stop();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
