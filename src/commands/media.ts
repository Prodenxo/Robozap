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

      // Helper to find media in nested structures (viewOnce, ephemeral, etc)
      const findMedia = (m: any) => {
          if (!m) return null;
          // Se o objeto já for a mídia, retorna ele mesmo
          if (m.url || m.directPath || m.mediaKey) return m;
          
          return m.imageMessage || m.stickerMessage || m.videoMessage || 
                 m.viewOnceMessage?.message?.imageMessage || 
                 m.viewOnceMessageV2?.message?.imageMessage ||
                 m.ephemeralMessage?.message?.imageMessage ||
                 m.documentWithCaptionMessage?.message?.imageMessage;
      };

      const mediaContent = findMedia(msgContent);
      const quotedMediaContent = findMedia(quotedContent);
      
      const targetMedia = quotedMediaContent || mediaContent;
      
      if (targetMedia) {
        await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figStart);
        try {
          // Identify which ID to use
          const isQuoted = !!quotedMediaContent;
          const targetMessageId = isQuoted ? msg.quotedId : msg.id;
          
          if (!targetMessageId) throw new Error('No message ID found for media');

          // Tenta adivinhar se a mensagem citada é do próprio bot
          const botJid = await whatsapp.getBotJid();
          const isQuotedFromMe = isQuoted && msg.quotedParticipant === botJid;

          const key = {
              id: targetMessageId,
              remoteJid: msg.remoteJid,
              fromMe: isQuotedFromMe
          };

          console.log(`[MEDIA] .fig command. Target ID: ${targetMessageId}, IsQuoted: ${isQuoted}, initial fromMe: ${key.fromMe}`);
          
          let base64 = await whatsapp.getBase64FromMessage(key);
          if (!base64) {
            // Se falhar, tenta com o valor oposto de fromMe
            console.log(`[MEDIA] Falha ao obter base64 com fromMe: ${key.fromMe}. Tentando o oposto...`);
            key.fromMe = !key.fromMe;
            base64 = await whatsapp.getBase64FromMessage(key);
          }

          if (base64) {
            await whatsapp.sendSticker(msg.remoteJid, base64);
          } else {
            throw new Error('Failed to fetch base64 from message');
          }
        } catch (error) {
          console.error('[MEDIA] Sticker Error:', error);
          await whatsapp.sendMessage(msg.remoteJid, botTexts.media.figErrorGeneric);
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
