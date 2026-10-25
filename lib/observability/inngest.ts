import "server-only";

import { Middleware } from "inngest";

import { runWithCorrelationId } from "./correlation";
import { logError, logInfo } from "./logger";

/**
 * Inngest run IDs are stable across retries and unique per run, which makes
 * them the natural correlation key for a background job.
 */
export function inngestCorrelationId(runId: string): string {
  const safeRunId = runId.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 100);

  return `inngest_${safeRunId}`;
}

/**
 * Adds correlation context and run/step failure logs to every Inngest
 * function without touching each handler. Hook logs pass the ID explicitly
 * because hooks can run outside the wrapped handler's async context.
 */
export class InngestObservabilityMiddleware extends Middleware.BaseMiddleware {
  readonly id = "requo-observability";

  override async wrapFunctionHandler({
    ctx,
    next,
  }: Middleware.WrapFunctionHandlerArgs): Promise<unknown> {
    return runWithCorrelationId(inngestCorrelationId(ctx.runId), next);
  }

  override onRunStart({ ctx, fn }: Middleware.OnRunStartArgs): void {
    logInfo("inngest.run.started", {
      correlationId: inngestCorrelationId(ctx.runId),
      functionId: fn.id(),
      runId: ctx.runId,
      eventName: ctx.event.name,
    });
  }

  override onRunComplete({ ctx, fn }: Middleware.OnRunCompleteArgs): void {
    logInfo("inngest.run.completed", {
      correlationId: inngestCorrelationId(ctx.runId),
      functionId: fn.id(),
      runId: ctx.runId,
    });
  }

  override onRunError({
    ctx,
    fn,
    error,
    isFinalAttempt,
  }: Middleware.OnRunErrorArgs): void {
    logError("inngest.run.failed", error, {
      correlationId: inngestCorrelationId(ctx.runId),
      functionId: fn.id(),
      runId: ctx.runId,
      isFinalAttempt,
    });
  }

  override onStepError({
    ctx,
    fn,
    error,
    isFinalAttempt,
    stepInfo,
  }: Middleware.OnStepErrorArgs): void {
    logError("inngest.step.failed", error, {
      correlationId: inngestCorrelationId(ctx.runId),
      functionId: fn.id(),
      runId: ctx.runId,
      stepId: stepInfo.hashedId,
      stepType: stepInfo.stepType,
      isFinalAttempt,
    });
  }
}
