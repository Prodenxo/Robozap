import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const results = await ytSearch(query);
    return results.videos.length > 0 ? results.videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    try {
      console.log(`[YT-DLP] Download com Cookies se disponível: ${url}`);
      
      const cookiesPath = '/app/cookies.txt'; // Onde vamos colocar seus cookies
      let cookieFlag = '';
      
      if (fs.existsSync(cookiesPath)) {
          console.log('[YT-DLP] Cookies encontrados! Usando credenciais para download.');
          cookieFlag = `--cookies "${cookiesPath}"`;
      } else {
          console.warn('[YT-DLP] Aviso: cookies.txt não encontrado. O download pode falhar em servidores cloud.');
      }

      // O comando definitivo com suporte a cookies
      const command = `yt-dlp \
        ${cookieFlag} \
        -f "ba" -x --audio-format mp3 --audio-quality 0 \
        --no-playlist \
        --no-check-certificates \
        "${url}" -o "${outputPath}"`;
      
      await execAsync(command);
      
      if (!fs.existsSync(outputPath)) {
          throw new Error('Arquivo não foi gerado.');
      }

      console.log(`[YT-DLP] Sucesso no download!`);
    } catch (error: any) {
      console.error('[YT-DLP ERROR]:', error.message || error);
      throw new Error('YouTube bloqueou. Você precisa subir o arquivo cookies.txt para o servidor.');
    }
  }
}
