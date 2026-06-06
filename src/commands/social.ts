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

        const newRole = await (prisma as any).roleEvent.create({
          data: {
            title: title || "Novo Rolê",
            description: description || "Sem descrição",
            code: `ROLE_${Date.now()}`,
            createdBy: userJid,
            group: { connect: { id: group.id } }
          }
        });
        await whatsapp.sendMessage(
          msg.remoteJid,
          `✅ *ROLÊ MARCADO!* 🍻\n\n📌 *${newRole.title}*\n📝 ${newRole.description}\n\nPara participar, responda com:\n👉 *.vou* - Confirmar presença\n👉 *.nvou* - Recusar / Não vou\n\nPara ver a lista atualizada a qualquer momento, digite *.roles* ou *.resenha*.`
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

        const latestRole = await (prisma as any).roleEvent.findFirst({
          where: { groupId: group.id, active: true },
          orderBy: { createdAt: 'desc' }
        });

        if (!latestRole) {
          await whatsapp.sendMessage(msg.remoteJid, "❌ Não tem nenhum rolê ativo no momento para encerrar.");
          return true;
        }

        await (prisma as any).roleEvent.update({
          where: { id: latestRole.id },
          data: { active: false }
        });

        await whatsapp.sendMessage(msg.remoteJid, `🏁 *ROLÊ FINALIZADO!* 🔒\nO rolê "${latestRole.title}" foi encerrado e não aceita mais participações.`);
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

        const latestRole = await (prisma as any).roleEvent.findFirst({
          where: { groupId: group.id, active: true },
          orderBy: { createdAt: 'desc' }
        });

        if (!latestRole) {
          await whatsapp.sendMessage(msg.remoteJid, "❌ Não tem nenhum rolê marcado por aqui ainda. Crie um com `.role.criar`!");
          return true;
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
          where: { roleId_participantId: { roleId: latestRole.id, participantId: participant.id } },
          update: { status: status },
          create: { roleId: latestRole.id, participantId: participant.id, status: status }
        });

        // Busca a lista atualizada de participantes
        const roleWithParticipations = await (prisma as any).roleEvent.findUnique({
          where: { id: latestRole.id },
          include: { 
            participations: { 
              include: { participant: { include: { user: true } } } 
            } 
          }
        });

        const vao = roleWithParticipations.participations.filter((p: any) => p.status === 'vou');
        const nvao = roleWithParticipations.participations.filter((p: any) => p.status === 'nvou');

        const vaoNames = vao.map((p: any) => p.participant.user?.pushName || 'Anon').join(', ');
        const nvaoNames = nvao.map((p: any) => p.participant.user?.pushName || 'Anon').join(', ');

        const icon = status === 'vou' ? '✅' : '❌';
        const actionText = status === 'vou' ? 'confirmou presença' : 'recusou';
        
        let replyText = `${icon} *${msg.pushName}* ${actionText} no rolê *"${latestRole.title}"*!\n\n`;
        replyText += `✅ *Vão (${vao.length}):* ${vaoNames || 'Ninguém'}\n`;
        replyText += `❌ *Não vão (${nvao.length}):* ${nvaoNames || 'Todo mundo'}\n\n`;
        replyText += `Para atualizar sua presença, digite *.vou* ou *.nvou*!`;

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

        const currentRoles = await (prisma as any).roleEvent.findMany({
          where: { groupId: group.id, active: true },
          include: { 
            participations: { 
              include: { participant: { include: { user: true } } } 
            } 
          },
          orderBy: { createdAt: 'desc' },
          take: 3
        });

        if (currentRoles.length === 0) {
          await whatsapp.sendMessage(msg.remoteJid, "📭 *NENHUM ROLÊ MARCADO.* Que tristeza, bando de desocupados!");
          return true;
        }

        let listText = `🍻 *PRÓXIMOS ROLÊS DA TROPA* 🍻\n\n`;
        for (const role of currentRoles) {
          const vao = role.participations.filter((p: any) => p.status === 'vou');
          const nvao = role.participations.filter((p: any) => p.status === 'nvou');

          listText += `📌 *${role.title}*\n`;
          if (role.description) listText += `📝 ${role.description}\n`;
          listText += `✅ *Vão (${vao.length}):* ${vao.map((p: any) => p.participant.user?.pushName || 'Anon').join(', ') || 'Ninguém'}\n`;
          listText += `❌ *Não vão (${nvao.length}):* ${nvao.map((p: any) => p.participant.user?.pushName || 'Anon').join(', ') || 'Todo mundo'}\n\n`;
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
