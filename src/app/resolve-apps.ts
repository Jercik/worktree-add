interface ResolveAppsInput {
  optionApps?: string[];
  environmentApps?: string;
}

export function resolveApps({
  optionApps,
  environmentApps,
}: ResolveAppsInput): string[] {
  const normalizedOptionApps =
    optionApps?.map((app) => app.trim()).filter(Boolean) ?? [];

  if (normalizedOptionApps.length > 0) {
    return normalizedOptionApps;
  }

  const normalized = environmentApps?.trim();
  if (normalized) {
    return normalized
      .split(",")
      .map((app) => app.trim())
      .filter(Boolean);
  }

  return [];
}
