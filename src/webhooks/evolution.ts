import { processMessage } from '../services/commandRouter';
import { WhatsAppService } from '../services/whatsapp';

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
    msgContent.imageMessage?.caption || 
    msgContent.videoMessage?.caption || 
    '';

  // --- FILTRO DE COMANDO ---
  // Só processamos e logamos se a mensagem começar com o ponto (.)
  if (!textContent.trim().startsWith('.')) return;

  const remoteJid = message.key.remoteJid;
  const participant = message.key.participant || remoteJid;
  const senderName = message.pushName || 'Usuário';

  // --- OMNI-SCANNER v3 ---
  const context = findField(message, 'contextInfo');
  const quotedParticipant = context?.participant || context?.quotedMessage?.key?.participant;
  const mentionedJid = context?.mentionedJid || [];
  const quotedId = context?.stanzaId; // ID Real da mensagem citada

  // LOG SÓ PARA COMANDOS AGORA
  console.log(`[COMANDO RECEBIDO] ${senderName}: ${textContent} (QuotedID: ${quotedId})`);

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

  for (let p of participants) {
    // Se o participante for um objeto (como no seu log), pegamos o phoneNumber ou o id
    let jid = typeof p === 'object' ? (p.phoneNumber || p.id) : p;
    
    if (typeof jid !== 'string') continue;

    const number = jid.split('@')[0];
    
    const welcomeMsg = `👋 Bem-vindo ao Rolezeiros RJ 🍻 @${number}

Pra todo mundo se conhecer melhor e deixar o grupo mais organizado, mandem a apresentação nesse modelo:

📸 Foto:
•Nome:
•Idade:
•Onde mora:
•Estado civil:
•PV ON ou OFF:
•Sexualidade:

⚠️ Fiquem atentos às regras do grupo e ótimos rolês!`;

    console.log(`[BOAS-VINDAS] Enviando para ${number} no grupo ${groupJid}`);
    
    await whatsapp.sendMessage(groupJid, welcomeMsg, [jid]);
  }
}
