import { WhatsAppService } from '../services/whatsapp';
import { botTexts } from '../config/texts';
import { prisma } from '../services/database';

const whatsapp = new WhatsAppService();

export const handleGeneralCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'debug': {
      try {
        const fs = require('fs');
        const path = require('path');
        const MAP_FILE = path.join(process.cwd(), 'lid_map.json');
        let lidMap = {};
        if (fs.existsSync(MAP_FILE)) {
          lidMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
        }

        const group = await prisma.group.findUnique({
          where: { jid: msg.remoteJid }
        });

        const participants = await prisma.groupParticipant.findMany({
          where: { group: { jid: msg.remoteJid } },
          select: { userJid: true, roleCode: true }
        });

        let recentLogs: any[] = [];
        if (group) {
          recentLogs = await prisma.messageLog.findMany({
            where: {
              groupId: group.id
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
              userJid: true,
              messageId: true,
              content: true,
              type: true,
              createdAt: true
            }
          });
        }

        const debugInfo = {
          msg: {
            remoteJid: msg.remoteJid,
            participant: msg.participant,
            quotedParticipant: msg.quotedParticipant,
            mentionedJid: msg.mentionedJid
          },
          lidMap,
          participants,
          recentLogs
        };

        await whatsapp.sendMessage(msg.remoteJid, `⚙️ *DEBUG INFO* ⚙️\n\`\`\`json\n${JSON.stringify(debugInfo, null, 2)}\n\`\`\``);
      } catch (err: any) {
        await whatsapp.sendMessage(msg.remoteJid, `❌ Erro no debug: ${err.message}`);
      }
      return true;
    }

    case 'menu':
    case 'ajuda':
    case 'comandos':
    case 'filhote.ajuda':
      const menuText = `🌟 *ROBOZAP - MENU DE COMANDOS* 🌟

📋 *.menu* / *.ajuda* / *.comandos* — Este menu.

🔥 *IA*
🤖 *.filhote* [pergunta] — Conversa com a IA.
🧐 *.resumir* / *.resumo* — Resume as últimas mensagens.

🖼️ *MÍDIA & FIGURINHAS*
🖼️ *.fig* / *.sticker* — Figurinha (imagem, gif ou vídeo citado).
✍️ *.brat* [texto] — Sticker de texto clássico.
🎬 *.bratv* [texto] — Sticker de texto animado.
🎨 *.emojimix* / *.mix* [👻+👀] — Combina dois emojis.
💬 *.qc* / *.quote* [texto] — Sticker estilo citação.
🎵 *.tocar* / *.musica* [nome] — Áudio do YouTube.
🎥 *.igdl* / *.ig* / *.instadl* [link] — Vídeo Instagram.
🎥 *.fbdl* / *.fb* [link] — Vídeo Facebook.
🎥 *.tkdl* / *.tiktok* [link] — Vídeo TikTok.
🎥 *.ytdl* / *.yt* [link] — Vídeo YouTube.

👑 *ADMINISTRAÇÃO*
👑 *.admins* / *.adms* — Marca administradores.
📢 *.marcar* / *.todos* [msg] — Replica foto/texto marcando todos (ou responda uma msg).
⚡ *.promover* — Promove admin (marque ou responda).
📉 *.rebaixar* / *.demitir* — Remove cargo de admin.
🧹 *.banir* / *.remover* / *.ban* — Remove do grupo.
🔓 *.desban* / *.desbanir* — Desbane usuário.
⚠️ *.adv* / *.alertar* / *.avisar* — Advertência (2 = ban).
🗑️ *.apagar* / *.limpar* — Apaga msg (responda ela).
🔓 *.abrir* / *.fechar* — Abre/fecha grupo (só admins falam).
🔒 *.modoadmin* [ligar/desligar] — Só admins usam comandos.
📊 *.ativos* — Top 10 mais ativos (7 dias).
👻 *.inativos* / *.desocupados* / *.passivos* — Lista inativos (< 20 msgs).
🧹 *.rm i* — Remove inativos (responda a msg do *.inativos*).
📊 *.mensagens* — Conta msgs de alguém (7 dias).
🗑️ *.zerar* / *.limpar.logs* — Zera contagem de msgs do grupo.
⏰ *.alertaprog* [30m/2h] [msg] — Alerta programado marcando todos.
👋 *.boasvindas* — Configura msg de entrada no grupo.

🎲 *DIVERSÃO*
🎲 *.sortear* / *.sorteio* [qtd] — Sorteia membros.
🎯 *.chance* [pergunta] — Chance % + sorteado.
🔍 *.detector* — Verdade ou mentira.
💘 *.casal* — Sorteia casal (ou marque 2).
🍻 *.bafometro* / *.viadometro* / *.gadometro* — Medidor %.
🎲 *.dado* [lados] / *.d6* / *.d20* — Rola dado.
🪙 *.moeda* — Cara ou coroa.

📱 *PERFIL*
👤 *.meusdados* / *.perfil* / *.dados* — Seu perfil no grupo.
🗓️ *.vencimento* — Validade da assinatura do bot.
📝 *.bio* [texto] — Sua bio no robô.
🎂 *.niver* [DD/MM] — Data de aniversário.
📸 *.meuig* / *.ig* [user] — Cadastra Instagram.
📍 *.local* [cidade] — Cadastra localização.
📸 *.iglist* — Lista Instagrams do grupo.
📍 *.locallist* — Lista locais do grupo.
🤫 *.ignoreme* [on/off] — Ignorar menções do bot.

📅 *ROLÊS & RESENHAS*
🍻 *.role.criar* / *.resenha.criar* [título] | [texto] — Cria rolê (texto longo com enter funciona).
🎉 *.roles* / *.resenha* [código] — Lista rolês.
✅ *.vou* / *.role.vou* [código] — Confirma presença.
❌ *.nvou* / *.role.nvou* / *.vounao* — Cancela presença.
🏁 *.role.encerrar* — Encerra inscrições.
🚫 *.role.cancelar* / *.resenha.cancelar* — Cancela rolê.
📻 *.radio* / *.playlist* [link] — Playlist do grupo.

📋 *LISTAS / NICHOS*
✅ *.lista.entrar* / *.nicho.entrar* — Entra na lista.
❌ *.lista.sair* / *.nicho.sair* — Sai da lista.
_(Aliases: .lista.sim, .nicho.quero, .lista.nao, etc.)_

_Dúvidas? Fale com o Mohammed._`;
      
      await whatsapp.sendMessage(msg.remoteJid, menuText);
      return true;

    case 'teste':
      const randomReply = botTexts.general.testReplies[Math.floor(Math.random() * botTexts.general.testReplies.length)];
      await whatsapp.sendMessage(msg.remoteJid, randomReply);
      return true;

    default:
      return false;
  }
};
