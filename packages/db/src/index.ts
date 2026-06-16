// Re-export the generated Prisma client + types as the single DB entrypoint.
// The API instantiates its own PrismaClient (as the `loyalty_app` role) in its
// PrismaService; consumers import types/enums from here.
export * from '@prisma/client';

// The framework-agnostic double-entry ledger engine + operations (Phase 2).
export * as ledger from './ledger';
