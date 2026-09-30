import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '@/lib/db';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'login_failed' | 'logout' | 'permission' | 'rate' | 'export' | 'settings' | 'mismatch';

export async function audit(
  entry: {
    user?: { id: string; name: string } | null;
    action: AuditAction;
    module: string;
    reference?: string;
    before?: unknown;
    after?: unknown;
  },
  tx?: Tx,
) {
  const db = tx ?? prisma;
  await db.auditLog.create({
    data: {
      userId: entry.user?.id ?? null,
      userName: entry.user?.name ?? '',
      action: entry.action,
      module: entry.module,
      reference: entry.reference ?? '',
      before: entry.before === undefined ? undefined : (jsonSafe(entry.before) as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (jsonSafe(entry.after) as Prisma.InputJsonValue),
    },
  });
}

/** Decimals → strings, Dates → ISO, so snapshots are exact and portable. */
export function jsonSafe(v: unknown): unknown {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => {
      if (val && typeof val === 'object' && typeof (val as { toFixed?: unknown }).toFixed === 'function' && 'd' in (val as object)) {
        return String(val);
      }
      return val;
    }),
  );
}
