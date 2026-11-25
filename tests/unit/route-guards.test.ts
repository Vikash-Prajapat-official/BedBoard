import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, type Role } from "@/lib/constants";

// The session and the database are faked so only the role check is under test.
const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  actor: null as null | { id: string; name: string; role: string; active: boolean; wards: { wardId: string }[] },
}));

vi.mock("@/lib/auth", () => ({
  auth: async () => state.session,
  handlers: { GET: () => null, POST: () => null },
  signIn: async () => null,
  signOut: async () => null,
}));

vi.mock("@/lib/db", () => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method) => (name === "user" && method === "findUnique" ? async () => state.actor : async () => []) });
  const db = new Proxy({}, { get: (_t, prop) => (String(prop).startsWith("$") ? async () => [] : model(String(prop))) });
  return { db };
});

import * as wards from "@/app/api/admin/wards/route";
import * as ward from "@/app/api/admin/wards/[id]/route";
import * as beds from "@/app/api/admin/beds/route";
import * as bed from "@/app/api/admin/beds/[id]/route";
import * as users from "@/app/api/admin/users/route";
import * as user from "@/app/api/admin/users/[id]/route";
import * as pin from "@/app/api/me/pin/route";
import * as pinVerify from "@/app/api/me/pin/verify/route";

type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response> | Response;

const adminRoutes: [string, string, Handler][] = [
  ["GET /api/admin/wards", "GET", wards.GET as Handler],
  ["POST /api/admin/wards", "POST", wards.POST as Handler],
  ["PATCH /api/admin/wards/:id", "PATCH", ward.PATCH as Handler],
  ["GET /api/admin/beds", "GET", beds.GET as Handler],
  ["POST /api/admin/beds", "POST", beds.POST as Handler],
  ["PATCH /api/admin/beds/:id", "PATCH", bed.PATCH as Handler],
  ["GET /api/admin/users", "GET", users.GET as Handler],
  ["POST /api/admin/users", "POST", users.POST as Handler],
  ["PATCH /api/admin/users/:id", "PATCH", user.PATCH as Handler],
];
const anyUserRoutes: [string, string, Handler][] = [
  ["POST /api/me/pin", "POST", pin.POST as Handler],
  ["POST /api/me/pin/verify", "POST", pinVerify.POST as Handler],
];

/** Status of the response, or 500 if the handler got past the guard and then hit the fake DB. */
async function statusOf(method: string, handler: Handler) {
  const req = new Request("http://localhost/api/x", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });
  try {
    return (await handler(req, { params: Promise.resolve({ id: "abc" }) })).status;
  } catch {
    return 500;
  }
}

function loginAs(role: Role, active = true) {
  state.session = { user: { id: "u1" } };
  state.actor = { id: "u1", name: "Test", role, active, wards: [] };
}

beforeEach(() => {
  state.session = null;
  state.actor = null;
});

describe.each(adminRoutes)("%s (ADMIN only)", (_name, method, handler) => {
  it("401 without a session", async () => {
    expect(await statusOf(method, handler)).toBe(401);
  });
  it("401 for a deactivated user even with a valid session", async () => {
    loginAs("ADMIN", false);
    expect(await statusOf(method, handler)).toBe(401);
  });
  it.each(ROLES.filter((r) => r !== "ADMIN"))("403 for %s", async (role) => {
    loginAs(role);
    expect(await statusOf(method, handler)).toBe(403);
  });
  it("lets ADMIN past the guard", async () => {
    loginAs("ADMIN");
    const s = await statusOf(method, handler);
    expect([401, 403]).not.toContain(s);
  });
});

describe.each(anyUserRoutes)("%s (any logged-in user)", (_name, method, handler) => {
  it("401 without a session", async () => {
    expect(await statusOf(method, handler)).toBe(401);
  });
  it.each(ROLES)("%s is let through", async (role) => {
    loginAs(role);
    expect([401, 403]).not.toContain(await statusOf(method, handler));
  });
});

// Safety net for later phases: a new API route cannot be added without a guard() call.
describe("every API route checks the role", () => {
  const PUBLIC_ON_PURPOSE = ["api/auth", "api/health", "api/setup", "api/public"];

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? routeFiles(p) : n === "route.ts" ? [p] : [];
    });
  }

  const root = path.join(process.cwd(), "src", "app");
  const files = routeFiles(path.join(root, "api"));

  it("finds the routes", () => expect(files.length).toBeGreaterThan(5));

  it.each(files.map((f) => path.relative(root, f).split(path.sep).join("/")))("%s", (rel) => {
    if (PUBLIC_ON_PURPOSE.some((p) => rel.startsWith(p))) return;
    const src = readFileSync(path.join(root, rel), "utf8");
    expect(src).toMatch(/await guard\(/);
  });
});
