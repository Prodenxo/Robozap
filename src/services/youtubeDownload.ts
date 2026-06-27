import axios from 'axios';
import { exec } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);

const INSTANCE_CACHE_MS = 60 * 60 * 1000;

const FALLBACK_PIPED_BASES = [
  'https://api.piped.private.coffee',
  'https://piped-api.lunar.icu',
  'https://piped-api.cfe.re',
  'https://ytapi.dc09.ru',
  'https://yapi.vyper.me',
  'https://pipedapi.colinslegacy.com',
  'https://pipedapi.rivo.lol',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://api-piped.mha.fi',
  'https://pipedapi.syncpundit.io',
  'https://pipedapi.kavin.rocks'
];

const FALLBACK_INVIDIOUS_BASES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.projectsegfau.lt',
  'https://invidious.privacydev.net',
  'https://invidious.lunar.icu'
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
  return `${normalizeApiBase(base)}/streams/${videoId}`;
}

function normalizeYoutubeWatchUrl (url: string): string {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return url;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function getAxiosErrorDetail (error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const apiError = error.response?.data as {
    status?: string;
    error?: { code?: string };
  } | undefined;

  if (apiError?.error?.code) {
    return apiError.error.code;
  }

  if (apiError && typeof apiError === 'object') {
    return JSON.stringify(apiError);
  }

  return error.message;
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
      'https://piped-instances.kavin.rocks/',
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
          if (abort.signal.aborted) return;

          const code = (error as { code?: string })?.code;
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[PIPED] Falha em ${base} (code: ${code}): ${message}`);
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
  const fallbacks = [
    'https://fox.kittycat.boo',
    'https://dog.kittycat.boo',
    'https://api.cobalt.blackcat.sweeux.org',
    'https://subito-c.meowing.de',
    'https://cobalt.omega.wolfy.love',
    'https://grapefruit.clxxped.lol',
    'https://nuko-c.meowing.de',
    'https://lime.clxxped.lol',
    'https://apicobalt.mgytr.top',
    'https://api.cobalt.liubquanti.click',
    'https://api.qwkuns.me'
  ];
  
  if (fromEnv.length) {
    return uniqueBases([...fromEnv, ...fallbacks]);
  }
  return uniqueBases(['http://cobalt:9000', ...fallbacks]);
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

  const endpoint = `${normalizeApiBase(base)}/`;
  const normalizedUrl = normalizeYoutubeWatchUrl(youtubeUrl);

  const { data } = await axios.post<CobaltResponse>(
    endpoint,
    {
      url: normalizedUrl,
      downloadMode: 'audio',
      audioFormat: 'mp3',
      audioBitrate: '128',
      youtubeBetterAudio: true
    },
    { headers, timeout: 45000 }
  );

  if (data.status === 'error') {
    throw new Error(data.error?.code ?? 'erro cobalt');
  }

  if (!data.url || !['tunnel', 'redirect'].includes(data.status)) {
    throw new Error(`resposta cobalt inválida: ${data.status}`);
  }

  let downloadUrl = data.url;
  if (!downloadUrl.startsWith('http')) {
    downloadUrl = `${normalizeApiBase(base)}${downloadUrl.startsWith('/') ? '' : '/'}${downloadUrl}`;
  }

  if (downloadUrl.includes('127.0.0.1') || downloadUrl.includes('localhost')) {
    downloadUrl = downloadUrl
      .replace(/https?:\/\/127\.0\.0\.1:\d+/g, normalizeApiBase(base))
      .replace(/https?:\/\/localhost:\d+/g, normalizeApiBase(base));
  }

  return { downloadUrl, base: normalizeApiBase(base) };
}

async function promiseAny<T> (promises: Array<Promise<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    const errors: unknown[] = []
    let rejected = 0

    if (promises.length === 0) {
      reject(Object.assign(new Error('Nenhuma promise fornecida.'), { errors: [] }))
      return
    }

    for (const promise of promises) {
      void Promise.resolve(promise).then(resolve, (error: unknown) => {
        errors.push(error)
        rejected += 1
        if (rejected === promises.length) {
          reject(Object.assign(new Error('Todas as promises falharam.'), { errors }))
        }
      })
    }
  })
}

function isYoutubeBlockError (message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('youtube.login') ||
    lower.includes('youtube.api_error') ||
    lower.includes('no_session_tokens') ||
    lower.includes('error.api.youtube') ||
    lower.includes('sign in') ||
    lower.includes('bot')
  )
}

async function tryCobaltDownload (
  url: string,
  outputPath: string,
  bases?: string[]
): Promise<void> {
  const localBases = envList('COBALT_API_URL')
  const allBases = bases ?? resolveCobaltBases()
  const ordered = uniqueBases([
    ...localBases,
    ...allBases.filter(base => !localBases.includes(base))
  ])

  if (!ordered.length) {
    throw new Error('COBALT_API_URL não configurado')
  }

  let lastError: Error | null = null
  let skipPublicCobalt = false

  for (const base of ordered) {
    if (skipPublicCobalt && !localBases.includes(base)) continue

    try {
      console.log(`[COBALT] Processando ${url} via ${base}`)
      const { downloadUrl } = await requestCobaltAudio(base, url)
      await downloadStreamToFile(downloadUrl, outputPath, 'audio/mpeg', base)
      console.log(`[COBALT] Download concluído via ${base}`)
      return
    } catch (error: unknown) {
      const message = getAxiosErrorDetail(error)
      console.warn(`[COBALT] Falha em ${base}: ${message}`)
      lastError = new Error(message)

      if (localBases.includes(base) && isYoutubeBlockError(message)) {
        skipPublicCobalt = true
        console.warn('[COBALT] Bloqueio YouTube no Cobalt local — pulando instâncias públicas')
      }
    }
  }

  throw lastError ?? new Error('Nenhum endpoint Cobalt respondeu.')
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

/** Baixa áudio do YouTube sem depender só de um backend. */
export async function downloadYouTubeAudioProxy (
  url: string,
  outputPath: string
): Promise<void> {
  const videoId = extractYouTubeVideoId(url)
  if (!videoId) {
    throw new Error('Não foi possível extrair o ID do vídeo.')
  }

  const errors: string[] = []

  // 1) Cobalt local + 2) Piped em paralelo — quem responder primeiro ganha
  try {
    await promiseAny([
      tryCobaltDownload(url, outputPath),
      tryPipedRace(videoId, outputPath)
    ])
    return
  } catch (aggregateError: unknown) {
    if (aggregateError && typeof aggregateError === 'object' && 'errors' in aggregateError) {
      const list = (aggregateError as { errors: unknown[] }).errors
      for (const item of list) {
        errors.push(item instanceof Error ? item.message : String(item))
      }
    } else {
      errors.push(
        aggregateError instanceof Error ? aggregateError.message : String(aggregateError)
      )
    }
    console.warn('[MEDIA] Cobalt/Piped paralelo falhou:', errors.join(' | '))
  }

  // 3) Invidious
  try {
    await tryInvidiousDownload(videoId, outputPath)
    return
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`invidious: ${message}`)
    console.warn('[MEDIA] invidious falhou:', message)
  }

  const last = errors[errors.length - 1] ?? ''
  if (isYoutubeBlockError(last)) {
    throw new Error('error.api.youtube.login')
  }

  throw new Error(errors.join(' | ') || 'Falha ao baixar áudio via proxies.')
}
