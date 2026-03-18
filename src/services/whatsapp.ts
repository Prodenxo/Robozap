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
      await axios.post(`${this.baseUrl}/message/sendText/${this.instance}`, {
        number: remoteJid,
        text: text,
        linkPreview: false,
        mentions: mentions
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
      
      console.log(`[EVOLUTION RESOLVED] LID: ${participants[0]} -> Real: ${realNumber}`);
      return realNumber;
    } catch (error: any) {
      console.error(`[EVOLUTION ERROR] ${action}:`, error.response?.data || error.message);
      return participants[0];
    }
  }

  async sendSticker(remoteJid: string, stickerData: any) {
    try {
      // If it's a URL or base64 from a previous step, send as is.
      // Evolution API accepts URL or base64.
      const sticker = typeof stickerData === 'string' ? stickerData : (stickerData.message?.imageMessage?.url || stickerData);

      await axios.post(`${this.baseUrl}/message/sendSticker/${this.instance}`, {
        number: remoteJid,
        sticker: sticker
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending sticker:', error.response?.data || error.message);
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

  async sendMedia(remoteJid: string, mediaPath: string, type: 'audio' | 'video' | 'image') {
    try {
      const mediaBuffer = fs.readFileSync(mediaPath);
      const base64 = mediaBuffer.toString('base64');
      await axios.post(`${this.baseUrl}/message/sendMedia/${this.instance}`, {
        number: remoteJid,
        mediatype: type,
        mimetype: type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4'),
        caption: type === 'audio' ? '' : 'Enviado por RoboZap',
        media: base64,
        fileName: path.basename(mediaPath)
      }, { headers: this.headers });
    } catch (error: any) {
      console.error('Error sending media:', error.response?.data || error.message);
    }
  }

  async getContact(number: string) {
    try {
      const response = await axios.post(`${this.baseUrl}/contact/getContact/${this.instance}`, {
        number: number
      }, { headers: this.headers });
      
      // Evolution API can return { pushName: '...' } or { contact: { pushName: '...' } }
      const contact = response.data?.contact || response.data;
      return contact;
    } catch (error) {
      return null;
    }
  }

  async resolveName(jid: string) {
    const number = jid.split('@')[0];
    
    // 1. Check Database
    try {
      const user = await (prisma as any).user.findUnique({ where: { jid } });
      if (user?.pushName && user.pushName !== 'Usuário') {
          return user.pushName;
      }
    } catch (e) {}

    // 2. Try API fallback
    const contact = await this.getContact(number);
    if (contact?.pushName) {
        // Save to DB for future
        try {
          await (prisma as any).user.upsert({
              where: { jid },
              update: { pushName: contact.pushName },
              create: { jid, pushName: contact.pushName }
          });
        } catch (e) {}
        return contact.pushName;
    }

    return number;
  }
}
