import type { Prisma, PrismaClient } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  client: Client,
  entry: { actorUserId?: string | null; action: string; entity: string; entityId: string; ip?: string | null },
) {
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ip: entry.ip ?? null,
    },
  });
}
