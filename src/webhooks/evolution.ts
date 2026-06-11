import { processMessage } from '../services/commandRouter';
import { WhatsAppService } from '../services/whatsapp';
import { prisma } from '../services/database';

const whatsapp = new WhatsAppService();

// Função auxiliar para achar o JID em qualquer lugar da mensagem (OMNI-SCANNER)
const findField = (obj: any, fieldName: string): any => {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[fieldName]) return obj[fieldName];
  for (const key in obj) {
    const res = findField(obj[key], fieldName);
    if (res) return res;
  }
  return null;
};

export const handleWebhook = async (data: any) => {
  const event = data.event?.toLowerCase();
  
  // 1. Lógica de Mensagens (Comandos)
  if (event === 'messages.upsert') {
    // Handle Evolution API v2 (array) or v1 (object)
    let message = data.data;
    if (Array.isArray(message)) {
      message = message[0];
    }

    if (!message || !message.key || message.key.fromMe) return;
    return handleMessageUpsert(message);
  }

  // 2. Lógica de Entrada/Saída de Grupos (Suporte a group-participants.update ou group_participants_update)
  if (event === 'group-participants.update' || event === 'group_participants_update') {
    let groupData = data.data;
    if (Array.isArray(groupData)) {
      groupData = groupData[0];
    }
    console.log(`[ROBOZAP] Processando alteração de participantes: ${groupData?.action}`);
    return handleGroupUpdate(groupData);
  }

  const ignoredEvents = new Set([
    'send.message',
    'contacts.update',
    'chats.update',
    'presence.update',
    'messages.update'
  ]);
  if (data.event && !ignoredEvents.has(data.event)) {
    console.log(`[ROBOZAP] Evento ignorado ou desconhecido: ${data.event}`);
  }
};

async function handleMessageUpsert(message: any) {
  const msgContent = message.message || {};
  const textContent = 
    msgContent.conversation || 
    msgContent.extendedTextMessage?.text || 
    findField(msgContent, 'caption') || 
    '';

  const remoteJid = message.key.remoteJid;
  const participant = message.sender || message.key.participant || remoteJid;
  const senderName = message.pushName || 'Usuário';

  // --- OMNI-SCANNER v3 ---
  const context = findField(message, 'contextInfo');
  const quotedParticipant = context?.participant || context?.quotedMessage?.key?.participant;
  const mentionedJid = context?.mentionedJid || [];
  const quotedId = context?.stanzaId; // ID Real da mensagem citada

  // LOG SÓ PARA COMANDOS AGORA
  if (textContent.trim().startsWith('.')) {
    console.log(`[COMANDO RECEBIDO] ${senderName}: ${textContent} (QuotedID: ${quotedId})`);
  }

  await processMessage({
    id: message.key.id,
    remoteJid,
    participant,
    pushName: senderName,
    text: textContent,
    quoted: context?.quotedMessage,
    quotedId: quotedId,
    quotedParticipant: quotedParticipant, 
    mentionedJid: mentionedJid,
    messageType: Object.keys(msgContent)[0],
    raw: message
  });
}

async function handleGroupUpdate(data: any) {
  // Apenas quando alguém entra (action: 'add' ou 'ADD')
  const action = data.action?.toLowerCase();
  if (action !== 'add') return;

  const groupJid = data.remoteJid || data.jid || data.id;
  const participants = data.participants || []; // Array de JIDs ou Objetos

  if (!groupJid) {
    console.error('[BOAS-VINDAS] Erro: JID do grupo não encontrado no payload', data);
    return;
  }

  // Busca configuração do grupo no BD
  let welcomeConfig: any = null;
  let groupName: string | null = null;
  try {
    const group = await prisma.group.findUnique({
      where: { jid: groupJid }
    });
    if (group) {
      groupName = group.name;
      if (!groupName) {
        try {
          const metadata = await whatsapp.getGroupMetadata(groupJid);
          if (metadata) {
            groupName = metadata.subject || (metadata as any).subjectName || (metadata as any).name || null;
            if (groupName) {
              await prisma.group.update({
                where: { id: group.id },
                data: { name: groupName }
              });
            }
          }
        } catch (apiErr) {
          console.warn('[BOAS-VINDAS] Erro ao obter nome do grupo via API:', apiErr);
        }
      }
      if (group.welcomeConfig) {
        welcomeConfig = typeof group.welcomeConfig === 'string' ? JSON.parse(group.welcomeConfig) : group.welcomeConfig;
      }
    }
  } catch (err) {
    console.error('[BOAS-VINDAS] Erro ao buscar grupo no banco de dados:', err);
  }

  // Se explicitamente desativado, interrompe
  if (welcomeConfig && welcomeConfig.active === false) {
    console.log(`[BOAS-VINDAS] Boas-vindas desativadas via painel para o grupo ${groupJid}`);
    return;
  }

  const jidsToWelcome: string[] = [];
  for (let p of participants) {
    let jid = typeof p === 'object' ? (p.phoneNumber || p.id) : p;
    if (typeof jid === 'string') {
      const resolved = await whatsapp.resolveJid(jid);
      jidsToWelcome.push(resolved);
    }
  }

  if (jidsToWelcome.length === 0) return;

  const mentionsText = jidsToWelcome.map(jid => `@${jid.split('@')[0]}`).join(', ');

  let welcomeMsg = '';

  // Se existe mensagem personalizada, usamos ela
  if (welcomeConfig && welcomeConfig.message) {
    let customText = welcomeConfig.message;

    // Substituir tags
    if (customText.includes('{mencoes}') || customText.includes('{mentions}')) {
      customText = customText.replace(/{mencoes}/g, mentionsText).replace(/{mentions}/g, mentionsText);
    } else {
      // Se não incluiu a tag de menções, anexa ao final para notificar os membros
      customText = `${customText}\n\n${mentionsText}`;
    }

    // Substituir tag do grupo
    const namePlaceholder = groupName || 'Grupo';
    customText = customText.replace(/{grupo}/g, namePlaceholder);

    welcomeMsg = customText;
  } else {
    // Mensagem padrão
    welcomeMsg = `👋 Bem-vindo ao ${groupName || 'Rolezeiros RJ 🍻'} ${mentionsText}

Pra todo mundo se conhecer melhor e deixar o grupo mais organizado, mandem a apresentação nesse modelo:

📸 Foto:
•Nome:
•Idade:
•Onde mora:
•Estado civil:
•PV ON ou OFF:
•Sexualidade:

⚠️ Fiquem atentos às regras do grupo e ótimos rolês!`;
  }

  console.log(`[BOAS-VINDAS] Enviando para ${jidsToWelcome.length} participantes no grupo ${groupJid}`);
  
  await whatsapp.sendMessage(groupJid, welcomeMsg, jidsToWelcome);
}
