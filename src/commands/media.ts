import { WhatsAppService } from '../services/whatsapp';
import { MediaService } from '../services/media';
import { tryAcquireMusicLock, releaseMusicLock } from '../services/musicLock';
import { botTexts } from '../config/texts';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

async function convertMp4ToWebpSticker(mp4Buffer: Buffer): Promise<Buffer> {
  const tmpDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const inputPath = path.join(tmpDir, `input_${uniqueId}.mp4`);
  const outputPath = path.join(tmpDir, `output_${uniqueId}.webp`);

  try {
    await fs.promises.writeFile(inputPath, mp4Buffer);

    // Converter MP4/GIF para WebP animado compatível com figurinhas do WhatsApp
    const cmd = `ffmpeg -y -i "${inputPath}" -vcodec libwebp -filter_complex "[0:v] scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=black@0" -loop 0 -an -vsync 0 "${outputPath}"`;
    await execAsync(cmd);

    return await fs.promises.readFile(outputPath);
  } finally {
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {}
  }
}

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

function toBuffer(obj: any): Buffer | null {
  if (!obj) return null;
  if (Buffer.isBuffer(obj)) return obj;
  if (obj instanceof Uint8Array) return Buffer.from(obj);
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).map(Number).filter(n => !isNaN(n));
    if (keys.length > 0) {
      const arr = new Uint8Array(keys.length);
      for (const k of keys) {
        arr[k] = obj[k];
      }
      return Buffer.from(arr);
    }
  }

  if (typeof obj === 'string') {
    return Buffer.from(obj, 'base64');
  }

  return null;
}

function toNumber(obj: any): number {
  if (typeof obj === 'number') return obj;
  if (obj && typeof obj.low === 'number') return obj.low;
  return 0;
}

