import "server-only";

import {
  CORRELATION_ID_HEADER,
  resolveRequestCorrelationId,
  runWithCorrelationId,
} from "./correlation";
import { logError, logInfo, type LogFields } from "./logger";

/**
 * Run a route boundary inside a correlation scope, log start/completion or
 * failure, and return the correlation ID to the caller in a response header.
 *
 * The header is added to the existing response when its headers are mutable.
 * Immutable responses (redirects and proxied `fetch` results) are rebuilt with
 * the same status, body, and headers.
 */
export async function withRequestCorrelation(
  request: Request,
  event: string,
  handler: () => Promise<Response> | Response,
  fields: LogFields = {},
): Promise<Response> {
  const correlationId = resolveRequestCorrelationId(request);
  const path = new URL(request.url).pathname;
  const startedAt = Date.now();

  return runWithCorrelationId(correlationId, async () => {
    logInfo(`${event}.started`, {
      ...fields,
      method: request.method,
      path,
    });

    try {
      const response = await handler();

      logInfo(`${event}.completed`, {
        ...fields,
        method: request.method,
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      return withCorrelationHeader(response, correlationId);
    } catch (error) {
      logError(`${event}.failed`, error, {
        ...fields,
        method: request.method,
        path,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  });
}

/**
 * Add the correlation header without assuming the handler response has
 * mutable headers. Redirect and proxied `fetch` responses are immutable.
 */
function withCorrelationHeader(
  response: Response,
  correlationId: string,
): Response {
  try {
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(CORRELATION_ID_HEADER, correlationId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
