/**
 * @aegis-ai/database
 * Prisma client and types for Aegis-AI (PostgreSQL + pgvector).
 *
 * Usage:
 *   import { prisma, getPrismaClient, Prisma } from '@aegis-ai/database';
 *   await prisma.embedding.findMany();
 */

export { prisma, getPrismaClient, createPrismaClient } from './client';
export { getPrismaFromSecret } from './secret-client';
export type { GetPrismaFromSecretOverrides } from './secret-client';
export { buildDatabaseUrl } from './url';
export type { DatabaseUrlConfig } from './url';
export { PrismaClient, Prisma } from '@prisma/client';
