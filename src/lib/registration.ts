export type RegistrationMode = "open" | "beta" | "closed";

export function registrationMode(value = process.env.NEXT_PUBLIC_REGISTRATION_MODE): RegistrationMode {
  if (value === "open" || value === "closed") return value;
  return "beta";
}

export function registrationCopy(mode: RegistrationMode) {
  if (mode === "open") return { heading: "Create your account", description: "Start your Finance Studio workspace.", canRegister: true };
  if (mode === "closed") return { heading: "Registration is closed", description: "Finance Studio is not accepting new accounts right now.", canRegister: false };
  return { heading: "Private beta access", description: "Finance Studio is currently available to invited real estate professionals.", canRegister: false };
}
