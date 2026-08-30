export type RiskPolicySettings = {
  anomalyFlagThreshold?: number;
  stepUpOnWeakDevice?: boolean;
  strictPresence?: boolean;
  locationDefaultRadiusMeters?: number;
  locationInconclusiveMarginMeters?: number;
  locationMaxAccuracyMarginMeters?: number;
};

export const DEFAULT_RISK_POLICY_SETTINGS: Required<RiskPolicySettings> = {
  anomalyFlagThreshold: 3,
  stepUpOnWeakDevice: true,
  strictPresence: false,
  locationDefaultRadiusMeters: 250,
  locationInconclusiveMarginMeters: 150,
  locationMaxAccuracyMarginMeters: 200,
};

export function mergeRiskPolicySettings(...layers: RiskPolicySettings[]): RiskPolicySettings {
  const merged: Record<string, number | boolean> = {};
  for (const layer of layers) {
    for (const key of Object.keys(layer) as (keyof RiskPolicySettings)[]) {
      const value = layer[key];
      if (value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged as RiskPolicySettings;
}

export type ResolvedRiskPolicy = {
  anomalyFlagThreshold: number;
  stepUpOnWeakDevice: boolean;
  strictPresence: boolean;
  locationDefaultRadiusMeters: number;
  locationInconclusiveMarginMeters: number;
  locationMaxAccuracyMarginMeters: number;
  stamp: string;
};

export function resolveRiskPolicy(
  layers: { settings?: RiskPolicySettings; revision?: number }[],
): ResolvedRiskPolicy {
  const settings = mergeRiskPolicySettings(...layers.map((layer) => layer.settings ?? {}));

  let maxRevision: number | null = null;
  for (const layer of layers) {
    if (layer.settings && Object.keys(layer.settings).length > 0) {
      maxRevision = Math.max(maxRevision ?? 0, layer.revision ?? 0);
    }
  }

  return {
    anomalyFlagThreshold:
      settings.anomalyFlagThreshold ?? DEFAULT_RISK_POLICY_SETTINGS.anomalyFlagThreshold,
    stepUpOnWeakDevice:
      settings.stepUpOnWeakDevice ?? DEFAULT_RISK_POLICY_SETTINGS.stepUpOnWeakDevice,
    strictPresence: settings.strictPresence ?? DEFAULT_RISK_POLICY_SETTINGS.strictPresence,
    locationDefaultRadiusMeters:
      settings.locationDefaultRadiusMeters ??
      DEFAULT_RISK_POLICY_SETTINGS.locationDefaultRadiusMeters,
    locationInconclusiveMarginMeters:
      settings.locationInconclusiveMarginMeters ??
      DEFAULT_RISK_POLICY_SETTINGS.locationInconclusiveMarginMeters,
    locationMaxAccuracyMarginMeters:
      settings.locationMaxAccuracyMarginMeters ??
      DEFAULT_RISK_POLICY_SETTINGS.locationMaxAccuracyMarginMeters,
    stamp: maxRevision === null ? "" : `policy:${maxRevision}`,
  };
}

export function validateRiskPolicySettings(settings: RiskPolicySettings): string[] {
  const issues: string[] = [];
  if (settings.anomalyFlagThreshold !== undefined) {
    const value = settings.anomalyFlagThreshold;
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      issues.push("anomalyFlagThreshold must be an integer between 1 and 10");
    }
  }
  if (
    settings.stepUpOnWeakDevice !== undefined &&
    typeof settings.stepUpOnWeakDevice !== "boolean"
  ) {
    issues.push("stepUpOnWeakDevice must be a boolean");
  }
  if (settings.strictPresence !== undefined && typeof settings.strictPresence !== "boolean") {
    issues.push("strictPresence must be a boolean");
  }
  if (settings.locationDefaultRadiusMeters !== undefined) {
    const value = settings.locationDefaultRadiusMeters;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 10 || value > 5000) {
      issues.push("locationDefaultRadiusMeters must be between 10 and 5000");
    }
  }
  if (settings.locationInconclusiveMarginMeters !== undefined) {
    const value = settings.locationInconclusiveMarginMeters;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2000) {
      issues.push("locationInconclusiveMarginMeters must be between 0 and 2000");
    }
  }
  if (settings.locationMaxAccuracyMarginMeters !== undefined) {
    const value = settings.locationMaxAccuracyMarginMeters;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2000) {
      issues.push("locationMaxAccuracyMarginMeters must be between 0 and 2000");
    }
  }
  return issues;
}
