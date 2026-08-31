import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './config';

export interface ReleaseInfo {
  version: string;
  title: string;
  notes: string;
  downloadUrl: string;
  apkUrl?: string;
  isMandatory?: boolean;
  publishedAt?: string;
}

export interface CheckUpdateResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestRelease: ReleaseInfo | null;
  error?: string;
}

// Current App Version
export const CURRENT_APP_VERSION = Constants.expoConfig?.version || '1.0.0';

// Default GitHub Repo for direct releases fallback
export const GITHUB_RELEASES_API = 'https://api.github.com/repos/simanto848/e2e-message-client/releases/latest';
export const GITHUB_RELEASES_WEB = 'https://github.com/simanto848/e2e-message-client/releases';

/**
 * Compare two semver strings (e.g. "1.1.0" > "1.0.0")
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a == b
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = a.replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const cleanB = b.replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);

  const len = Math.max(cleanA.length, cleanB.length);
  for (let i = 0; i < len; i++) {
    const numA = cleanA[i] || 0;
    const numB = cleanB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Check for updates against backend and GitHub Releases
 */
export async function checkForAppUpdates(): Promise<CheckUpdateResult> {
  const currentVersion = CURRENT_APP_VERSION;

  // 1. Try Backend Updates Endpoint First
  try {
    const backendRes = await fetch(`${API_BASE_URL}/updates/check?currentVersion=${encodeURIComponent(currentVersion)}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (backendRes.ok) {
      const data = await backendRes.json();
      if (data.success && data.latest) {
        const isNewer = compareSemver(data.latest.version, currentVersion) > 0;
        return {
          hasUpdate: isNewer,
          currentVersion,
          latestRelease: {
            version: data.latest.version,
            title: data.latest.title || `JABY v${data.latest.version}`,
            notes: data.latest.notes || 'Performance improvements and bug fixes.',
            downloadUrl: data.latest.downloadUrl || GITHUB_RELEASES_WEB,
            apkUrl: data.latest.apkUrl,
            isMandatory: !!data.latest.isMandatory,
            publishedAt: data.latest.releaseDate,
          },
        };
      }
    }
  } catch {
    // Backend offline or unreachable — fallback to direct GitHub Releases API
  }

  // 2. Direct GitHub Releases API Fallback
  try {
    const ghRes = await fetch(GITHUB_RELEASES_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'JABY-Secure-Messenger-App',
      },
    });

    if (ghRes.ok) {
      const ghData = await ghRes.json();
      const latestTag = (ghData.tag_name || ghData.name || '').replace(/^v/, '');

      if (latestTag) {
        const isNewer = compareSemver(latestTag, currentVersion) > 0;

        // Find direct .apk asset in assets list if available
        let apkAssetUrl: string | undefined;
        if (Array.isArray(ghData.assets)) {
          const apkAsset = ghData.assets.find((a: any) =>
            typeof a?.name === 'string' && a.name.endsWith('.apk')
          );
          if (apkAsset?.browser_download_url) {
            apkAssetUrl = apkAsset.browser_download_url;
          }
        }

        return {
          hasUpdate: isNewer,
          currentVersion,
          latestRelease: {
            version: latestTag,
            title: ghData.name || `JABY v${latestTag}`,
            notes: ghData.body || 'New features and security updates available on GitHub Releases.',
            downloadUrl: ghData.html_url || GITHUB_RELEASES_WEB,
            apkUrl: apkAssetUrl || ghData.html_url || GITHUB_RELEASES_WEB,
            publishedAt: ghData.published_at,
          },
        };
      }
    }
  } catch (ghErr) {
    console.log('GitHub update check notice:', ghErr);
  }

  return {
    hasUpdate: false,
    currentVersion,
    latestRelease: null,
  };
}

/**
 * Open Download / GitHub Release URL
 */
export async function openReleaseDownload(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Linking.openURL(GITHUB_RELEASES_WEB);
    }
  } catch {
    await Linking.openURL(GITHUB_RELEASES_WEB);
  }
}
