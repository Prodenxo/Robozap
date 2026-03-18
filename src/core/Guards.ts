import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PermissionGuard {
  static ROLES = {
    DONO: 1,
    ADM_CONFIAVEL: 2,
    ADM: 3,
    MODERADOR: 4,
    MEMBRO: 5
  };

  /**
   * Verifica se o usuário tem o cargo mínimo para o comando
   */
  static async canExecute(userJid: string, groupJid: string, minRole: number) {
    const participant = await prisma.groupParticipant.findFirst({
      where: { userJid, group: { jid: groupJid } }
    });

    if (!participant) return minRole === this.ROLES.MEMBRO; // Default for new users
    return participant.roleCode <= minRole;
  }
}

export class SubscriptionGuard {
  /**
   * Verifica se o grupo está com a assinatura em dia
   */
  static async checkSubscription(groupJid: string) {
    const group = await prisma.group.findUnique({ where: { jid: groupJid } });
    
    if (!group) return true; // Default to active if not tracked yet

    const now = new Date();
    if (group.subscriptionStatus === 'EXPIRED' || (group.subscriptionExpiresAt && group.subscriptionExpiresAt < now)) {
      return false;
    }
    return true;
  }

  /**
   * Retorna o sufixo de assinatura (emoji invisível se expirado)
   */
  static async getSuffix(groupJid: string) {
    const active = await this.checkSubscription(groupJid);
    return active ? '' : ' 🫥';
  }
}
