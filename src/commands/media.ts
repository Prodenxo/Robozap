import { WhatsAppService } from '../services/whatsapp';
import { MediaService } from '../services/media';
import { tryAcquireMusicLock, releaseMusicLock } from '../services/musicLock';
import { botTexts } from '../config/texts';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

function wrapText(text: string, maxCharsPerLine: number = 15): string {
  const words = text.split(' ');
  let currentLine = '';
  const lines: string[] = [];

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}

const { decryptMedia } = require('@open-wa/wa-decrypt');

async function decryptMediaLocally(targetMedia: any): Promise<string | null> {
  try {
    if (!targetMedia.mediaKey || (!targetMedia.url && !targetMedia.directPath)) {
      return null;
    }

    let type = 'document';
    const mime = targetMedia.mimetype || '';
    if (mime.startsWith('image/')) {
      type = mime.includes('webp') ? 'sticker' : 'image';
    } else if (mime.startsWith('video/')) {
      type = 'video';
    } else if (mime.startsWith('audio/')) {
      type = 'audio';
    }

    const decryptPayload = {
      type: type,
      clientUrl: targetMedia.url || (targetMedia.directPath ? `https://mmg.whatsapp.net${targetMedia.directPath}` : ''),
      mediaKey: targetMedia.mediaKey,
      mimetype: targetMedia.mimetype,
      size: targetMedia.fileLength || targetMedia.size || 0,
      filehash: targetMedia.fileSha256 || targetMedia.filehash || targetMedia.fileEncSha256
    };

    console.log(`[DECRYPT] Tentando descriptografar mídia localmente. Mimetype: ${decryptPayload.mimetype}, Type: ${decryptPayload.type}`);
    const buffer = await decryptMedia(decryptPayload);
    if (buffer && buffer.length > 0) {
      console.log(`[DECRYPT] Sucesso na descriptografia local! Tamanho: ${buffer.length}`);
      return buffer.toString('base64');
    }
  } catch (err) {
    console.warn('[DECRYPT] Falha na descriptografia local, caindo para fallback:', err instanceof Error ? err.message : String(err));
  }
  return null;
}

const whatsapp = new WhatsAppService();
const media = new MediaService();

