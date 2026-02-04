interface ResolveAppsInput {
  optionApps?: string[];
  environmentApps?: string;
}

function dedupePreserveOrder(apps: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const app of apps) {
    if (seen.has(app)) continue;
    seen.add(app);
    deduped.push(app);
  }
  return deduped;
}

export function resolveApps({
  optionApps,
  environmentApps,
}: ResolveAppsInput): string[] {
  const normalizedOptionApps =
    optionApps?.map((app) => app.trim()).filter(Boolean) ?? [];

  if (normalizedOptionApps.length > 0) {
    return dedupePreserveOrder(normalizedOptionApps);
  }

  const normalized = environmentApps?.trim();
  if (normalized) {
    return dedupePreserveOrder(
      normalized
        .split(",")
        .map((app) => app.trim())
        .filter(Boolean),
    );
  }

  return [];
}
