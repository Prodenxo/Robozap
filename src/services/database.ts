import { PrismaClient } from '@prisma/client';

// Prisma 7 requires explicit configuration if the environment is not automatically detected
// or when using the new prisma.config.ts system.
export const prisma = new PrismaClient({} as any);
