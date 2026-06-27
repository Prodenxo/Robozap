import { WhatsAppService } from '../services/whatsapp';
import { prisma } from '../services/database';
import { botTexts } from '../config/texts';
import { LidMapService } from '../services/lidMap';
import { getParticipantDedupeKey, normalizePhoneKey } from '../services/activity';

const whatsapp = new WhatsAppService();

function isPhoneLikeName (name: string, phoneRaw: string): boolean {
  if (!name) return false

  const nameDigits = name.replace(/\D/g, '')
  if (!nameDigits || nameDigits.length < 10) return false

  const phoneDigits = phoneRaw.replace(/\D/g, '')
  const normalized = normalizePhoneKey(phoneRaw)

  return (
    nameDigits === phoneDigits ||
    nameDigits === normalized ||
    phoneDigits.endsWith(nameDigits) ||
    nameDigits.endsWith(normalized)
  )
}

function formatRoleParticipantLabel (
  participant: { userJid: string, user?: { pushName?: string | null } },
  resolvedJid: string,
  resolvedName: string
): string {
  const phoneRaw = resolvedJid.split('@')[0]
  const displayPhone = normalizePhoneKey(phoneRaw)
  const dbName = participant.user?.pushName?.trim()

  let name = resolvedName.trim()

  if (isPhoneLikeName(name, phoneRaw)) {
    name = dbName && !isPhoneLikeName(dbName, phoneRaw) ? dbName : 'Sem nome'
  } else if (!name || name === 'Usuário') {
    name = dbName || 'Sem nome'
  }

  if (resolvedJid.endsWith('@lid') && !displayPhone) {
    return name
  }

  return displayPhone ? `(${displayPhone}) ${name}` : name
}

async function buildRoleParticipantLabels (
  participations: Array<{ participant: { userJid: string, user?: { pushName?: string | null } } }>,
  groupJid: string
): Promise<string[]> {
  const lidMap = LidMapService.getFullMap()
  const seen = new Set<string>()
  const labels: string[] = []

  for (const entry of participations) {
    const dedupeKey = getParticipantDedupeKey(entry.participant.userJid, lidMap)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const resolvedJid = await whatsapp.resolveJid(entry.participant.userJid)
    const resolvedName = await whatsapp.resolveName(resolvedJid, groupJid)
    labels.push(formatRoleParticipantLabel(entry.participant, resolvedJid, resolvedName))
  }

  return labels
}

function extractRoleCriarPayload (fullText: string): { title: string, description: string } {
  const trimmed = fullText.trim()
  const match = trimmed.match(/^\.(?:role\.criar|resenha\.criar)(?:[\s\n]|$)([\s\S]*)$/i)
  const payload = match?.[1]?.replace(/^\n/, '') ?? ''

  if (!payload.trim()) {
    return { title: '', description: '' }
  }

  const pipeIndex = payload.indexOf('|')
  if (pipeIndex === -1) {
    return { title: payload.trim(), description: '' }
  }

  return {
    title: payload.slice(0, pipeIndex).trim(),
    description: payload.slice(pipeIndex + 1).replace(/^\n+/, '').trim()
  }
}

function buildRoleCreatedMessage (role: { code: string, title: string, description?: string | null }): string {
  let text =
    `✅ *ROLÊ MARCADO!* 🍻\n\n` +
    `📌 *[Código: ${role.code}] - ${role.title}*`

  const description = role.description?.trim()
  if (description && description !== 'Sem descrição') {
    text += `\n\n${description}`
  }

  text +=
    `\n\nPara participar, responda com:\n` +
    `👉 *.vou ${role.code}* - Confirmar presença\n` +
    `👉 *.nvou ${role.code}* - Recusar / Não vou\n\n` +
    `Para ver a lista atualizada, digite *.roles ${role.code}*.`

  return text
}

