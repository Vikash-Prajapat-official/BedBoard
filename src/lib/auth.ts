import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { authConfig } from "./auth.config";
import { loginSchema } from "./validation";
import { loginLimiter } from "./rate-limit";
import { writeAudit } from "./audit";

// Compared against when the phone is unknown so timing does not reveal accounts.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 12));

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { phone: {}, password: {} },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { phone, password } = parsed.data;

        if (loginLimiter.blocked(phone)) return null;

        const user = await db.user.findUnique({ where: { phone } });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

        if (!user || !user.active || !ok) {
          loginLimiter.fail(phone);
          if (user) await writeAudit(db, { actorUserId: user.id, action: "login_failed", entity: "user", entityId: user.id, ip });
          return null;
        }

        loginLimiter.clear(phone);
        await writeAudit(db, { actorUserId: user.id, action: "login", entity: "user", entityId: user.id, ip });
        return { id: user.id, name: user.name };
      },
    }),
  ],
});
