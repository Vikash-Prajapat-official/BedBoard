import type { Prisma } from "@prisma/client";
import { db } from "./db";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = { page?: number; action?: string; actorId?: string; from?: Date; to?: Date };

/** Newest first. Rows hold ids and labels only: there is no patient data in the audit log. */
export async function getAuditPage(f: AuditFilter) {
  const page = Math.max(1, f.page ?? 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.action ? { action: f.action } : {}),
    ...(f.actorId ? { actorUserId: f.actorId } : {}),
    ...((f.from || f.to) ? { at: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {}),
  };
  const [total, rows, actions, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: { id: true, at: true, action: true, entity: true, entityId: true, ip: true, actor: { select: { name: true, role: true } } },
    }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Show "Ward / Bed 12" instead of a raw id for bed rows.
  const bedIds = rows.filter((r) => r.entity === "bed").map((r) => r.entityId);
  const beds = bedIds.length
    ? await db.bed.findMany({ where: { id: { in: bedIds } }, select: { id: true, label: true, ward: { select: { name: true } } } })
    : [];
  const bedLabel = new Map(beds.map((b) => [b.id, `${b.ward.name} / ${b.label}`]));

  return {
    page,
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    actions: actions.map((a) => a.action),
    users,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      action: r.action,
      what: r.entity === "bed" ? (bedLabel.get(r.entityId) ?? `bed ${r.entityId}`) : `${r.entity} ${r.entityId}`,
      actor: r.actor ? `${r.actor.name} (${r.actor.role.toLowerCase()})` : "system",
      ip: r.ip,
    })),
  };
}
