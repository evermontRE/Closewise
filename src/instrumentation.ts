import type { Instrumentation } from "next";
import { logOperation, safeError } from "@/lib/operations/logger";

export function register() {
  logOperation("info", "application_runtime_started", { runtime: process.env.NEXT_RUNTIME ?? "nodejs" });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  logOperation("error", "unhandled_request_error", {
    error: safeError(error),
    digest,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
};
