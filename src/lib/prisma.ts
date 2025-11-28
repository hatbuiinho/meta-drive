import { PrismaClient } from '@prisma/client';

// In Prisma 7+, the database URL must be passed to the PrismaClient constructor
// instead of being defined in the schema.prisma file
const prisma = new PrismaClient({});

export default prisma;
