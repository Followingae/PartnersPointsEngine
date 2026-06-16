import { SetMetadata } from '@nestjs/common';

export const GOVERNED_KEY = 'governed_entity_type';

/**
 * Marks a brand mutation route as subject to the maker-checker governance model.
 * The GovernanceInterceptor reads this + the brand's effective mode and either
 * lets the write through (autonomous), enqueues it as a change-request (approval
 * required), or blocks it (superadmin-managed).
 */
export const Governed = (entityType: string) => SetMetadata(GOVERNED_KEY, entityType);
