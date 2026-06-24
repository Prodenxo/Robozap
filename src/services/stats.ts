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
      const storeJid = normalizedJid.includes('@s.whatsapp.net') ? normalizedJid : userJid

      if (userJid.endsWith('@lid') && normalizedJid.includes('@s.whatsapp.net')) {
        LidMapService.set(userJid, normalizedJid)
      }

      await (prisma as any).user.upsert({
        where: { jid: storeJid },
        update: { pushName: pushName || undefined },
        create: { jid: storeJid, pushName: pushName || 'Usuário' }
      });

      const group = await (prisma as any).group.upsert({
        where: { jid: groupJid },
        update: {},
        create: { jid: groupJid }
      });

      await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: group.id, userJid: storeJid } },
          update: { messagesSent: { increment: 1 } },
          create: { 
              group: { connect: { id: group.id } },
              user: { connect: { jid: storeJid } },
              messagesSent: 1
          }
      });

      await (prisma as any).messageLog.upsert({
        where: { messageId },
        update: {
          content: text || '',
          userJid: storeJid
        },
        create: {
          messageId,
          content: text || '',
          userJid: storeJid,
          type: 'text',
          group: { connect: { jid: groupJid } }
        }
      });
    } catch (error) {
      console.error('Error tracking stats:', error);
    }
  }
}
