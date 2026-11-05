/**
 * Deployment mode is the single switch between the managed Requo Cloud
 * service and an independently operated Requo installation.
 *
 * This module stays dependency-free so the environment schema, server
 * helpers, and tests can all share one parser. Application code should call
 * `@/lib/deployment` instead of reading the environment variable directly.
 */
export const deploymentModes = ["cloud", "self-hosted"] as const;

export type DeploymentMode = (typeof deploymentModes)[number];

/**
 * Missing configuration keeps the historical Cloud behavior. Existing
 * deployments must not change behavior when they upgrade to a release that
 * introduces this variable.
 */
export const defaultDeploymentMode: DeploymentMode = "cloud";

export function parseDeploymentMode(
  value: string | null | undefined,
): DeploymentMode {
  const normalized = value?.trim();

  if (!normalized) {
    return defaultDeploymentMode;
  }

  if (normalized === "cloud" || normalized === "self-hosted") {
    return normalized;
  }

  throw new Error(
    `Invalid REQUO_DEPLOYMENT_MODE="${normalized}". Use "cloud" for the managed hosted service or "self-hosted" for an independent installation.`,
  );
}
