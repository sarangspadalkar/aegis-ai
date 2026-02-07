import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Singleton Prisma client. Use when DATABASE_URL is already in process.env (e.g. local dev).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Get the shared Prisma client instance (uses DATABASE_URL from env).
 */
export function getPrismaClient(): PrismaClient {
  return prisma;
}

/**
 * Create a Prisma client with an explicit URL. Use in Lambda when building URL from Secrets Manager.
 * Caller should reuse the returned client across invocations.
 */
export function createPrismaClient(datasourceUrl: string): PrismaClient {
  return new PrismaClient({
    datasourceUrl,
    log: ['error'],
  });
}
