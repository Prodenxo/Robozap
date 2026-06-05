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

        const participants = await prisma.groupParticipant.findMany({
          where: { group: { jid: msg.remoteJid } },
          select: { userJid: true, roleCode: true }
        });

        const debugInfo = {
          msg: {
            remoteJid: msg.remoteJid,
            participant: msg.participant,
            quotedParticipant: msg.quotedParticipant,
            mentionedJid: msg.mentionedJid
          },
          lidMap,
          participants
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
      const menuText = `🌟 *ROBOZAP - Menu de Mandamentos* 🌟

🔥 *DE CRIA (IA)*
🤖 *.filhote* [pergunta] - Troca ideia com o brabo.
🧐 *.resumir* - Pega a visão da conversa.

🖼️ *MÍDIA (BRABA)*
🖼️ *.fig* - Faz figurinha na hora (mande ou responda foto).
🎵 *.tocar* [nome] - Baixa a música do YouTube.
📻 *.radio* - Pega o link da playlist.

👑 *ADMIN (DONO DO MORRO)*
👑 *.promover* - Dá cargo de admin (responda alguém).
🧹 *.banir* / *.remover* - Vala no infeliz do grupo.
📉 *.rebaixar* - Tira o cargo de quem tá folgado.
⚠️ *.adv* - Manda o papo reto com advertência.

🎲 *DIVERSÃO (ZEBRA)*
🎲 *.sortear* [número] - Sorteia a rapaziada do grupo.
🎯 *.chance* [pergunta] - Vê a chance de dar bom.
🎲 *.dado* / *.moeda* - Joga a sorte pro alto.

📱 *PERFIL (MEUS DADOS)*
👤 *.meusdados* - Vê teu status no grupo.
🗓️ *.vencimento* - Vê como tá tua assinatura.
📝 *.bio* [texto] - Muda teu recado pro robô.
🎂 *.niver* [DD/MM] - Marca teu aniversário.

📍 *SOCIAL*
📸 *.ig* [user] - Salva teu Instagram.
📍 *.local* [lugar] - Salva de onde tu é.
🎉 *.roles* - Lista os rolês marcados.

_Dúvidas? Mande um zap pro Mohammed._`;
      
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
