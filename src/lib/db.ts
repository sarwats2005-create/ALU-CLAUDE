import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma = g.__prisma ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') g.__prisma = prisma;

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Run a business transaction. Serializable-safe retry on deadlock / serialization failure. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(fn, { timeout: 20000, maxWait: 10000 });
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? '');
      const code = (e as { code?: string })?.code;
      const retryable = code === 'P2034' || /deadlock detected|could not serialize/i.test(msg);
      if (retryable && attempt < 3) { attempt++; continue; }
      throw e;
    }
  }
}
