import { PrismaClient } from './generated/prisma';

export const prisma = new PrismaClient();

// Optional: handle shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
