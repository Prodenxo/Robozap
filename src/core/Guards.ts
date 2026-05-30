import { prisma } from '../services/database';

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
    console.log(`[GUARD DEBUG] canExecute - userJid: ${userJid}, groupJid: ${groupJid}, minRole: ${minRole}`);

    const participant = await prisma.groupParticipant.findFirst({
      where: { userJid, group: { jid: groupJid } }
    });

    if (!participant) {
      console.log(`[GUARD DEBUG] Participant NOT found in DB. Listing all participants in group ${groupJid}:`);
      try {
        const allParts = await prisma.groupParticipant.findMany({
          where: { group: { jid: groupJid } },
          select: { userJid: true, roleCode: true }
        });
        console.log(`[GUARD DEBUG] Total participants in DB: ${allParts.length}`);
        console.log(`[GUARD DEBUG] Participants in DB:`, JSON.stringify(allParts));
      } catch (e) {
        console.error(`[GUARD DEBUG] Error listing participants:`, e);
      }
      return minRole === this.ROLES.MEMBRO; // Default for new users
    }

    console.log(`[GUARD DEBUG] Participant found in DB. roleCode: ${participant.roleCode}`);
    return participant.roleCode <= minRole;
  }
}

export class SubscriptionGuard {
  /**
   * Verifica se o grupo está com a assinatura em dia
   */
  static async checkSubscription (groupJid: string) {
    try {
      const group = await prisma.group.findUnique({ where: { jid: groupJid } });

      if (!group) return true;

      const now = new Date();
      if (
        group.subscriptionStatus === 'EXPIRED' ||
        (group.subscriptionExpiresAt && group.subscriptionExpiresAt < now)
      ) {
        return false;
      }
      return true;
    } catch (error) {
      console.error('[SUBSCRIPTION] Erro ao consultar banco — liberando comando:', error);
      return true;
    }
  }

  /**
   * Retorna o sufixo de assinatura (emoji invisível se expirado)
   */
  static async getSuffix (groupJid: string) {
    try {
      const active = await this.checkSubscription(groupJid);
      return active ? '' : ' 🫥';
    } catch {
      return '';
    }
  }
}
