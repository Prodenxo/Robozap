import { prisma } from './database';
import { LidMapService } from './lidMap';

function normalizeStatsJid (userJid: string): string {
  if (!userJid) return userJid

  if (userJid.endsWith('@lid')) {
    return LidMapService.get(userJid) || userJid
  }

  return userJid
}

export class StatsService {
  async trackMessage(userJid: string, groupJid: string, messageId: string, text: string, pushName?: string) {
    try {
      const normalizedJid = normalizeStatsJid(userJid)

      // 1. Ensure User exists
      const user = await (prisma as any).user.upsert({
        where: { jid: normalizedJid },
        update: { pushName: pushName || undefined },
        create: { jid: normalizedJid, pushName: pushName || 'Usuário' }
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
          where: { groupId_userJid: { groupId: group.id, userJid: normalizedJid } },
          update: { messagesSent: { increment: 1 } },
          create: { 
              group: { connect: { id: group.id } },
              user: { connect: { jid: normalizedJid } },
              messagesSent: 1
          }
      });

      // 4. Log Message (ignora duplicata do mesmo webhook)
      await (prisma as any).messageLog.upsert({
        where: { messageId },
        update: {
          content: text || '',
          userJid: normalizedJid
        },
        create: {
          messageId,
          content: text || '',
          userJid: normalizedJid,
          type: 'text',
          group: { connect: { jid: groupJid } }
        }
      });
    } catch (error) {
      console.error('Error tracking stats:', error);
    }
  }
}
