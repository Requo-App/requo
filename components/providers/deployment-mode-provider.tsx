"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DeploymentMode } from "@/lib/deployment-mode";

/**
 * Only the deployment mode crosses the server/client boundary. Billing
 * credentials and other server configuration stay on the server.
 */
const DeploymentModeContext = createContext<DeploymentMode>("cloud");

export function DeploymentModeProvider({
  mode,
  children,
}: {
  mode: DeploymentMode;
  children: ReactNode;
}) {
  return (
    <DeploymentModeContext.Provider value={mode}>
      {children}
    </DeploymentModeContext.Provider>
  );
}

export function useDeploymentMode(): DeploymentMode {
  return useContext(DeploymentModeContext);
}

export function useIsSelfHostedDeployment(): boolean {
  return useDeploymentMode() === "self-hosted";
}
