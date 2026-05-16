import axios from 'axios';
import ytdl from '@distube/ytdl-core';
import { exec } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);

const INSTANCE_CACHE_MS = 60 * 60 * 1000;

const FALLBACK_PIPED_BASES = [
  'https://pipedapi.leptons.xyz',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://api-piped.mha.fi',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
  'https://pipedapi.kavin.rocks'
];

const FALLBACK_INVIDIOUS_BASES = [
  'https://invidious.fdn.fr',
  'https://invidious.protokolla.fi',
  'https://invidious.dhusch.de'
];

let pipedInstancesCache: { urls: string[]; fetchedAt: number } | null = null;

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

function envList (envKey: string): string[] {
  return (process.env[envKey] ?? '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function uniqueBases (bases: string[]): string[] {
  return [...new Set(bases.map((base) => normalizeApiBase(base)))];
}

function normalizeApiBase (base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

function buildPipedStreamsUrl (base: string, videoId: string): string {
  const normalized = normalizeApiBase(base);
  const endpoint = new URL('/streams/' + videoId, normalized.endsWith('/')
    ? normalized
    : `${normalized}/`);
  return endpoint.toString();
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

async function fetchHealthyPipedInstances (): Promise<string[]> {
  const now = Date.now();
  if (
    pipedInstancesCache &&
    now - pipedInstancesCache.fetchedAt < INSTANCE_CACHE_MS
  ) {
    return pipedInstancesCache.urls;
  }

  const urls: string[] = [];

  try {
    const { data } = await axios.get(
      'https://piped-instances.kavinrocks.dev/',
      { timeout: 12000 }
    );

    if (Array.isArray(data)) {
      for (const item of data) {
        const apiUrl = item?.api_url ?? item?.api;
        const uptime = Number(item?.uptime_24h ?? item?.uptime ?? 100);
        if (typeof apiUrl === 'string' && uptime >= 80) {
          urls.push(apiUrl.replace(/\/$/, ''));
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[PIPED] Lista dinâmica indisponível:', message);
  }

  pipedInstancesCache = {
    urls: uniqueBases(urls).slice(0, 20),
    fetchedAt: now
  };

  return pipedInstancesCache.urls;
}

async function resolvePipedBases (): Promise<string[]> {
  const dynamic = await fetchHealthyPipedInstances();
  return uniqueBases([
    ...envList('PIPED_API_URL'),
    ...dynamic,
    ...FALLBACK_PIPED_BASES
  ]);
}

interface PipedAudioStream {
  url: string;
  bitrate?: number;
  mimeType?: string;
}

async function fetchPipedAudioStream (
  base: string,
  videoId: string,
  signal?: AbortSignal
): Promise<PipedAudioStream> {
  const { data } = await axios.get(buildPipedStreamsUrl(base, videoId), {
    timeout: 18000,
    signal,
    headers: { 'User-Agent': 'robozap/1.0' }
  });

  const streams = (data?.audioStreams ?? []) as PipedAudioStream[];
  if (!streams.length) {
    throw new Error('sem áudio');
  }

  return [...streams].sort(
    (a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0)
  )[0];
}

async function tryPipedRace (
  videoId: string,
  outputPath: string
): Promise<void> {
  const bases = await resolvePipedBases();
  const pool = bases.slice(0, 12);
  const abort = new AbortController();
  let lastError: Error | null = null;

  await new Promise<void>((resolve, reject) => {
    let pending = pool.length;
    if (pending === 0) {
      reject(new Error('Nenhuma instância Piped configurada.'));
      return;
    }

    for (const base of pool) {
      void (async () => {
        try {
          console.log(`[PIPED] Tentando ${base} — vídeo ${videoId}`);
          const stream = await fetchPipedAudioStream(base, videoId, abort.signal);
          abort.abort();
          await downloadStreamToFile(stream.url, outputPath, stream.mimeType, base);
          console.log(`[PIPED] Sucesso via ${base}`);
          resolve();
        } catch (error: unknown) {
          const code = (error as { code?: string })?.code;
          if (code === 'ERR_CANCELED' || code === 'ECONNABORTED') return;

          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[PIPED] Falha em ${base}: ${message}`);
          lastError = error instanceof Error ? error : new Error(message);

          pending -= 1;
          if (pending === 0) {
            reject(lastError ?? new Error('Nenhuma instância Piped respondeu.'));
          }
        }
      })();
    }
  });
}

interface CobaltResponse {
  status: string;
  url?: string;
  error?: { code?: string };
}

function resolveCobaltBases (): string[] {
  const fromEnv = envList('COBALT_API_URL');
  const defaults = [
    'http://cobalt:9000',
    'http://127.0.0.1:9000',
    'http://localhost:9000'
  ];
  return uniqueBases([...fromEnv, ...defaults]);
}

async function requestCobaltAudio (
  base: string,
  youtubeUrl: string
): Promise<{ downloadUrl: string; base: string }> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  const apiKey = process.env.COBALT_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Api-Key ${apiKey}`;
  }

  const { data } = await axios.post<CobaltResponse>(
    base,
    {
      url: youtubeUrl,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128'
    },
    { headers, timeout: 90000 }
  );

  if (data.status === 'error') {
    throw new Error(data.error?.code ?? 'erro cobalt');
  }

  if (!data.url || !['tunnel', 'redirect'].includes(data.status)) {
    throw new Error(`resposta cobalt inválida: ${data.status}`);
  }

  const downloadUrl = data.url.startsWith('http')
    ? data.url
    : `${base}${data.url.startsWith('/') ? '' : '/'}${data.url}`;

  return { downloadUrl, base };
}

async function tryCobaltDownload (
  url: string,
  outputPath: string
): Promise<void> {
  const bases = resolveCobaltBases();
  if (!bases.length) {
    throw new Error('COBALT_API_URL não configurado');
  }

  let lastError: Error | null = null;

  for (const base of bases) {
    try {
      console.log(`[COBALT] Processando ${url} via ${base}`);
      const { downloadUrl } = await requestCobaltAudio(base, url);
      await downloadStreamToFile(downloadUrl, outputPath, 'audio/mpeg', base);
      console.log(`[COBALT] Download concluído via ${base}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[COBALT] Falha em ${base}: ${message}`);
      lastError = error instanceof Error ? error : new Error(message);
    }
  }

  throw lastError ?? new Error('Nenhum endpoint Cobalt respondeu.');
}

async function tryYtdlCoreDownload (
  url: string,
  outputPath: string
): Promise<void> {
  console.log(`[YTDl-CORE] Tentando stream direto: ${url}`);

  const info = await ytdl.getInfo(url);
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'highestaudio',
    filter: 'audioonly'
  });

  if (!format) {
    throw new Error('Nenhum formato de áudio disponível');
  }

  const rawPath = outputPath.replace(/\.mp3$/i, '_ytdl.webm');
  await pipeline(
    ytdl.downloadFromInfo(info, { format }),
    createWriteStream(rawPath)
  );

  if (!fs.existsSync(rawPath) || fs.statSync(rawPath).size === 0) {
    throw new Error('Stream vazio');
  }

  await convertToMp3(rawPath, outputPath);
  console.log('[YTDl-CORE] Sucesso');
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
  const bases = uniqueBases([
    ...envList('INVIDIOUS_API_URL'),
    ...FALLBACK_INVIDIOUS_BASES
  ]);

  for (const base of bases.slice(0, 6)) {
    try {
      console.log(`[INVIDIOUS] Tentando ${base} — vídeo ${videoId}`);
      const { data } = await axios.get(`${base}/api/v1/videos/${videoId}`, {
        timeout: 20000,
        headers: { 'User-Agent': 'robozap/1.0' }
      });

      const formats = (data?.adaptiveFormats ?? []) as InvidiousFormat[];
      const audioOnly = formats.filter(
        (format) =>
          format.url &&
          format.type?.startsWith('audio/') &&
          !format.type.includes('video')
      );

      if (!audioOnly.length) continue;

      const best = [...audioOnly].sort((a, b) => {
        return Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0);
      })[0];

      await downloadStreamToFile(best.url!, outputPath, best.type, base);
      console.log(`[INVIDIOUS] Sucesso via ${base}`);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[INVIDIOUS] Falha em ${base}: ${message}`);
    }
  }

  throw new Error('Nenhuma instância Invidious respondeu.');
}

let downloadChain: Promise<void> = Promise.resolve();

export function enqueueYouTubeDownload<T> (
  task: () => Promise<T>
): Promise<T> {
  const run = downloadChain.then(task, task);
  downloadChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Baixa áudio do YouTube sem depender de cookies do usuário. */
export async function downloadYouTubeAudioProxy (
  url: string,
  outputPath: string
): Promise<void> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Não foi possível extrair o ID do vídeo.');
  }

  const steps: Array<{ name: string; run: () => Promise<void> }> = [
    { name: 'cobalt', run: () => tryCobaltDownload(url, outputPath) },
    { name: 'piped', run: () => tryPipedRace(videoId, outputPath) },
    { name: 'ytdl-core', run: () => tryYtdlCoreDownload(url, outputPath) },
    { name: 'invidious', run: () => tryInvidiousDownload(videoId, outputPath) }
  ];

  let lastError: Error | null = null;

  for (const step of steps) {
    try {
      await step.run();
      return;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[MEDIA] ${step.name} falhou:`, lastError.message);
    }
  }

  throw lastError ?? new Error('Falha ao baixar áudio via proxies.');
}
