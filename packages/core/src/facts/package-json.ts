import { z } from "zod";
import type { PackageFacts } from "@japs/schema";

const RawPackageJson = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    dependencies: z.record(z.string(), z.unknown()).optional(),
    devDependencies: z.record(z.string(), z.unknown()).optional(),
    workspaces: z.union([z.array(z.string()), z.object({ packages: z.array(z.string()).optional() })]).optional(),
  })
  .passthrough();

export interface ParsedPackageJson {
  facts: PackageFacts;
  workspaces: string[];
}

/** Throws on invalid JSON or an unexpected shape; the caller turns it into a warning. */
export function parsePackageJson(text: string, path: string): ParsedPackageJson {
  const raw = RawPackageJson.parse(JSON.parse(text));
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : (raw.workspaces?.packages ?? []);
  return {
    facts: {
      path,
      name: raw.name ?? null,
      description: raw.description ?? null,
      dependencies: Object.keys(raw.dependencies ?? {}).sort(),
      devDependencies: Object.keys(raw.devDependencies ?? {}).sort(),
    },
    workspaces,
  };
}

/** Package globs from pnpm-workspace.yaml, without a YAML parser (only the `packages:` list). */
export function parsePnpmWorkspace(yaml: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of yaml.replace(/\r\n/g, "\n").split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const item = /^\s+-\s*["']?([^"'#\s]+)["']?/.exec(line);
      if (item?.[1]) patterns.push(item[1]);
      else if (/^\S/.test(line)) inPackages = false;
    }
  }
  return patterns;
}
