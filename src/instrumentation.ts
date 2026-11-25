// Runs once when the server starts (not during `next build`).
// Each hospital runs its own copy, so refuse to start with a missing or sample secret.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NODE_ENV !== "production") return;

  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32 || /^(replace-with|dev-only|change)/i.test(secret)) {
    throw new Error(
      "AUTH_SECRET is missing, too short, or still the sample value. " +
        "Set a random value of at least 32 characters in .env (for example: openssl rand -base64 32).",
    );
  }
}