export const handleMediaCommands = async (command: string, args: string[], msg: any) => {
  switch (command) {
    case 'fig':
    case 'sticker':
      let stickerText = args.join(' ').trim();
      
      if (!stickerText && msg.quoted) {
        stickerText = msg.quoted.conversation || 
                      msg.quoted.extendedTextMessage?.text || 
                      '';
      }

      if (stickerText) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          const wrappedText = wrapText(stickerText, 15);
          const backgroundHex = '121b22';
          const textHex = 'ffffff';
          const font = 'montserrat';
          const placeholderUrl = `https://placehold.co/512x512/${backgroundHex}/${textHex}/png?text=${encodeURIComponent(wrappedText)}&font=${font}`;

          console.log(`[MEDIA] Gerando figurinha de texto com a URL: ${placeholderUrl}`);
          
          const response = await axios.get(placeholderUrl, { responseType: 'arraybuffer' });
          const base64 = Buffer.from(response.data, 'binary').toString('base64');
          const dataUri = `data:image/png;base64,${base64}`;

          await whatsapp.sendSticker(msg.remoteJid, dataUri);
        } catch (error) {
          console.error('[MEDIA] Text Sticker Error:', error);
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorGeneric);
        }
        return true;
      }

      const msgContent = msg.raw?.message || {};
      const quotedContent = msg.quoted || {};

      console.log(`[MEDIA] msgContent keys: ${Object.keys(msgContent)}`);
      console.log(`[MEDIA] quotedContent keys: ${Object.keys(quotedContent)}`);

      // Helper recursivo para encontrar qualquer mídia estruturada do WhatsApp (incluindo visualização única)
      const findMedia = (m: any): any => {
          if (!m || typeof m !== 'object') return null;
          if ((m.url || m.directPath) && m.mediaKey) return m;
          for (const key in m) {
              const res = findMedia(m[key]);
              if (res) return res;
          }
          return null;
      };

      const mediaContent = findMedia(msgContent);
      const quotedMediaContent = findMedia(quotedContent);
      
      const targetMedia = quotedMediaContent || mediaContent;
      
      if (targetMedia) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          // Tenta descriptografar localmente primeiro (funciona para view-once!)
          let base64 = await decryptMediaLocally(targetMedia);

          if (!base64) {
            const isQuoted = !!quotedMediaContent;
            const targetMessageId = isQuoted ? msg.quotedId : msg.id;
            if (!targetMessageId) throw new Error('No message ID found for media');

            const key = {
                id: targetMessageId
            };

            console.log(`[MEDIA] Descriptografia local falhou, buscando da API. Target ID: ${targetMessageId}`);
            base64 = await whatsapp.getBase64FromMessage(key);
          }

          if (base64) {
            await whatsapp.sendSticker(msg.remoteJid, base64);
          } else {
            throw new Error('Failed to fetch base64 from message (Message not found)');
          }
        } catch (error: any) {
          console.error('[MEDIA] Sticker Error:', error);
          const errorStr = (error?.response?.data ? JSON.stringify(error.response.data) : '') + (error?.message || '');
          if (errorStr.includes('Message not found') || errorStr.includes('not found')) {
            await whatsapp.sendMessage(
              msg.remoteJid,
              '⚠️ *Mensagem não encontrada na Evolution API.* Para fazer figurinhas citando mensagens antigas ou de visualização única, a Evolution API precisa estar configurada com a variável `STORE_MESSAGES=true`.'
            );
          } else {
            await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorGeneric);
          }
        }
      } else {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorNoImage);
      }
      return true;

    case 'musica':
    case 'tocar':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaNoText);
        return true;
      }

      if (!tryAcquireMusicLock(msg.remoteJid)) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaBusy);
        return true;
      }

      const musicQuery = args.join(' ');
      let tempPath = '';

      try {
        await whatsapp.sendMessage(
          msg.remoteJid,
          botTexts.media.musicaSearch.replace('$query', musicQuery)
        );

        let url = musicQuery;
        const isYouTubeUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//.test(musicQuery);
        if (!isYouTubeUrl) {
          url = await media.searchYouTube(musicQuery) || '';
        }

        if (!url) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorNotFound);
          return true;
        }

        tempPath = path.join(process.cwd(), `temp_${Date.now()}.mp3`);
        const downloadTimeoutMs = Number(process.env.MUSIC_DOWNLOAD_TIMEOUT_MS) || 180000;

        await Promise.race([
          media.downloadMusic(url, tempPath),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('Timeout no download da música')),
              downloadTimeoutMs
            );
          })
        ]);

        if (!fs.existsSync(tempPath) || fs.statSync(tempPath).size === 0) {
          throw new Error('Arquivo de áudio vazio');
        }

        const sendRes = await whatsapp.sendMedia(msg.remoteJid, tempPath, 'audio', msg.id);
        const sentMsgId = sendRes?.key?.id || sendRes?.message?.key?.id || sendRes?.id;
        if (sentMsgId) {
          console.log(`[MEDIA] Áudio enviado com sucesso (ID: ${sentMsgId}). Reagindo com 🕺...`);
          await whatsapp.sendReaction(msg.remoteJid, sentMsgId, '🕺', true);
        } else {
          console.warn('[MEDIA] Áudio enviado, mas o ID da mensagem não pôde ser recuperado para a reação.');
        }
      } catch (error: unknown) {
        console.error('Music Error:', error);
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('youtube.login')) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorYoutubeLogin);
        } else if (message.includes('no_session_tokens')) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorNoSession);
        } else if (message.includes('youtube.api_error')) {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorYoutubeApi);
        } else {
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.musicaErrorGeneric);
        }
      } finally {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        releaseMusicLock(msg.remoteJid);
      }
      return true;

    case 'ig':
    case 'igdl':
    case 'instadl':
    case 'fb':
    case 'fbdl':
    case 'tiktok':
    case 'tkdl':
    case 'yt':
    case 'ytdl':
      if (args.length === 0) {
        await whatsapp.sendMessage(msg.remoteJid, "❓ *CADÊ O LINK?* Manda o link do vídeo pra eu baixar.");
        return true;
      }
      const videoUrl = args[0];
      try {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.downloadStart);
        const tempVideoPath = path.join(__dirname, `../../temp_video_${Date.now()}.mp4`);
        await media.downloadVideo(videoUrl, tempVideoPath);
        await whatsapp.sendMedia(msg.remoteJid, tempVideoPath, 'video');
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      } catch (error) {
        console.error('Video Download Error:', error);
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.downloadErrorGeneric);
      }
      return true;

    default:
      return false;
  }
}
