import https from 'https';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  htmlUrl?: string;
  error?: string;
}

export class UpdaterService {
  public static readonly CURRENT_VERSION = '1.0.3';
  public static repoSlug = 'eekilinc/Postaci';

  public static async checkForUpdates(repoSlug?: string): Promise<UpdateCheckResult> {
    const slug = repoSlug || this.repoSlug;
    const currentVersion = this.CURRENT_VERSION;

    try {
      const data = await this.fetchGitHubRelease(slug);
      if (!data || !data.tag_name) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          releaseNotes: 'Şu anda en güncel Postacı sürümünü kullanıyorsunuz.'
        };
      }

      const latestTag = data.tag_name.replace(/^v/, '').trim();
      const isNewer = this.compareSemver(latestTag, currentVersion) > 0;

      // Find Windows executable or zip asset
      let downloadUrl = data.html_url;
      if (Array.isArray(data.assets) && data.assets.length > 0) {
        const winAsset = data.assets.find((a: any) => a.name.endsWith('.exe') || a.name.endsWith('.zip'));
        if (winAsset) {
          downloadUrl = winAsset.browser_download_url;
        }
      }

      return {
        updateAvailable: isNewer,
        currentVersion,
        latestVersion: latestTag,
        releaseName: data.name || `Postacı v${latestTag}`,
        releaseNotes: data.body || 'Yeni sürüm iyileştirmeleri ve hata düzeltmeleri.',
        publishedAt: data.published_at,
        downloadUrl,
        htmlUrl: data.html_url
      };
    } catch (err: any) {
      return {
        updateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: err.message || 'GitHub güncellemeleri denetlenirken bir sorun oluştu.'
      };
    }
  }

  private static fetchGitHubRelease(repoSlug: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${repoSlug}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': 'Postaci-Email-Client/1.0.0',
          'Accept': 'application/vnd.github.v3+json'
        },
        timeout: 8000
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(body));
            } catch (e) {
              reject(e);
            }
          } else if (res.statusCode === 404) {
            // No release published yet on repo
            resolve(null);
          } else {
            reject(new Error(`GitHub API yanıt kodu: ${res.statusCode}`));
          }
        });
      });

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('GitHub bağlantı zaman aşımı.'));
      });
      req.end();
    });
  }

  private static compareSemver(v1: string, v2: string): number {
    const p1 = v1.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = v2.split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(p1.length, p2.length);

    for (let i = 0; i < len; i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }
}
