import axios from 'axios';
import { exec } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);

const DEFAULT_PIPED_BASES = [
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
  'https://api.piped.yt',
  'https://pipedapi.kavin.rocks'
];

const DEFAULT_INVIDIOUS_BASES = [
  'https://invidious.jing.rocks',
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com'
];

export function extractYouTubeVideoId (url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function getInstanceBases (envKey: string, defaults: string[]): string[] {
  const fromEnv = process.env[envKey]
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const merged = [...(fromEnv ?? []), ...defaults];
  return [...new Set(merged.map((base) => base.replace(/\/$/, '')))];
}

function shellQuote (value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function pickExtension (mimeType?: string): string {
  if (!mimeType) return '.webm';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a';
  return '.webm';
}

async function convertToMp3 (inputPath: string, outputPath: string): Promise<void> {
  const command = `ffmpeg -y -i ${shellQuote(inputPath)} -vn -acodec libmp3lame -q:a 2 ${shellQuote(outputPath)}`;
  await execAsync(command);
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath);
  }
}

async function downloadStreamToFile (
  streamUrl: string,
  outputPath: string,
  mimeType?: string,
  referer?: string
): Promise<void> {
  const rawExt = pickExtension(mimeType);
  const wantsMp3 = outputPath.toLowerCase().endsWith('.mp3');
  const rawPath = wantsMp3 && rawExt !== '.mp3'
    ? outputPath.replace(/\.mp3$/i, `_raw${rawExt}`)
    : outputPath;

  const response = await axios.get(streamUrl, {
    responseType: 'stream',
    timeout: 180000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; robozap/1.0)',
      Accept: '*/*',
      ...(referer ? { Referer: referer } : {})
    }
  });

  await pipeline(response.data, createWriteStream(rawPath));

  if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size === 0) {
    throw new Error('Download vazio ou corrompido.');
  }

  if (wantsMp3 && rawPath !== outputPath) {
    await convertToMp3(rawPath, outputPath);
    return;
  }

  if (rawPath !== outputPath) {
    fs.renameSync(rawPath, outputPath);
  }
}

interface PipedAudioStream {
  url: string;
  bitrate?: number;
  mimeType?: string;
}

async function tryPipedDownload (
  videoId: string,
  outputPath: string
): Promise<void> {
  const bases = getInstanceBases('PIPED_API_URL', DEFAULT_PIPED_BASES);

  for (const base of bases) {
    try {
      console.log(`[PIPED] Tentando ${base} — vídeo ${videoId}`);
      const { data } = await axios.get(`${base}/streams/${videoId}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'robozap/1.0' }
      });

      const streams = (data?.audioStreams ?? []) as PipedAudioStream[];
      if (!streams.length) {
        console.warn(`[PIPED] Sem áudio em ${base}`);
        continue;
      }

      const best = [...streams].sort(
        (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)
      )[0];

      await downloadStreamToFile(best.url, outputPath, best.mimeType, base);
      console.log(`[PIPED] Sucesso via ${base}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[PIPED] Falha em ${base}: ${message}`);
    }
  }

  throw new Error('Nenhuma instância Piped respondeu.');
}

interface InvidiousFormat {
  url?: string;
  type?: string;
  bitrate?: string | number;
}

async function tryInvidiousDownload (
  videoId: string,
  outputPath: string
): Promise<void> {
  const bases = getInstanceBases('INVIDIOUS_API_URL', DEFAULT_INVIDIOUS_BASES);

  for (const base of bases) {
    try {
      console.log(`[INVIDIOUS] Tentando ${base} — vídeo ${videoId}`);
      const { data } = await axios.get(`${base}/api/v1/videos/${videoId}`, {
        timeout: 30000,
        headers: { 'User-Agent': 'robozap/1.0' }
      });

      const formats = (data?.adaptiveFormats ?? []) as InvidiousFormat[];
      const audioOnly = formats.filter(
        (format) =>
          format.url &&
          format.type?.startsWith('audio/') &&
          !format.type.includes('video')
      );

      if (!audioOnly.length) {
        console.warn(`[INVIDIOUS] Sem áudio em ${base}`);
        continue;
      }

      const best = [...audioOnly].sort((a, b) => {
        const bitrateA = Number(a.bitrate ?? 0);
        const bitrateB = Number(b.bitrate ?? 0);
        return bitrateB - bitrateA;
      })[0];

      await downloadStreamToFile(
        best.url!,
        outputPath,
        best.type,
        base
      );
      console.log(`[INVIDIOUS] Sucesso via ${base}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[INVIDIOUS] Falha em ${base}: ${message}`);
    }
  }

  throw new Error('Nenhuma instância Invidious respondeu.');
}

/** Baixa áudio do YouTube sem cookies — usa proxies públicos (Piped / Invidious). */
export async function downloadYouTubeAudioProxy (
  url: string,
  outputPath: string
): Promise<void> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Não foi possível extrair o ID do vídeo.');
  }

  let lastError: Error | null = null;

  try {
    await tryPipedDownload(videoId, outputPath);
    return;
  } catch (error: unknown) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  try {
    await tryInvidiousDownload(videoId, outputPath);
    return;
  } catch (error: unknown) {
    const invidiousError = error instanceof Error ? error : new Error(String(error));
    lastError = invidiousError;
  }

  throw lastError ?? new Error('Falha ao baixar áudio via proxies.');
}
