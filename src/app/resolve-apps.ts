interface ResolveAppsInput {
  optionApps?: string[];
  environmentApps?: string;
}

export function resolveApps({
  optionApps,
  environmentApps,
}: ResolveAppsInput): string[] {
  if (optionApps && optionApps.length > 0) {
    return optionApps.map((app) => app.trim()).filter(Boolean);
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
