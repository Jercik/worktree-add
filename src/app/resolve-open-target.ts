interface ResolveOpenTargetInput {
  optionApps: string[] | undefined;
  environmentApps: string | undefined;
  open: boolean;
}

export type OpenTarget = { type: "none" } | { type: "default" } | { type: "apps"; apps: string[] };

function dedupePreserveOrder(apps: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const app of apps) {
    if (seen.has(app)) {
      continue;
    }
    seen.add(app);
    deduped.push(app);
  }
  return deduped;
}

function parseAppList(value: string): string[] {
  return dedupePreserveOrder(
    value
      .split(",")
      .map((app) => app.trim())
      .filter(Boolean),
  );
}

export function resolveOpenTarget({
  optionApps,
  environmentApps,
  open,
}: ResolveOpenTargetInput): OpenTarget {
  const hasExplicitEmptyOption = optionApps?.includes("") ?? false;
  const normalizedOptionApps = optionApps?.map((app) => app.trim()).filter(Boolean) ?? [];

  if (optionApps !== undefined) {
    if (normalizedOptionApps.length > 0) {
      return { type: "apps", apps: dedupePreserveOrder(normalizedOptionApps) };
    }

    if (hasExplicitEmptyOption) {
      return { type: "none" };
    }
  }

  if (!open) {
    return { type: "none" };
  }

  const normalized = environmentApps?.trim();
  if (normalized) {
    const apps = parseAppList(normalized);
    if (apps.length > 0) {
      return { type: "apps", apps };
    }
  }

  return { type: "default" };
}
