import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class StatsService {
  async trackMessage(userJid: string, groupJid: string, messageId: string, text: string) {
    try {
      // Find or create user
      const user = await prisma.user.upsert({
        where: { jid: userJid },
        update: { 
          messagesSent: { increment: 1 }
        },
        create: {
          jid: userJid,
          messagesSent: 1
        }
      });

      // Find or create group
      const group = await prisma.group.upsert({
        where: { jid: groupJid },
        update: {},
        create: { jid: groupJid }
      });

      // Link user to group if not exists
      const userGroup = await prisma.userGroup.findUnique({
        where: {
          userId_groupId: {
            userId: user.id,
            groupId: group.id
          }
        }
      });

      if (!userGroup) {
        await prisma.userGroup.create({
          data: {
            userId: user.id,
            groupId: group.id
          }
        });
      }

      // Save message for summaries (limit to last 500 per group to avoid DB swelling)
      await prisma.groupMessage.create({
        data: {
          messageId,
          text,
          userJid,
          groupId: group.id
        }
      });

    } catch (error) {
      console.error('Error tracking message:', error);
    }
  }

  async getUserStats(userJid: string) {
    return await prisma.user.findUnique({
      where: { jid: userJid }
    });
  }

  async getTopAtivos(groupId: string, limit: number = 10) {
    // This is a simplified version. A real one would check the timeframe in GroupMessage.
    const group = await prisma.group.findUnique({
      where: { jid: groupId },
      include: {
        users: {
          include: {
            user: true
          }
        }
      }
    });

    if (!group) return [];

    return group.users
      .map((ug: any) => ug.user)
      .sort((a: any, b: any) => b.messagesSent - a.messagesSent)
      .slice(0, limit);
  }
}