export async function decryptMediaLocally(targetMedia: any): Promise<string | null> {
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

    const mediaKeyBuf = toBuffer(targetMedia.mediaKey);
    const filehashBuf = toBuffer(targetMedia.fileSha256 || targetMedia.filehash || targetMedia.fileEncSha256);

    const clientUrl = targetMedia.url || (targetMedia.directPath ? `https://mmg.whatsapp.net${targetMedia.directPath}` : '');
    const decryptPayload = {
      type: type,
      clientUrl: clientUrl,
      deprecatedMms3Url: clientUrl,
      mediaKey: mediaKeyBuf ? mediaKeyBuf.toString('base64') : '',
      mimetype: targetMedia.mimetype,
      size: toNumber(targetMedia.fileLength || targetMedia.size),
      filehash: filehashBuf ? filehashBuf.toString('base64') : ''
    };

    console.log(`[DECRYPT] Tentando descriptografar mídia localmente. Mimetype: ${decryptPayload.mimetype}, Type: ${decryptPayload.type}`);
    console.log(`[DECRYPT] Payload: ${JSON.stringify(decryptPayload)}`);
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
            const mimeType = targetMedia.mimetype || '';
            if (mimeType.startsWith('video/') || mimeType === 'image/gif') {
              console.log(`[MEDIA] Sucesso na obtenção da mídia, convertendo vídeo/GIF (${mimeType}) para figurinha WebP`);
              const mp4Buffer = Buffer.from(base64, 'base64');
              const webpBuffer = await convertMp4ToWebpSticker(mp4Buffer);
              base64 = webpBuffer.toString('base64');
            }
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

    case 'brat': {
      let text = args.join(' ').trim();
      if (!text && msg.quoted) {
        text = msg.quoted.conversation || msg.quoted.extendedTextMessage?.text || '';
      }

      if (!text) {
        await whatsapp.sendMessage(
          msg.remoteJid,
          '🖤 *BRAT STICKER*\n\nComo usar: `.brat seu texto aqui` ou cite uma mensagem com `.brat`.'
        );
        return true;
      }

      try {
        const res = await axios.get(`https://skyzxu-brat.hf.space/brat`, {
          params: { text },
          responseType: 'arraybuffer'
        });
        const base64 = Buffer.from(res.data, 'binary').toString('base64');
        await whatsapp.sendSticker(msg.remoteJid, base64);
      } catch (error) {
        console.error('[MEDIA] Brat error:', error);
        await whatsapp.sendMessage(msg.remoteJid, '⚠️ Erro ao gerar figurinha Brat.');
      }
      return true;
    }

    case 'bratv': {
      let text = args.join(' ').trim();
      if (!text && msg.quoted) {
        text = msg.quoted.conversation || msg.quoted.extendedTextMessage?.text || '';
      }

      if (!text) {
        await whatsapp.sendMessage(
          msg.remoteJid,
          '🖤 *BRAT STICKER ANIMADO*\n\nComo usar: `.bratv seu texto aqui` ou cite uma mensagem com `.bratv`.'
        );
        return true;
      }

      try {
        const res = await axios.get(`https://skyzxu-brat.hf.space/brat-animated`, {
          params: { text },
          responseType: 'arraybuffer'
        });
        const mp4Buffer = Buffer.from(res.data, 'binary');
        const webpBuffer = await convertMp4ToWebpSticker(mp4Buffer);
        await whatsapp.sendSticker(msg.remoteJid, webpBuffer);
      } catch (error) {
        console.error('[MEDIA] Bratv error:', error);
        await whatsapp.sendMessage(msg.remoteJid, '⚠️ Erro ao gerar figurinha Brat animada.');
      }
      return true;
    }

    case 'emojimix':
    case 'mix': {
      let input = args.join('').trim();
      let emoji1 = '';
      let emoji2 = '';

      if (input.includes('+')) {
        const parts = input.split('+');
        emoji1 = parts[0]?.trim();
        emoji2 = parts[1]?.trim();
      } else {
        const emojis = Array.from(input);
        if (emojis.length >= 2) {
          emoji1 = emojis[0];
          emoji2 = emojis[1];
        }
      }

      if (!emoji1 || !emoji2) {
        await whatsapp.sendMessage(
          msg.remoteJid,
          '🎨 *EMOJI MIX*\n\nComo usar: `.emojimix 👻+👀` ou `.emojimix 👻👀` para misturar dois emojis.'
        );
        return true;
      }

      try {
        const url = `https://tenor.googleapis.com/v2/featured?key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(emoji1)}_${encodeURIComponent(emoji2)}`;
        const response = await axios.get(url);
        const results = response.data?.results;
        if (results && results.length > 0) {
          const imageUrl = results[0].media_formats?.png_transparent?.url || results[0].url || '';
          if (imageUrl) {
            const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const base64 = Buffer.from(imageRes.data, 'binary').toString('base64');
            await whatsapp.sendSticker(msg.remoteJid, base64);
          } else {
            throw new Error('No image URL in results');
          }
        } else {
          await whatsapp.sendMessage(msg.remoteJid, '❌ Mistura de emojis não encontrada.');
        }
      } catch (error) {
        console.error('[MEDIA] Emojimix error:', error);
        await whatsapp.sendMessage(msg.remoteJid, '⚠️ Erro ao misturar os emojis.');
      }
      return true;
    }

    case 'qc':
    case 'quote': {
      let text = args.join(' ').trim();
      let targetJid = msg.participant;

      if (msg.quoted) {
        targetJid = msg.quotedParticipant || msg.participant;
        if (!text) {
          text = msg.quoted.conversation || 
                 msg.quoted.extendedTextMessage?.text || 
                 msg.quoted.imageMessage?.caption || 
                 msg.quoted.videoMessage?.caption || 
                 '';
        }
      }

      if (!text) {
        await whatsapp.sendMessage(
          msg.remoteJid,
          '💬 *QUOTE STICKER*\n\nComo usar: `.qc seu texto` ou cite uma mensagem com `.qc` para gerar uma figurinha de citação.'
        );
        return true;
      }

      if (text.length > 150) {
        await whatsapp.sendMessage(msg.remoteJid, '⚠️ *Texto muito longo!* Limite de 150 caracteres para legibilidade.');
        return true;
      }

      try {
        const ppUrl = await whatsapp.getProfilePictureUrl(targetJid) || 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
        const senderName = await whatsapp.resolveName(targetJid, msg.remoteJid);

        const quoteObj = {
          type: 'quote',
          format: 'png',
          backgroundColor: '#121b22', // WhatsApp Dark Mode
          width: 512,
          height: 768,
          scale: 2,
          messages: [
            {
              entities: [],
              avatar: true,
              from: {
                id: 1,
                name: senderName,
                photo: {
                  url: ppUrl
                }
              },
              text: text,
              replyMessage: {}
            }
          ]
        };

        const quoteRes = await axios.post('https://bot.lyo.su/quote/generate', quoteObj, {
          headers: { 'Content-Type': 'application/json' }
        });

        const base64 = quoteRes.data?.result?.image;
        if (base64) {
          await whatsapp.sendSticker(msg.remoteJid, base64);
        } else {
          throw new Error('Failed to generate quote image');
        }
      } catch (error) {
        console.error('[MEDIA] QC error:', error);
        await whatsapp.sendMessage(msg.remoteJid, '⚠️ Erro ao gerar figurinha de citação.');
      }
      return true;
    }

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
