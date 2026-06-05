import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { prisma } from './database';

dotenv.config();

const cleanValue = (val: string | undefined) => val?.replace(/['"]+/g, '').trim() || '';

export class WhatsAppService {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.baseUrl = cleanValue(process.env.EVOLUTION_API_URL);
    this.apiKey = cleanValue(process.env.EVOLUTION_API_KEY);
    this.instance = cleanValue(process.env.EVOLUTION_INSTANCE_NAME);
  }

  private get headers() {
    return { 'apikey': this.apiKey };
  }

  async sendMessage(remoteJid: string, text: string, mentions: string[] = []) {
    try {
      const normalizedMentions = mentions.map(m => {
        if (typeof m === 'string' && !m.includes('@')) {
          return `${m}@s.whatsapp.net`;
        }
        return m;
      });

      await axios.post(`${this.baseUrl}/message/sendText/${this.instance}`, {
        number: remoteJid,
        text: text,
        linkPreview: false,
        mentions: normalizedMentions
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending message:', error.response?.data || error.message);
    }
  }

  // --- ADMIN ACTIONS (RETORNANDO O NÚMERO REAL) ---
  async groupUpdateParticipant(groupJid: string, action: 'add' | 'remove' | 'promote' | 'demote', participants: string[]) {
    try {
      const response = await axios.post(`${this.baseUrl}/group/updateParticipant/${this.instance}`, {
        groupJid: groupJid,
        action: action,
        participants: participants
      }, { headers: this.headers });

      // O "Pulo do Gato": Pegar o phone_number que o WhatsApp resolveu
      const resData = response.data?.updateParticipants?.[0];
      const realNumber = resData?.content?.attrs?.phone_number || resData?.jid || participants[0];
      
      let realJid = realNumber;
      if (typeof realJid === 'string' && !realJid.includes('@')) {
          realJid = `${realJid}@s.whatsapp.net`;
      }
      
      console.log(`[EVOLUTION RESOLVED] LID: ${participants[0]} -> Real JID: ${realJid}`);
      return realJid;
    } catch (error: any) {
      console.error(`[EVOLUTION ERROR] ${action}:`, error.response?.data || error.message);
      return participants[0];
    }
  }

  async sendSticker(remoteJid: string, sticker: string | Buffer) {
    try {
      let stickerData = typeof sticker === 'string' ? sticker : sticker.toString('base64');
      
      // Limpeza se vier com prefixo data:image/...;base64,
      if (stickerData.includes(';base64,')) {
          stickerData = stickerData.split(';base64,')[1];
      }

      console.log(`[WHATSAPP] Sending sticker to ${remoteJid}. Length: ${stickerData.length}, Start: ${stickerData.substring(0, 20)}`);

      await axios.post(`${this.baseUrl}/message/sendSticker/${this.instance}`, {
        number: remoteJid,
        sticker: stickerData
      }, { 
          headers: this.headers,
          timeout: 60000 // 60 segundos para conversão webp
      });
    } catch (error: any) {
      console.error('[WHATSAPP] Error sending sticker:', error.response?.data || error.message);
    }
  }

  async getBase64FromMessage(key: { id: string, remoteJid: string, fromMe: boolean }) {
    try {
      console.log(`[WHATSAPP] Fetching base64 for ID: ${key.id}, Remote: ${key.remoteJid}, fromMe: ${key.fromMe}`);
      const response = await axios.post(`${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`, {
        message: {
          key: key
        }
      }, { headers: this.headers });
      
      console.log(`[WHATSAPP] API Response Status: ${response.status}`);
      return response.data?.base64 || response.data;
    } catch (error: any) {
      console.error('[WHATSAPP] Error fetching base64:', error.response?.data || error.message);
      return null;
    }
  }

  async deleteMessage(remoteJid: string, messageId: string) {
    try {
      // Em versões recentes da Evolution API v1, o método é DELETE
      await axios.delete(`${this.baseUrl}/chat/deleteMessage/${this.instance}`, {
        data: {
          number: remoteJid,
          messageId: messageId,
          all: true
        },
        headers: this.headers
      });
    } catch (error: any) {
      console.error('Error deleting message:', error.response?.data || error.message);
    }
  }

  async sendMedia(remoteJid: string, mediaPath: string, type: 'audio' | 'video' | 'image', quotedMsgId?: string) {
    const mediaBuffer = fs.readFileSync(mediaPath);
    const base64 = mediaBuffer.toString('base64');

    try {
      const payload: any = {
        number: remoteJid,
        mediatype: type,
        mimetype: type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4'),
        caption: '',
        media: base64,
        fileName: path.basename(mediaPath)
      };

      if (quotedMsgId) {
        payload.quoted = {
          key: {
            id: quotedMsgId
          }
        };
      }

      const response = await axios.post(`${this.baseUrl}/message/sendMedia/${this.instance}`, payload, { headers: this.headers });
      return response.data;
    } catch (error: any) {
      console.error('Error sending media:', error.response?.data || error.message);
      throw new Error('Falha ao enviar áudio no WhatsApp');
    }
  }

  async sendReaction(remoteJid: string, messageId: string, emoji: string, fromMe: boolean = true) {
    try {
      await axios.post(`${this.baseUrl}/message/sendReaction/${this.instance}`, {
        key: {
          remoteJid: remoteJid,
          fromMe: fromMe,
          id: messageId
        },
        reaction: emoji
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending reaction:', error.response?.data || error.message);
    }
  }

  async getContact(number: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/contact/getContact/${this.instance}`, {
        number: number
      }, { headers: this.headers });
      
      const contact = response.data?.contact || response.data;
      return contact;
    } catch (error) {
      return null;
    }
  }

  async syncGroupParticipants(groupJid: string) {
    try {
      let response;
      try {
        response = await axios.get(`${this.baseUrl}/group/participants/${this.instance}?groupJid=${groupJid}`, {
          headers: this.headers
        });
      } catch (e1: any) {
        console.warn(`[SYNC WARNING] /group/participants failed (${e1.message}), trying legacy /group/getParticipants...`);
        response = await axios.get(`${this.baseUrl}/group/getParticipants/${this.instance}?groupJid=${groupJid}`, {
          headers: this.headers
        });
      }
      
      let participants = [];
      if (response && response.data) {
          if (Array.isArray(response.data)) {
              participants = response.data;
          } else if (Array.isArray(response.data.participants)) {
              participants = response.data.participants;
          } else if (Array.isArray(response.data.participantsData)) {
              participants = response.data.participantsData;
          } else if (typeof response.data === 'object') {
              // Tenta achar qualquer propriedade que seja array caso a estrutura mude
              for (const key in response.data) {
                  if (Array.isArray(response.data[key])) {
                      participants = response.data[key];
                      break;
                  }
              }
          }
      }
      
      console.log(`[SYNC DEBUG] Synced ${participants.length} participants for group ${groupJid}`);
      
      const group = await (prisma as any).group.upsert({
        where: { jid: groupJid },
        update: {},
        create: { jid: groupJid }
      });

      const syncedJids: string[] = [];

      for (const p of participants) {
          let jid = p.id || p.jid;
          if (jid) {
              // 1. Procurar JID real em todos os campos possíveis
              const fieldsToCheck = [p.jid, p.id, p.realJid, p.phoneNumber, p.phone_number, p.number, p.phone];
              const realJidCandidate = fieldsToCheck.find(f => typeof f === 'string' && f.includes('@s.whatsapp.net'));
              
              if (realJidCandidate) {
                  jid = realJidCandidate;
              } else {
                  // 2. Se for LID mas achou um número sem sufixo que não seja o próprio ID do LID
                  const rawNum = fieldsToCheck.find(f => {
                      if (!f) return false;
                      const s = String(f);
                      if (s.includes('@lid') || s.includes('@g.us')) return false;
                      if (jid.includes('@lid') && jid.startsWith(s)) return false;
                      return true;
                  });

                  if (rawNum) {
                      const num = typeof rawNum === 'string' ? rawNum.split('@')[0] : String(rawNum);
                      if (/^\d{8,15}$/.test(num)) {
                          jid = `${num}@s.whatsapp.net`;
                      } else if (jid.includes('@lid')) {
                          jid = await this.resolveJid(jid);
                      }
                  } else if (jid.includes('@lid')) {
                      jid = await this.resolveJid(jid);
                  }
              }

              syncedJids.push(jid);

              const name = p.pushName || p.name || p.verifiedName || 'Usuário';
              await (prisma as any).user.upsert({
                  where: { jid },
                  update: { pushName: name },
                  create: { jid, pushName: name }
              });

              let roleCode = 5;
              const pAdmin = p.admin || p.role || p.roleCode;
              if (pAdmin === 'superadmin' || pAdmin === 'admin' || p.isSuperAdmin || p.isAdmin) {
                  roleCode = pAdmin === 'superadmin' ? 1 : 3;
              }

              console.log(`[SYNC DEBUG] User ${jid} mapped admin role: ${pAdmin} -> roleCode: ${roleCode}`);

              await (prisma as any).groupParticipant.upsert({
                  where: { groupId_userJid: { groupId: group.id, userJid: jid } },
                  update: { roleCode },
                  create: {
                      group: { connect: { id: group.id } },
                      user: { connect: { jid } },
                      roleCode
                  }
              });
          }
      }

      // Remover participantes do grupo no banco que não foram listados neste sincronismo (evita duplicatas e limpa quem saiu)
      if (syncedJids.length > 0) {
          await (prisma as any).groupParticipant.deleteMany({
              where: {
                  groupId: group.id,
                  userJid: { notIn: syncedJids }
              }
          });
      }
      return participants;
    } catch (error) {
      console.error('[SYNC ERROR]:', error);
      return [];
    }
  }

  async resolveName(jid: string, groupJid?: string) {
    const number = jid.split('@')[0];
    
    // 1. Check Database
    try {
      const user = await (prisma as any).user.findUnique({ where: { jid } });
      if (user?.pushName && user.pushName !== 'Usuário' && !user.pushName.includes('@')) {
          return user.pushName;
      }
    } catch (e) {}

    // 2. Fallback: Sync Group if provided
    if (groupJid) {
        await this.syncGroupParticipants(groupJid);
        const user = await (prisma as any).user.findUnique({ where: { jid } });
        if (user?.pushName && user.pushName !== 'Usuário') return user.pushName;
    }

    // 3. Last resort API fallback
    const contact = await this.getContact(number);
    if (contact?.pushName) {
        await (prisma as any).user.upsert({
            where: { jid },
            update: { pushName: contact.pushName },
            create: { jid, pushName: contact.pushName }
        });
        return contact.pushName;
    }

    return number;
  }

  /**
   * Converte um LID (ID gigante) para um JID de número real se necessário
   */
  async resolveJid(jid: string): Promise<string> {
    if (!jid || !jid.includes('@lid')) return jid;

    console.log(`[DEBUG] Tentando resolver LID: ${jid}`);
    try {
      // Passa o JID completo (incluindo o @lid) para que a Evolution API saiba de qual namespace buscar
      const contact = await this.getContact(jid);
      if (contact) {
          const fields = [contact.phoneNumber, contact.phone_number, contact.number, contact.jid, contact.id, contact.realJid];
          const realJid = fields.find(f => typeof f === 'string' && f.includes('@s.whatsapp.net'));
          if (realJid) {
              console.log(`[DEBUG] LID Resolvido com sucesso (realJid): ${jid} -> ${realJid}`);
              return realJid;
          }
          
          const rawNum = fields.find(f => {
              if (!f) return false;
              const s = String(f);
              if (s.includes('@lid') || s.includes('@g.us')) return false;
              return true;
          });
          
          if (rawNum) {
              const num = typeof rawNum === 'string' ? rawNum.split('@')[0] : String(rawNum);
              if (/^\d{8,15}$/.test(num)) {
                  const formattedJid = `${num}@s.whatsapp.net`;
                  console.log(`[DEBUG] LID Resolvido com sucesso (rawNum): ${jid} -> ${formattedJid}`);
                  return formattedJid;
              }
          }
      }
    } catch (e) {
      console.error('[RESOLVE JID ERROR]:', e);
    }

    return jid;
  }
}
