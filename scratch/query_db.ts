import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const participants = await prisma.groupParticipant.findMany({
    include: {
      user: true,
      group: true
    }
  });
  console.log('Participants count:', participants.length);
  console.log('Sample participants:', JSON.stringify(participants.slice(0, 10), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
