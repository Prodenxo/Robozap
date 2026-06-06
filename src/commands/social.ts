import { WhatsAppService } from '../services/whatsapp';
import { prisma } from '../services/database';
import { botTexts } from '../config/texts';
import { LidMapService } from '../services/lidMap';

const whatsapp = new WhatsAppService();

export const handleSocialCommands = async (command: string, args: string[], msg: any) => {
  const userJid = LidMapService.get(msg.participant) || msg.participant;

  switch (command) {
    case 'radio':
    case 'playlist':
      await whatsapp.sendMessage(msg.remoteJid, botTexts.social.radio);
      return true;

    case 'role.criar':
    case 'resenha.criar':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "❌ *ERRO:* Manda o nome do rolê! Ex: `.role.criar Churrasco | Sábado 20h`.");
        return true;
      }
      const [title, description] = args.join(' ').split('|').map(s => s.trim());
      try {
        const group = await (prisma as any).group.findUnique({ where: { jid: msg.remoteJid } });
        if (!group) return true;

        // Determinar o próximo código numérico sequencial único para o grupo
        const roles = await (prisma as any).roleEvent.findMany({
          where: { groupId: group.id }
        });
        let maxCodeNum = 0;
        for (const r of roles) {
          const num = parseInt(r.code, 10);
          if (!isNaN(num) && num > maxCodeNum) {
            maxCodeNum = num;
          }
        }
        const eventCode = (maxCodeNum + 1).toString();

        const newRole = await (prisma as any).roleEvent.create({
          data: {
            title: title || "Novo Rolê",
            description: description || "Sem descrição",
            code: eventCode,
            createdBy: userJid,
            group: { connect: { id: group.id } }
          }
        });
        await whatsapp.sendMessage(
          msg.remoteJid,
          `✅ *ROLÊ MARCADO!* 🍻\n\n📌 *[Código: ${newRole.code}] - ${newRole.title}*\n📝 ${newRole.description || 'Sem descrição'}\n\nPara participar, responda com:\n👉 *.vou ${newRole.code}* - Confirmar presença\n👉 *.nvou ${newRole.code}* - Recusar / Não vou\n\nPara ver a lista atualizada, digite *.roles ${newRole.code}*.`
        );
      } catch (error) {
        console.error('Error creating role:', error);
      }
      return true;

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
        for (const part of allPartsForRole) {
          const resolvedPartJid = LidMapService.get(part.participant.userJid) || part.participant.userJid;
          if (seenResolved.has(resolvedPartJid)) {
            // Duplicata encontrada — mantém o registro atual (participant.id) e deleta o outro
            const existing = seenResolved.get(resolvedPartJid);
            const toDelete = part.participantId === participant.id ? existing : part;
            const toKeep = part.participantId === participant.id ? part : existing;
            await (prisma as any).roleParticipation.delete({ where: { id: toDelete.id } });
            seenResolved.set(resolvedPartJid, toKeep);
          } else {
            seenResolved.set(resolvedPartJid, part);
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

        const vaoNames = await Promise.all(
          vao.map(async (p: any) => {
            const resolvedJid = LidMapService.get(p.participant.userJid) || p.participant.userJid;
            const name = await whatsapp.resolveName(resolvedJid, msg.remoteJid);
            if (resolvedJid.endsWith('@lid')) return name;
            let num = resolvedJid.split('@')[0];
            if (num.startsWith('55') && num.length > 10) num = num.substring(2);
            return `${name} (${num})`;
          })
        );
        const nvaoNames = await Promise.all(
          nvao.map(async (p: any) => {
            const resolvedJid = LidMapService.get(p.participant.userJid) || p.participant.userJid;
            const name = await whatsapp.resolveName(resolvedJid, msg.remoteJid);
            if (resolvedJid.endsWith('@lid')) return name;
            let num = resolvedJid.split('@')[0];
            if (num.startsWith('55') && num.length > 10) num = num.substring(2);
            return `${name} (${num})`;
          })
        );

        const icon = status === 'vou' ? '✅' : '❌';
        const actionText = status === 'vou' ? 'confirmou presença' : 'recusou';
        
        let replyText = `${icon} *${msg.pushName}* ${actionText} no rolê *"${targetRole.title}"*!\n\n`;
        replyText += `✅ *Vão (${vao.length}):* ${vaoNames.join(', ') || 'Ninguém'}\n`;
        replyText += `❌ *Não vão (${nvao.length}):* ${nvaoNames.join(', ') || 'Todo mundo'}\n\n`;
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

          const vaoNames = await Promise.all(
            vao.map(async (p: any) => {
              const resolvedJid = LidMapService.get(p.participant.userJid) || p.participant.userJid;
              const name = await whatsapp.resolveName(resolvedJid, msg.remoteJid);
              if (resolvedJid.endsWith('@lid')) return name;
              let num = resolvedJid.split('@')[0];
              if (num.startsWith('55') && num.length > 10) num = num.substring(2);
              return `${name} (${num})`;
            })
          );
          const nvaoNames = await Promise.all(
            nvao.map(async (p: any) => {
              const resolvedJid = LidMapService.get(p.participant.userJid) || p.participant.userJid;
              const name = await whatsapp.resolveName(resolvedJid, msg.remoteJid);
              if (resolvedJid.endsWith('@lid')) return name;
              let num = resolvedJid.split('@')[0];
              if (num.startsWith('55') && num.length > 10) num = num.substring(2);
              return `${name} (${num})`;
            })
          );

          listText += `📌 *[Código: ${role.code}] - ${role.title}*\n`;
          if (role.description) listText += `📝 ${role.description}\n`;
          listText += `✅ *Vão (${vao.length}):* ${vaoNames.join(', ') || 'Ninguém'}\n`;
          listText += `❌ *Não vão (${nvao.length}):* ${nvaoNames.join(', ') || 'Todo mundo'}\n\n`;
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
