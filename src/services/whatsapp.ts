import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { prisma } from './database';
import { LidMapService } from './lidMap';
import { normalizePhoneKey, formatBrazilDisplayPhone, collectJidAliases } from './activity';

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
      const finalMentions: string[] = [];
      let updatedText = text;

      for (const m of mentions) {
        if (typeof m !== 'string') continue;
        
        let jid = m;
        if (!jid.includes('@')) {
          jid = `${jid}@s.whatsapp.net`;
        }

        let realJid = jid;
        let lid = jid;

        if (jid.endsWith('@lid')) {
          const resolved = LidMapService.get(jid);
          if (resolved) {
            realJid = resolved;
          }
        } else if (jid.endsWith('@s.whatsapp.net')) {
          const resolvedLid = LidMapService.getLid(jid);
          if (resolvedLid) {
            lid = resolvedLid;
          }
        }

        // Sempre adiciona o JID real para garantir a entrega, e o LID para compatibilidade.
        finalMentions.push(realJid);
        if (lid !== realJid) {
          finalMentions.push(lid);
        }

        const realNum = realJid.split('@')[0];
        const lidNum = lid.split('@')[0];
        updatedText = updatedText.replace(new RegExp(`@${realNum}\\b`, 'g'), `@${lidNum}`);
      }

      const uniqueMentions = Array.from(new Set(finalMentions.filter(Boolean)));

      const payload: any = {
        number: remoteJid,
        text: updatedText,
        options: {
          linkPreview: false
        }
      };

      if (uniqueMentions.length > 0) {
        // Envia nos formatos alternativos/legados no nível da raiz para garantir compatibilidade entre versões da API
        payload.mentions = uniqueMentions;
        payload.mentioned = uniqueMentions;

        payload.options.mentions = {
          everyOne: false,
          mentioned: uniqueMentions
        };
      }

      console.log(`[WHATSAPP] POST /message/sendText: Payload: ${JSON.stringify(payload)}`);
      const response = await axios.post(`${this.baseUrl}/message/sendText/${this.instance}`, payload, { headers: this.headers });
      console.log(`[WHATSAPP] POST /message/sendText response status: ${response.status}`);
    } catch (error: any) {
      console.error('[WHATSAPP] Error sending message:', error.response?.data || error.message);
    }
  }

  // --- ADMIN ACTIONS (RETORNANDO O NÚMERO REAL) ---
  async groupUpdateParticipant(groupJid: string, action: 'add' | 'remove' | 'promote' | 'demote', participants: string[]) {
    try {
      const resolvedParticipants = participants.map(p => {
        if (action === 'add') {
          if (typeof p === 'string' && p.endsWith('@lid')) {
            const real = LidMapService.get(p);
            return real || p;
          }
          return p;
        } else {
          if (typeof p === 'string' && p.endsWith('@s.whatsapp.net')) {
            const lid = LidMapService.getLid(p);
            return lid || p;
          }
          return p;
        }
      });

      const response = await axios.post(`${this.baseUrl}/group/updateParticipant/${this.instance}`, {
        groupJid: groupJid,
        action: action,
        participants: resolvedParticipants
      }, { headers: this.headers });

      // O "Pulo do Gato": Pegar o phone_number que o WhatsApp resolveu
      const resData = response.data?.updateParticipants?.[0];
      const realNumber = resData?.content?.attrs?.phone_number || resData?.jid || participants[0];
      
      let realJid = realNumber;
      if (typeof realJid === 'string' && !realJid.includes('@')) {
          realJid = `${realJid}@s.whatsapp.net`;
      }

      // Se realJid for LID, tenta pegar do cache
      if (typeof realJid === 'string' && realJid.includes('@lid')) {
        const cachedReal = LidMapService.get(realJid);
        if (cachedReal) {
          realJid = cachedReal;
        }
      }
      
      console.log(`[EVOLUTION RESOLVED] LID: ${resolvedParticipants[0]} -> Real JID: ${realJid}`);
      
      if (typeof resolvedParticipants[0] === 'string' && resolvedParticipants[0].includes('@lid') && typeof realJid === 'string' && realJid.includes('@s.whatsapp.net')) {
        LidMapService.set(resolvedParticipants[0], realJid);
      }

      // Se for a ação de 'add', e o status for 403 (ou qualquer um diferente de 200/201), ou se o WhatsApp retornou um código de convite:
      const status = String(resData?.status || '');
      const inviteCode = resData?.content?.attrs?.code;
      if (action === 'add' && (status && status !== '200' && status !== '201' || inviteCode)) {
        if (inviteCode) {
          return `invite:${inviteCode}`;
        }
        const fallbackCode = await this.getGroupInviteCode(groupJid);
        if (fallbackCode) {
          return `invite:${fallbackCode}`;
        }
      }

      return realJid;
    } catch (error: any) {
      console.error(`[EVOLUTION ERROR] ${action}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async groupRemoveParticipants (
    groupJid: string,
    participants: string[]
  ): Promise<{ removed: number, failed: number }> {
    if (participants.length === 0) return { removed: 0, failed: 0 }

    const resolveForRemove = (jid: string): string => {
      if (jid.endsWith('@s.whatsapp.net')) {
        return LidMapService.getLid(jid) || jid
      }
      return jid
    }

    const resolved = Array.from(new Set(participants.map(resolveForRemove)))

    try {
      const response = await axios.post(
        `${this.baseUrl}/group/updateParticipant/${this.instance}`,
        {
          groupJid,
          action: 'remove',
          participants: resolved
        },
        { headers: this.headers }
      )

      const updates = response.data?.updateParticipants
      if (Array.isArray(updates) && updates.length > 0) {
        let removed = 0
        let failed = 0

        for (const item of updates) {
          const status = String(item?.status ?? '')
          if (status === '200' || status === '201') removed++
          else failed++
        }

        if (removed > 0) return { removed, failed }
      }

      return { removed: resolved.length, failed: 0 }
    } catch (bulkError: any) {
      console.error(
        '[WHATSAPP] Remoção em lote falhou, tentando um a um:',
        bulkError.response?.data || bulkError.message
      )

      let removed = 0
      let failed = 0

      for (const participant of resolved) {
        try {
          await axios.post(
            `${this.baseUrl}/group/updateParticipant/${this.instance}`,
            {
              groupJid,
              action: 'remove',
              participants: [participant]
            },
            { headers: this.headers }
          )
          removed++
        } catch (singleError: any) {
          failed++
          console.error(
            `[WHATSAPP] Falha ao remover ${participant}:`,
            singleError.response?.data || singleError.message
          )
        }
      }

      return { removed, failed }
    }
  }

  async getGroupInviteCode(groupJid: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.baseUrl}/group/inviteCode/${this.instance}?groupJid=${groupJid}`, {
        headers: this.headers
      });
      return response.data?.code || response.data?.inviteCode || response.data || null;
    } catch (error: any) {
      console.error('[WHATSAPP] Error fetching group invite code:', error.response?.data || error.message);
      return null;
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

  async getBase64FromMessage(key: any) {
    try {
      console.log(`[WHATSAPP] Fetching base64 for ID: ${key.id}, Remote: ${key.remoteJid}, fromMe: ${key.fromMe}, Participant: ${key.participant}`);
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

  async findMessageByKey (key: {
    remoteJid: string
    id: string
    fromMe?: boolean
    participant?: string
  }): Promise<any | null> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/findMessages/${this.instance}`,
        {
          where: {
            key: {
              remoteJid: key.remoteJid,
              id: key.id,
              ...(key.fromMe !== undefined ? { fromMe: key.fromMe } : {}),
              ...(key.participant ? { participant: key.participant } : {})
            }
          }
        },
        { headers: this.headers, timeout: 15000 }
      )

      const payload = response.data
      const records =
        payload?.messages?.records ||
        payload?.messages ||
        (Array.isArray(payload) ? payload : null)

      if (Array.isArray(records) && records.length > 0) {
        return records[0]
      }

      if (payload?.message || payload?.key) {
        return payload
      }

      return null
    } catch (error: any) {
      console.warn('[WHATSAPP] findMessages falhou:', error.response?.data || error.message)
      return null
    }
  }

  async getProfilePictureUrl(jid: string): Promise<string> {
    try {
      if (!jid || typeof jid !== 'string') return '';
      const number = jid.split('@')[0];
      const response = await axios.get(`${this.baseUrl}/chat/profilePicture/${this.instance}?number=${number}`, {
        headers: this.headers
      });
      return response.data?.profilePictureUrl || response.data?.url || '';
    } catch (error: any) {
      console.warn('[WHATSAPP] Error fetching profile picture:', error.response?.data || error.message);
      return '';
    }
  }

  private botJid: string | null = null;

  async getBotJid(): Promise<string> {
    if (this.botJid) return this.botJid;
    try {
      const response = await axios.get(`${this.baseUrl}/instance/connectionState/${this.instance}`, {
        headers: this.headers
      });
      const jid = response.data?.instance?.owner;
      if (jid) {
        this.botJid = jid;
        return jid;
      }
    } catch (e: any) {
      console.error('[WHATSAPP] Error fetching bot JID:', e.message);
    }
    return '';
  }

  async deleteMessage(remoteJid: string, messageId: string, fromMe: boolean = false, participantJid?: string) {
    try {
      await axios.delete(`${this.baseUrl}/chat/deleteMessageForEveryone/${this.instance}`, {
        data: {
          remoteJid,
          id: messageId,
          fromMe,
          ...(participantJid ? { participant: participantJid } : {})
        },
        headers: this.headers
      });
      console.log(`[WHATSAPP] Message ${messageId} deleted (fromMe: ${fromMe}, participant: ${participantJid})`);
    } catch (error: any) {
      console.error('[WHATSAPP] Error deleting message:', error.response?.data || error.message);
    }
  }

  async updateGroupSetting(groupJid: string, action: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') {
    try {
      await axios.post(`${this.baseUrl}/group/updateSetting/${this.instance}?groupJid=${groupJid}`, {
        action
      }, { headers: this.headers });
      console.log(`[WHATSAPP] Group ${groupJid} setting updated: ${action}`);
      return true;
    } catch (error: any) {
      console.error('[WHATSAPP] Error updating group setting:', error.response?.data || error.message);
      return false;
    }
  }

  async sendMedia(
    remoteJid: string,
    mediaInput: string | Buffer,
    type: 'audio' | 'video' | 'image',
    quotedMsgId?: string,
    caption: string = '',
    mentions: string[] = []
  ) {
    let base64 = '';
    let fileName = 'media';

    try {
      if (Buffer.isBuffer(mediaInput)) {
        base64 = mediaInput.toString('base64');
      } else if (typeof mediaInput === 'string') {
        if (mediaInput.includes(';base64,')) {
          base64 = mediaInput.split(';base64,')[1];
        } else if (fs.existsSync(mediaInput)) {
          base64 = fs.readFileSync(mediaInput).toString('base64');
          fileName = path.basename(mediaInput);
        } else {
          base64 = mediaInput;
        }
      }

      const mime = type === 'audio' ? 'audio/mpeg' : (type === 'image' ? 'image/jpeg' : 'video/mp4');
      const ext = type === 'audio' ? 'mp3' : (type === 'image' ? 'jpg' : 'mp4');
      const finalFileName = fileName.includes('.') ? fileName : `${fileName}.${ext}`;

      const payload: any = {
        number: remoteJid,
        mediatype: type,
        mimetype: mime,
        caption: caption || '',
        media: base64,
        fileName: finalFileName
      };

      if (quotedMsgId) {
        payload.quoted = {
          key: {
            id: quotedMsgId
          }
        };
      }

      if (mentions.length > 0) {
        const finalMentions: string[] = [];
        let updatedCaption = caption;

        for (const m of mentions) {
          if (typeof m !== 'string') continue;
          let jid = m;
          if (!jid.includes('@')) {
            jid = `${jid}@s.whatsapp.net`;
          }

          let realJid = jid;
          let lid = jid;

          if (jid.endsWith('@lid')) {
            const resolved = LidMapService.get(jid);
            if (resolved) {
              realJid = resolved;
            }
          } else if (jid.endsWith('@s.whatsapp.net')) {
            const resolvedLid = LidMapService.getLid(jid);
            if (resolvedLid) {
              lid = resolvedLid;
            }
          }

          finalMentions.push(realJid);
          if (lid !== realJid) {
            finalMentions.push(lid);
          }

          const realNum = realJid.split('@')[0];
          const lidNum = lid.split('@')[0];
          updatedCaption = updatedCaption.replace(new RegExp(`@${realNum}\\b`, 'g'), `@${lidNum}`);
        }

        const uniqueMentions = Array.from(new Set(finalMentions.filter(Boolean)));
        if (uniqueMentions.length > 0) {
          payload.mentions = uniqueMentions;
          payload.mentioned = uniqueMentions;
          payload.caption = updatedCaption;
          payload.options = {
            linkPreview: false,
            mentions: {
              everyOne: false,
              mentioned: uniqueMentions
            }
          };
        }
      }

      console.log(`[WHATSAPP] POST /message/sendMedia: Payload (without base64): ${JSON.stringify({ ...payload, media: payload.media ? '(base64 string)' : undefined })}`);
      const response = await axios.post(`${this.baseUrl}/message/sendMedia/${this.instance}`, payload, { headers: this.headers });
      console.log(`[WHATSAPP] POST /message/sendMedia response status: ${response.status}`);
      return response.data;
    } catch (error: any) {
      console.error('[WHATSAPP] Error sending media:', error.response?.data || error.message);
      throw new Error('Falha ao enviar mídia no WhatsApp');
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
      
      let groupName: string | null = null;
      try {
        const metadata = await this.getGroupMetadata(groupJid);
        if (metadata) {
          groupName = metadata.subject || (metadata as any).subjectName || (metadata as any).name || null;
        }
      } catch (err) {
        console.warn(`[SYNC WARNING] Failed to fetch group metadata:`, err);
      }

      const group = await (prisma as any).group.upsert({
        where: { jid: groupJid },
        update: groupName ? { name: groupName } : {},
        create: { jid: groupJid, name: groupName }
      });

      const syncedJids: string[] = [];

      for (const p of participants) {
          let jid = p.id || p.jid;
          if (jid) {
              // 1. Procurar JID real em todos os campos possíveis
              const fieldsToCheck = [
                p.jid, p.id, p.realJid, p.phoneNumber, p.phone_number,
                p.number, p.phone, p.participantPn, p.participantAlt, p.pn
              ];
              const realJidCandidate = fieldsToCheck.find(f => typeof f === 'string' && f.includes('@s.whatsapp.net'));
              
              if (realJidCandidate) {
                  const lidCandidate = fieldsToCheck.find(f => typeof f === 'string' && f.includes('@lid'));
                  if (lidCandidate) {
                      LidMapService.set(lidCandidate, realJidCandidate);
                  }
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
                      const num = typeof rawNum === 'string' ? rawNum.split('@')[0] : String(rawNum)
                      const candidateJid = num.includes('@')
                        ? num
                        : `${num}@s.whatsapp.net`
                      if (formatBrazilDisplayPhone(candidateJid)) {
                          jid = candidateJid.includes('@') ? candidateJid : `${candidateJid.split('@')[0]}@s.whatsapp.net`
                          const lidCandidate = fieldsToCheck.find(f => typeof f === 'string' && f.includes('@lid'))
                          if (lidCandidate) LidMapService.set(lidCandidate, jid)
                      } else if (jid.includes('@lid')) {
                          jid = await this.resolveJid(jid)
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
              const pAdmin = p.admin ?? p.role ?? p.roleCode;
              const isGroupAdmin =
                pAdmin === 'superadmin' ||
                pAdmin === 'admin' ||
                pAdmin === true ||
                p.isSuperAdmin === true ||
                p.isAdmin === true ||
                pAdmin === 1 ||
                pAdmin === 2 ||
                pAdmin === 3;

              if (isGroupAdmin) {
                  roleCode = pAdmin === 'superadmin' || pAdmin === 1 ? 1 : 3;
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

  async isParticipantAdmin (groupJid: string, userJid: string): Promise<boolean> {
    try {
      const participants = await this.syncGroupParticipants(groupJid)
      const resolved = await this.resolveParticipantJid(userJid, groupJid)
      const lidMap = LidMapService.getFullMap()
      const needles = new Set<string>()

      for (const alias of [
        ...collectJidAliases(resolved, lidMap),
        ...collectJidAliases(userJid, lidMap)
      ]) {
        needles.add(alias)
        needles.add(alias.split('@')[0])
      }

      const targetPhone = normalizePhoneKey(resolved.split('@')[0])

      for (const participant of participants) {
        const fields = [
          participant.id,
          participant.jid,
          participant.lid,
          participant.realJid,
          participant.phoneNumber,
          participant.phone_number,
          participant.number,
          participant.phone,
          participant.participantPn,
          participant.participantAlt,
          participant.pn
        ].filter(Boolean)

        const matches = fields.some((field) => {
          const value = String(field)
          if (needles.has(value)) return true

          const bare = value.split('@')[0]
          if (needles.has(bare)) return true

          if (value.includes('@')) {
            return normalizePhoneKey(bare) === targetPhone
          }

          return normalizePhoneKey(value) === targetPhone
        })

        if (!matches) continue

        const adminFlag =
          participant.admin ??
          participant.role ??
          participant.roleCode

        return (
          adminFlag === 'superadmin' ||
          adminFlag === 'admin' ||
          adminFlag === true ||
          participant.isSuperAdmin === true ||
          participant.isAdmin === true ||
          adminFlag === 1 ||
          adminFlag === 2 ||
          adminFlag === 3
        )
      }
    } catch (error) {
      console.warn('[WHATSAPP] isParticipantAdmin falhou:', error)
    }

    return false
  }

  async ensureGroupParticipant (
    groupJid: string,
    userJid: string,
    pushName?: string
  ): Promise<{ id: string, userJid: string, groupId: string }> {
    const group = await (prisma as any).group.findUnique({ where: { jid: groupJid } })
    if (!group) throw new Error(`Grupo não encontrado: ${groupJid}`)

    const resolvedJid = await this.resolveParticipantJid(userJid, groupJid)
    const lidMap = LidMapService.getFullMap()
    const aliasSet = new Set([
      ...collectJidAliases(resolvedJid, lidMap),
      ...collectJidAliases(userJid, lidMap)
    ])

    await (prisma as any).user.upsert({
      where: { jid: resolvedJid },
      update: { pushName: pushName || undefined },
      create: { jid: resolvedJid, pushName: pushName || 'Usuário' }
    })

    const matches = await (prisma as any).groupParticipant.findMany({
      where: { groupId: group.id, userJid: { in: Array.from(aliasSet) } }
    })

    let canonical = matches.find((p: { userJid: string }) =>
      p.userJid.includes('@s.whatsapp.net')
    ) || matches[0]

    if (!canonical) {
      canonical = await (prisma as any).groupParticipant.create({
        data: {
          groupId: group.id,
          userJid: resolvedJid,
          roleCode: 5
        }
      })
      return canonical
    }

    const duplicates = matches.filter((p: { id: string }) => p.id !== canonical.id)
    for (const dup of duplicates) {
      const parts = await (prisma as any).roleParticipation.findMany({
        where: { participantId: dup.id }
      })

      for (const part of parts) {
        try {
          await (prisma as any).roleParticipation.upsert({
            where: {
              roleId_participantId: {
                roleId: part.roleId,
                participantId: canonical.id
              }
            },
            update: { status: part.status },
            create: {
              roleId: part.roleId,
              participantId: canonical.id,
              status: part.status
            }
          })
          await (prisma as any).roleParticipation.delete({ where: { id: part.id } })
        } catch {
          // conflito de merge — ignora
        }
      }

      try {
        await (prisma as any).groupParticipant.delete({ where: { id: dup.id } })
      } catch {
        // participante duplicado com vínculos — mantém canonical
      }
    }

    return canonical
  }

  async resolveName(jid: string, groupJid?: string) {
    if (!jid || typeof jid !== 'string') return 'Usuário';
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

    const cached = LidMapService.get(jid);
    if (cached) {
        console.log(`[DEBUG] LID resolvido via cache local: ${jid} -> ${cached}`);
        return cached;
    }

    console.log(`[DEBUG] Tentando resolver LID: ${jid}`);
    try {
      // Passa o JID completo (incluindo o @lid) para que a Evolution API saiba de qual namespace buscar
      const contact = await this.getContact(jid);
      if (contact) {
          const fields = [contact.phoneNumber, contact.phone_number, contact.number, contact.jid, contact.id, contact.realJid];
          const realJid = fields.find(f => typeof f === 'string' && f.includes('@s.whatsapp.net'));
          if (realJid) {
              console.log(`[DEBUG] LID Resolvido com sucesso (realJid): ${jid} -> ${realJid}`);
              LidMapService.set(jid, realJid);
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
                  if (formatBrazilDisplayPhone(formattedJid)) {
                    console.log(`[DEBUG] LID Resolvido com sucesso (rawNum): ${jid} -> ${formattedJid}`);
                    LidMapService.set(jid, formattedJid);
                    return formattedJid;
                  }
              }
          }
      }
    } catch (e) {
      console.error('[RESOLVE JID ERROR]:', e);
    }

    return jid;
  }

  async resolveParticipantJid (userJid: string, groupJid: string): Promise<string> {
    let resolved = await this.resolveJid(userJid)

    if (formatBrazilDisplayPhone(resolved)) {
      return resolved.includes('@') ? resolved : `${resolved}@s.whatsapp.net`
    }

    const participants = await this.syncGroupParticipants(groupJid)
    const needles = new Set(
      [userJid, resolved, userJid.split('@')[0], resolved.split('@')[0]].filter(Boolean)
    )

    for (const participant of participants) {
      const fields = [
        participant.id,
        participant.jid,
        participant.lid,
        participant.phoneNumber,
        participant.phone_number,
        participant.number,
        participant.phone,
        participant.participantPn,
        participant.participantAlt,
        participant.pn
      ].filter(Boolean).map(String)

      const matches = fields.some((field) => needles.has(field))
      if (!matches) continue

      const realJid = fields.find(
        (field) => field.includes('@s.whatsapp.net') && formatBrazilDisplayPhone(field)
      )

      if (realJid) {
        const lid = fields.find((field) => field.includes('@lid'))
        if (lid) LidMapService.set(lid, realJid)
        if (userJid.includes('@lid')) LidMapService.set(userJid, realJid)
        return realJid
      }

      const rawNum = fields.find((field) => {
        if (!field || field.includes('@')) return false
        return formatBrazilDisplayPhone(field)
      })

      if (rawNum) {
        let digits = String(rawNum).replace(/\D/g, '')
        if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
          digits = `55${digits}`
        }
        const formattedJid = `${digits}@s.whatsapp.net`
        if (formatBrazilDisplayPhone(formattedJid)) {
          const lid = fields.find((field) => field.includes('@lid'))
          if (lid) LidMapService.set(lid, formattedJid)
          if (userJid.includes('@lid')) LidMapService.set(userJid, formattedJid)
          return formattedJid
        }
      }
    }

    return resolved
  }

  async resolveDisplayPhone (userJid: string, groupJid?: string): Promise<string | null> {
    const resolved = groupJid
      ? await this.resolveParticipantJid(userJid, groupJid)
      : await this.resolveJid(userJid)

    return formatBrazilDisplayPhone(resolved)
  }

  async getGroupMetadata(groupJid: string): Promise<{ subject?: string } | null> {
    try {
      let response;
      try {
        response = await axios.get(`${this.baseUrl}/group/findGroupInfos/${this.instance}?groupJid=${groupJid}`, {
          headers: this.headers
        });
      } catch (e) {
        response = await axios.get(`${this.baseUrl}/group/findGroup/${this.instance}?groupJid=${groupJid}`, {
          headers: this.headers
        });
      }
      return response.data;
    } catch (error: any) {
      console.error('[WHATSAPP] Error fetching group metadata:', error.response?.data || error.message);
      return null;
    }
  }
}
