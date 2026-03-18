import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class StatsService {
  async trackMessage(userJid: string, groupJid: string, messageId: string, text: string, pushName?: string) {
    try {
      // Upsert user to ensure we have their latest pushName
      await prisma.user.upsert({
        where: { jid: userJid },
        update: { pushName: pushName || undefined },
        create: { jid: userJid, pushName: pushName || 'Usuário' }
      });

      const group = await prisma.group.findUnique({
        where: { jid: groupJid }
      });

      if (!group) {
        await prisma.group.create({
          data: { jid: groupJid }
        });
      }

      await prisma.groupMessage.create({
        data: {
          messageId,
          text,
          userJid,
          group: { connect: { jid: groupJid } }
        }
      });
    } catch (error) {
      console.error('Error tracking stats:', error);
    }
  }
}
