import ytSearch from 'yt-search';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

const COOKIES_CONTENT = `# Netscape HTTP Cookie File
.youtube.com	TRUE	/	FALSE	1807562156	HSID	Ao3DDomAH9KrCVyVw
.youtube.com	TRUE	/	TRUE	1807562156	SSID	AMF98URRDcosahN43
.youtube.com	TRUE	/	FALSE	1807562156	APISID	IQuLzojCh9yeEHS6/AHxjk28A06QhYz-lo
.youtube.com	TRUE	/	TRUE	1807562156	SAPISID	V8mL7-nIbXCG-tZn/ASNsKqmh9C86AScVl
.youtube.com	TRUE	/	TRUE	1807562156	__Secure-1PAPISID	V8mL7-nIbXCG-tZn/ASNsKqmh9C86AScVl
.youtube.com	TRUE	/	TRUE	1807562156	__Secure-3PAPISID	V8mL7-nIbXCG-tZn/ASNsKqmh9C86AScVl
.youtube.com	TRUE	/	TRUE	1806503232	LOGIN_INFO	AFmmF2swRQIhAKG7a6wTLcE2loQANOc7E3Ot7qRPxQ5HYE9KQBSjdSO6AiA8zBQX8Rni6b83U0Qcb4aWlqttgCyHHdjkwaF1hY3D4Q:QUQ3MjNmeFdaMUdKYWNhVFlZRWp5bnBNUVQ4aVBtUmVYZ0FuUFEtaU9Xc0tHdjN2d25fREhDSHRGeVgwRlR1QUlHVUZRdld1Z1Jyb1BpT21zcnZuVXhySktzWS1qcTJhLW5WclVHczRFWUdOdFlvNzgxMmRfQ0JzZ2JRNXRIU1VTRFlsSDdhY19JUW5YRWVxNk9qZFhXNVRad051alJjM1lR
.youtube.com	TRUE	/	TRUE	1808369630	PREF	f6=80&f7=100&tz=America.Sao_Paulo&f4=4000000
.youtube.com	TRUE	/	FALSE	1807562156	SID	g.a0007Qhw52kwVGgiWGrmpSzFXlQLlL0ZczszjhXCau6kqg5qOi7rm6J9G1_Dwynvhw4DM4XLgAACgYKAXASARYSFQHGX2MiUhIqM_Eh8bmfQV08rN16GxoVAUF8yKqwD-45czAZwDY9QZFY1AhE0076
.youtube.com	TRUE	/	TRUE	1807562156	__Secure-1PSID	g.a0007Qhw52kwVGgiWGrmpSzFXlQLlL0ZczszjhXCau6kqg5qOi7rs7ka0vlqeXslTr2GTMjWLAACgYKAWcSARYSFQHGX2MidkW5S5yAXagxykPYX3wFCxoVAUF8yKp_5GbIr0XPkMguAowemQnc0076
.youtube.com	TRUE	/	TRUE	1807562156	__Secure-3PSID	g.a0007Qhw52kwVGgiWGrmpSzFXlQLlL0ZczszjhXCau6kqg5qOi7rU3L8ZkRgfGWNwpyut5YFOwACgYKATsSARYSFQHGX2MiJ3A6MFkikTv_aKwwq-xmThoVAUF8yKoKqc7XiiFtcCidwkc0bx9w0076
.youtube.com	TRUE	/	TRUE	1805345632	__Secure-1PSIDTS	sidts-CjQBBj1CYoBaW7ZDf0hTuQDGKeDJ1eu0N8qnJes9369h7qFp-PdO_Hd5GgR6hKWY5-GQ6ju-EAA
.youtube.com	TRUE	/	TRUE	1805345632	__Secure-3PSIDTS	sidts-CjQBBj1CYoBaW7ZDf0hTuQDGKeDJ1eu0N8qnJes9369h7qFp-PdO_Hd5GgR6hKWY5-GQ6ju-EAA
.youtube.com	TRUE	/	FALSE	1805345633	SIDCC	AKEyXzUWl1zFmEi6V5YrYhDmURXTpSgAlwKBZ5c4tAWvZD8E6MOBcqRw-dsHsd9SCslm3qxXcOM
.youtube.com	TRUE	/	TRUE	1805345633	__Secure-1PSIDCC	AKEyXzVLS6swOU9OoObJEkaSw_ieZQZ91usmRphoYqwzvB9eCQbq3bEyi4OpRbrIQDQ2_-eY9A
.youtube.com	TRUE	/	TRUE	1805345633	__Secure-3PSIDCC	AKEyXzVZPJpm4GQLQzh9UFyA5VKGNkCaERcb5VpQNvv3sY8ttBOdUE-oR8BjmXTIo4ATdUJxEVg
.youtube.com	TRUE	/	TRUE	1789361633	VISITOR_INFO1_LIVE	LN3d07qjxho
.youtube.com	TRUE	/	TRUE	1789361633	VISITOR_PRIVACY_METADATA	CgJCUhIEGgAgNw%3D%3D
.youtube.com	TRUE	/	TRUE	0	YSC	m4-NM3TNpfk
.youtube.com	TRUE	/	TRUE	1789317845	__Secure-ROLLOUT_TOKEN	CIjGofW04pid8AEQy_uXm8aQkgMYoJKD2bCnkwM%3D`;

export class MediaService {
  async searchYouTube(query: string): Promise<string | null> {
    const results = await ytSearch(query);
    return results.videos.length > 0 ? results.videos[0].url : null;
  }

  async downloadMusic(url: string, outputPath: string): Promise<void> {
    try {
      const cookiesPath = path.join(process.cwd(), 'cookies.txt');
      if (!fs.existsSync(cookiesPath)) {
          fs.writeFileSync(cookiesPath, COOKIES_CONTENT);
      }

      console.log(`[YT-DLP] Bypass com Deno e Cookies: ${url}`);
      
      // --js-runtimes deno forces yt-dlp to use the resolver we just installed
      // -f "bestaudio/best" is more flexible than searching for a specific audio format
      const command = `yt-dlp \
        --js-runtimes deno \
        --cookies "${cookiesPath}" \
        -f "bestaudio/best" -x --audio-format mp3 --audio-quality 0 \
        --no-playlist \
        --no-check-certificates \
        "${url}" -o "${outputPath}"`;
      
      await execAsync(command);
      
      if (!fs.existsSync(outputPath)) {
          throw new Error('O arquivo não foi gerado. Bloqueio de assinatura persistente.');
      }

      console.log(`[YT-DLP] Sucesso!`);
    } catch (error: any) {
      console.error('[YT-DLP ERROR]:', error.message || error);
      throw new Error('O YouTube bloqueou a assinatura do vídeo. Tentando contornar...');
    }
  }
}
