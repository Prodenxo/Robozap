import { prisma } from '../services/database';
import { LidMapService } from '../services/lidMap';
import { collectJidAliases, normalizePhoneKey } from '../services/activity';

export class PermissionGuard {
  static ROLES = {
    DONO: 1,
    ADM_CONFIAVEL: 2,
    ADM: 3,
    MODERADOR: 4,
    MEMBRO: 5
  };

  static async findParticipant (userJid: string, groupJid: string) {
    const lidMap = LidMapService.getFullMap()
    const aliases = collectJidAliases(userJid, lidMap)

    let matches = await prisma.groupParticipant.findMany({
      where: {
        group: { jid: groupJid },
        userJid: { in: aliases }
      }
    })

    if (matches.length === 0) {
      const targetPhone = normalizePhoneKey(userJid.split('@')[0])
      if (!targetPhone) return null

      const allInGroup = await prisma.groupParticipant.findMany({
        where: { group: { jid: groupJid } }
      })

      matches = allInGroup.filter(
        (participant) =>
          normalizePhoneKey(participant.userJid.split('@')[0]) === targetPhone
      )
    }

    if (matches.length === 0) return null

    return matches.sort((a, b) => {
      if (a.roleCode !== b.roleCode) return a.roleCode - b.roleCode
      if (a.userJid.includes('@s.whatsapp.net') && !b.userJid.includes('@s.whatsapp.net')) return -1
      if (!a.userJid.includes('@s.whatsapp.net') && b.userJid.includes('@s.whatsapp.net')) return 1
      return 0
    })[0]
  }

  /**
   * Verifica se o usuário tem o cargo mínimo para o comando
   */
  static async canExecute (userJid: string, groupJid: string, minRole: number) {
    console.log(
      `[GUARD] canExecute user=${userJid} group=${groupJid} minRole=${minRole}`
    )

    const participant = await this.findParticipant(userJid, groupJid)

    if (!participant) {
      console.log(`[GUARD] Participante não encontrado no grupo ${groupJid}`)
      return minRole === this.ROLES.MEMBRO
    }

    console.log(`[GUARD] roleCode=${participant.roleCode} userJid=${participant.userJid}`)
    return participant.roleCode <= minRole
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
