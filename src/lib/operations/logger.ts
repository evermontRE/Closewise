import "server-only";

type LogLevel = "info" | "warning" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logOperation(level: LogLevel, message: string, fields: LogFields = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "finance-studio",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...fields,
  };
  const output = JSON.stringify(payload);
  if (level === "error") console.error(output);
  else if (level === "warning") console.warn(output);
  else console.log(output);
}

export function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown error";
}
