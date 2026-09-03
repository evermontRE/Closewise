export const PLATFORM_ROLES = ["admin", "support", "auditor"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SUPPORT_ACTIONS = ["add_note", "suspend", "reactivate", "start_review", "end_review"] as const;
export type SupportAction = (typeof SUPPORT_ACTIONS)[number];

export type SupportActionInput = {
  action: SupportAction;
  reason: string;
  note: string | null;
  sessionId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && PLATFORM_ROLES.includes(value as PlatformRole);
}

export function parseSupportAction(value: unknown): SupportActionInput {
  if (!value || typeof value !== "object") throw new Error("A support action is required.");
  const body = value as Record<string, unknown>;
  if (typeof body.action !== "string" || !SUPPORT_ACTIONS.includes(body.action as SupportAction)) {
    throw new Error("Unsupported support action.");
  }
  const action = body.action as SupportAction;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : null;

  if (reason.length < 10 || reason.length > 500) throw new Error("Provide a reason between 10 and 500 characters.");
  if (action === "add_note" && (!note || note.length < 2 || note.length > 2_000)) {
    throw new Error("Provide an internal note between 2 and 2,000 characters.");
  }
  if (action === "end_review" && (!sessionId || !UUID.test(sessionId))) {
    throw new Error("A valid support review session is required.");
  }
  return { action, reason, note, sessionId };
}

export function roleCanPerform(role: PlatformRole, action: SupportAction) {
  if (role === "auditor") return false;
  if (action === "suspend" || action === "reactivate") return role === "admin";
  return role === "admin" || role === "support";
}
