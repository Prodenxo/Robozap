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
      const menuText = `🌟 *ROBOZAP - MENU DE MANDAMENTOS* 🌟

🔥 *DE CRIA (IA)*
🤖 *.filhote* [pergunta] - Troca ideia com o brabo.
🧐 *.resumir* - Pega a visão das últimas mensagens.

🖼️ *MÍDIA & FIGURINHAS*
🖼️ *.fig* - Faz figurinha de imagem, gif ou vídeo.
✍️ *.brat* [texto] - Cria sticker de texto clássico.
🎬 *.bratv* [texto] - Cria sticker de texto animado.
🎨 *.emojimix* / *.mix* [👻+👀] - Combina dois emojis.
💬 *.qc* / *.quote* [texto] - Cria sticker de citação de chat.
🎵 *.tocar* / *.musica* [nome] - Baixa áudio do YouTube.
🎥 *.igdl* / *.instadl* [link] - Baixa vídeo do Instagram.
🎥 *.fbdl* [link] - Baixa vídeo do Facebook.
🎥 *.tkdl* [link] - Baixa vídeo do TikTok.
🎥 *.ytdl* [link] - Baixa vídeo do YouTube.

👑 *ADMINISTRAÇÃO*
👑 *.admins* - Marca os administradores do grupo.
⚡ *.promover* - Dá cargo de admin (responda alguém).
📉 *.rebaixar* / *.demitir* - Tira o cargo de admin.
🧹 *.banir* / *.remover* - Bane um infeliz do grupo.
🔓 *.desban* - Desbane um usuário.
⚠️ *.adv* - Dá advertência a um integrante.
🗑️ *.apagar* - Apaga uma mensagem (responda a ela).
🔓 *.abrir* / *.fechar* - Controla quem pode mandar msg.
📊 *.ativos* / *.inativos* - Lista ranking de atividade.

🎲 *DIVERSÃO & JOGOS*
🎲 *.sortear* - Sorteia a rapaziada do grupo.
🎯 *.chance* [pergunta] - Vê a chance de dar bom.
🔍 *.detector* - Testa se o papo é verdade ou caô.
💘 *.casal* - Sorteia um casal aleatório do grupo.
🍻 *.bafometro* - Mede a cachaça do cidadão.
📏 *.viadometro* / *.gadometro* - Mede a porcentagem.
🎲 *.dado* / *.moeda* - Joga a sorte pro alto.
📖 *.versiculo* / *.biblia* - Manda uma palavra sagrada.
🍀 *.sortedodia* - Vê tua sorte de hoje.

📱 *PERFIL (MEUS DADOS)*
👤 *.meusdados* / *.perfil* - Vê teu status no grupo.
🗓️ *.vencimento* - Consulta a validade da assinatura.
📝 *.bio* [texto] - Muda tua biografia no robô.
🎂 *.niver* [DD/MM] - Define a data do teu aniversário.
🎈 *.nivers* - Vê os aniversariantes do grupo.
📸 *.meuig* [user] - Cadastra o teu Instagram.
📍 *.local* [lugar] - Cadastra tua cidade.
📸 *.iglist* / *.locallist* - Lista cadastros da tropa.
📻 *.radio* / *.playlist* - Playlist oficial da tropa.
🤫 *.meignore* - Faz o bot ignorar tuas mensagens.

📅 *ROLÊS & RESENHAS*
🍻 *.role.criar* [Nome] - Agenda um novo rolê.
🎉 *.roles* / *.resenha* - Mostra os rolês marcados.
✅ *.vou* / *.nvou* - Confirma ou cancela presença.
🏁 *.role.encerrar* - Fecha as inscrições do rolê.

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
