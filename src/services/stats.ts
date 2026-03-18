import { prisma } from './database';

export class StatsService {
  async trackMessage(userJid: string, groupJid: string, messageId: string, text: string, pushName?: string) {
    try {
      // 1. Ensure User exists
      const user = await (prisma as any).user.upsert({
        where: { jid: userJid },
        update: { pushName: pushName || undefined },
        create: { jid: userJid, pushName: pushName || 'Usuário' }
      });

      // 2. Ensure Group exists
      const group = await (prisma as any).group.upsert({
        where: { jid: groupJid },
        update: {},
        create: { jid: groupJid }
      });

      // 3. Ensure GroupParticipant link exists (The missing piece!)
      // We use the group's UUID (group.id) now, instead of the JID
      await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: group.id, userJid } },
          update: { messagesSent: { increment: 1 } },
          create: { 
              group: { connect: { id: group.id } },
              user: { connect: { jid: userJid } },
              messagesSent: 1
          }
      });

      // 4. Log Message
      await (prisma as any).messageLog.create({
        data: {
          messageId,
          content: text || '',
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
