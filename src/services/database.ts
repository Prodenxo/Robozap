import { PrismaClient } from '@prisma/client';

// Standard PrismaClient initialization (uses DATABASE_URL from environment by default)
export const prisma = new PrismaClient();
