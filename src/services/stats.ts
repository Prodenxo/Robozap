import { prisma } from './database';

export class StatsService {
  async trackMessage(userJid: string, groupJid: string, messageId: string, text: string, pushName?: string) {
    try {
      // Upsert user to ensure we have their latest pushName
      await (prisma as any).user.upsert({
        where: { jid: userJid },
        update: { pushName: pushName || undefined },
        create: { jid: userJid, pushName: pushName || 'Usuário' }
      });

      const group = await (prisma as any).group.findUnique({
        where: { jid: groupJid }
      });

      if (!group) {
        await (prisma as any).group.create({
          data: { jid: groupJid }
        });
      }

      await (prisma as any).messageLog.create({
        data: {
          messageId,
          content: text,
          userJid,
          type: 'text',
          group: { connect: { jid: groupJid } }
        }
      });
    } catch (error) {
      console.error('Error tracking stats:', error);
    }
  }
}