export const handleSocialCommands = async (command: string, args: string[], msg: any) => {
  const userJid = await whatsapp.resolveJid(LidMapService.get(msg.participant) || msg.participant);

  switch (command) {
    case 'radio':
    case 'playlist':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.radio);
      return true;

    case 'role.criar':
    case 'resenha.criar': {
      const { title, description } = extractRoleCriarPayload(msg.text || '')

      if (!title) {
        await whatsapp.sendMessage(
          msg.remoteJid,
          '❌ *ERRO:* Manda o nome do rolê!\n\n' +
          'Exemplo simples:\n`.role.criar Churrasco | Sábado 20h`\n\n' +
          'Exemplo com texto longo (use | na 1ª linha e o resto embaixo):\n' +
          '`.role.criar 🚨 Arraiá 🚨 |\nEstá chegando...\nhttps://link-do-grupo`'
        )
        return true
      }

      try {
        const group = await (prisma as any).group.upsert({
          where: { jid: msg.remoteJid },
          update: {},
          create: { jid: msg.remoteJid }
        })

        const roles = await (prisma as any).roleEvent.findMany({
          where: { groupId: group.id }
        })
        let maxCodeNum = 0
        for (const r of roles) {
          const num = parseInt(r.code, 10)
          if (!isNaN(num) && num > maxCodeNum) {
            maxCodeNum = num
          }
        }
        const eventCode = (maxCodeNum + 1).toString()

        const newRole = await (prisma as any).roleEvent.create({
          data: {
            title,
            description: description || null,
            code: eventCode,
            createdBy: userJid,
            group: { connect: { id: group.id } }
          }
        })

        await whatsapp.sendMessage(
          msg.remoteJid,
          buildRoleCreatedMessage(newRole)
        )
      } catch (error: any) {
        console.error('Error creating role:', error)
        const isTooLong = error?.code === 'P2000'
        await whatsapp.sendMessage(
          msg.remoteJid,
          isTooLong
            ? '❌ *Texto do rolê grande demais pro banco.* Faz redeploy do robozap (atualização do banco) e tenta de novo.'
            : '❌ *Não consegui criar o rolê.* Tenta de novo em instantes.'
        )
      }
      return true
    }

    case 'role.encerrar':
    case 'role.cancelar':
    case 'resenha.cancelar':
    case 'resenha.fim':
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        const targetCode = args[0]?.trim();
        let targetRole;

        if (targetCode) {
          targetRole = await (prisma as any).roleEvent.findFirst({
            where: { groupId: group.id, code: targetCode, active: true }
          });
          if (!targetRole) {
            await whatsapp.sendMessage(msg.remoteJid, `❌ Não encontrei nenhum rolê ativo com o código *"${targetCode}"* neste grupo.`);
            return true;
          }
        } else {
          targetRole = await (prisma as any).roleEvent.findFirst({
            where: { groupId: group.id, active: true },
            orderBy: { createdAt: 'desc' }
          });
          if (!targetRole) {
            await whatsapp.sendMessage(msg.remoteJid, "❌ Não tem nenhum rolê ativo no momento para encerrar.");
            return true;
          }
        }

        await (prisma as any).roleEvent.update({
          where: { id: targetRole.id },
          data: { active: false }
        });

        await whatsapp.sendMessage(msg.remoteJid, `🏁 *ROLÊ FINALIZADO!* 🔒\nO rolê *"[Código: ${targetRole.code}] - ${targetRole.title}"* foi encerrado e não aceita mais participações.`);
      } catch (error) {
        console.error('Error ending role:', error);
      }
      return true;

    case 'vou':
    case 'role.vou':
    case 'nvou':
    case 'role.nvou':
    case 'vounao':
    case 'lista.entrar':
    case 'nicho.entrar':
    case 'lista.sim':
    case 'nicho.sim':
    case 'lista.participar':
    case 'nicho.participar':
    case 'lista.quero':
    case 'nicho.quero':
    case 'lista.todentro':
    case 'nicho.todentro':
    case 'lista.sair':
    case 'nicho.sair':
    case 'lista.nao':
    case 'nicho.nao':
    case 'lista.nparticipar':
    case 'nicho.nparticipar':
    case 'lista.nquero':
    case 'nicho.nquero':
    case 'lista.tofora':
    case 'nicho.tofora':
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        const targetCode = args[0]?.trim();
        let targetRole;

        if (targetCode) {
          targetRole = await (prisma as any).roleEvent.findFirst({
            where: { groupId: group.id, code: targetCode, active: true }
          });
          if (!targetRole) {
            await whatsapp.sendMessage(msg.remoteJid, `❌ Não encontrei nenhum rolê ativo com o código *"${targetCode}"* neste grupo.`);
            return true;
          }
        } else {
          targetRole = await (prisma as any).roleEvent.findFirst({
            where: { groupId: group.id, active: true },
            orderBy: { createdAt: 'desc' }
          });
          if (!targetRole) {
            await whatsapp.sendMessage(msg.remoteJid, "❌ Não tem nenhum rolê marcado por aqui ainda. Crie um com `.role.criar`!");
            return true;
          }
        }

        const isYes = [
          'vou', 'role.vou', 
          'lista.entrar', 'nicho.entrar', 
          'lista.sim', 'nicho.sim', 
          'lista.participar', 'nicho.participar', 
          'lista.quero', 'nicho.quero', 
          'lista.todentro', 'nicho.todentro'
        ].includes(command);

        const status = isYes ? 'vou' : 'nvou';
        
        // Garante que o usuário existe no banco com o pushName atualizado
        await (prisma as any).user.upsert({
          where: { jid: userJid },
          update: { pushName: msg.pushName || 'Usuário' },
          create: { jid: userJid, pushName: msg.pushName || 'Usuário' }
        });

        // Garante que o participante está registrado no grupo
        const participant = await (prisma as any).groupParticipant.upsert({
          where: { groupId_userJid: { groupId: group.id, userJid } },
          update: {},
          create: {
            group: { connect: { id: group.id } },
            user: { connect: { jid: userJid } },
            roleCode: 5
          }
        });

        await (prisma as any).roleParticipation.upsert({
          where: { roleId_participantId: { roleId: targetRole.id, participantId: participant.id } },
          update: { status: status },
          create: { roleId: targetRole.id, participantId: participant.id, status: status }
        });

        // Limpa participações duplicadas do mesmo usuário (LID vs JID real)
        const allPartsForRole = await (prisma as any).roleParticipation.findMany({
          where: { roleId: targetRole.id },
          include: { participant: true }
        });
        const seenResolved = new Map<string, any>();
        const lidMap = LidMapService.getFullMap();
        for (const part of allPartsForRole) {
          const dedupeKey = getParticipantDedupeKey(part.participant.userJid, lidMap);
          if (seenResolved.has(dedupeKey)) {
            const existing = seenResolved.get(dedupeKey);
            const toDelete = part.participantId === participant.id ? existing : part;
            const toKeep = part.participantId === participant.id ? part : existing;
            await (prisma as any).roleParticipation.delete({ where: { id: toDelete.id } });
            seenResolved.set(dedupeKey, toKeep);
          } else {
            seenResolved.set(dedupeKey, part);
          }
        }

        // Busca a lista atualizada de participantes (após limpeza)
        const roleWithParticipations = await (prisma as any).roleEvent.findUnique({
          where: { id: targetRole.id },
          include: { 
            participations: { 
              include: { participant: { include: { user: true } } } 
            } 
          }
        });

        const vao = roleWithParticipations.participations.filter((p: any) => p.status === 'vou');
        const nvao = roleWithParticipations.participations.filter((p: any) => p.status === 'nvou');

        const vaoNames = await buildRoleParticipantLabels(vao, msg.remoteJid);
        const nvaoNames = await buildRoleParticipantLabels(nvao, msg.remoteJid);

        const icon = status === 'vou' ? '✅' : '❌';
        const actionText = status === 'vou' ? 'confirmou presença' : 'recusou';
        
        let replyText = `${icon} *${msg.pushName}* ${actionText} no rolê *"${targetRole.title}"*!\n\n`;
        replyText += `✅ *Vão (${vaoNames.length}):* ${vaoNames.join(', ') || 'Ninguém'}\n`;
        replyText += `❌ *Não vão (${nvaoNames.length}):* ${nvaoNames.join(', ') || 'Todo mundo'}\n\n`;
        replyText += `Para atualizar sua presença, digite *.vou ${targetRole.code}* ou *.nvou ${targetRole.code}*!`;

        await whatsapp.sendMessage(msg.remoteJid, replyText);
      } catch (error) {
        console.error('Error in role participation:', error);
      }
      return true;

    case 'roles':
    case 'resenha':
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        const targetCode = args[0]?.trim();
        let currentRoles = [];

        if (targetCode) {
          const role = await (prisma as any).roleEvent.findFirst({
            where: { groupId: group.id, code: targetCode, active: true },
            include: { 
              participations: { 
                include: { participant: { include: { user: true } } } 
              } 
            }
          });
          if (role) {
            currentRoles = [role];
          } else {
            await whatsapp.sendMessage(msg.remoteJid, `❌ Não encontrei nenhum rolê ativo com o código *"${targetCode}"* neste grupo.`);
            return true;
          }
        } else {
          currentRoles = await (prisma as any).roleEvent.findMany({
            where: { groupId: group.id, active: true },
            include: { 
              participations: { 
                include: { participant: { include: { user: true } } } 
              } 
            },
            orderBy: { createdAt: 'desc' },
            take: 3
          });
        }

        if (currentRoles.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, "📭 *NENHUM ROLÊ MARCADO.* Que tristeza, bando de desocupados!");
          return true;
        }

        let listText = targetCode 
          ? `🍻 *DETALHES DO ROLÊ [Código: ${targetCode}]* 🍻\n\n`
          : `🍻 *PRÓXIMOS ROLÊS DA TROPA* 🍻\n\n`;

        for (const role of currentRoles) {
          const vao = role.participations.filter((p: any) => p.status === 'vou');
          const nvao = role.participations.filter((p: any) => p.status === 'nvou');

          const vaoNames = await buildRoleParticipantLabels(vao, msg.remoteJid);
          const nvaoNames = await buildRoleParticipantLabels(nvao, msg.remoteJid);

          listText += `📌 *[Código: ${role.code}] - ${role.title}*\n`;
          if (role.description) listText += `📝 ${role.description}\n`;
          listText += `✅ *Vão (${vaoNames.length}):* ${vaoNames.join(', ') || 'Ninguém'}\n`;
          listText += `❌ *Não vão (${nvaoNames.length}):* ${nvaoNames.join(', ') || 'Todo mundo'}\n\n`;
        }

        if (!targetCode && currentRoles.length > 0) {
          listText += `Para ver a lista detalhada de um rolê específico, use o código (ex: *.roles ${currentRoles[0].code}*).`;
        }
        
        await whatsapp.sendMessage(msg.remoteJid, listText);
      } catch (error) {
        console.error('Error listing roles:', error);
      }
      return true;

    default:
      return false;
  }
};
