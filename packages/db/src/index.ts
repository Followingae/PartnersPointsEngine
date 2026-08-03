// Re-export the generated Prisma client + types as the single DB entrypoint.
// The API instantiates its own PrismaClient (as the `loyalty_app` role) in its
// PrismaService; consumers import types/enums from here.
export * from '@prisma/client';

// The framework-agnostic double-entry ledger engine + operations (Phase 2).
export * as ledger from './ledger';

// The ordered list of incremental migrations, shared by the API's boot
// migrator, db:apply and the test harness so they cannot drift.
export { INCREMENTAL_MIGRATIONS } from './migrations';
