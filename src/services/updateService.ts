import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { API_BASE_URL } from './config';
import { fetchWithTimeout } from './http';
import { logger } from '../utils/logger';

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

// Default GitHub Repo for direct releases fallback (jaby-secure-messenger —
// not the legacy simanto848/e2e-message-client placeholder). The release
// workflow (mobile/.github/workflows/release-apk.yml) publishes here, and the
// server default apkUrl points at /releases/latest/download/app-release.apk.
export const GITHUB_RELEASES_API = 'https://api.github.com/repos/simanto/jaby-secure-messenger/releases/latest';
export const GITHUB_RELEASES_WEB = 'https://github.com/simanto/jaby-secure-messenger/releases';

/**
 * Compare two semver strings (e.g. "1.1.0" > "1.0.0")
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a == b
 */
function parseSemverStrict(v: string): { nums: number[]; prerelease: string | null } {
  const trimmed = v.trim().replace(/^v/i, '');
  // Strict core: MAJOR.MINOR.PATCH with numeric parts only. Anything else
  // (e.g. "1.0.0-evil", "1.0") is NOT silently coerced to "1.0.0" — a suffix
  // marks a prerelease which sorts LOWER than the release, so
  // 1.0.0-evil != 1.0.0 (and < 1.0.0).
  const m = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!m) {
    return { nums: [0, 0, 0], prerelease: trimmed || 'invalid' };
  }
  return { nums: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)], prerelease: m[4] ?? null };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemverStrict(a);
  const pb = parseSemverStrict(b);
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] > pb.nums[i]) return 1;
    if (pa.nums[i] < pb.nums[i]) return -1;
  }
  // Same numeric core: release > prerelease; prerelease vs prerelease compares lexically.
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

/**
 * Check for updates against backend and GitHub Releases
 */
export async function checkForAppUpdates(): Promise<CheckUpdateResult> {
  const currentVersion = CURRENT_APP_VERSION;

  // 1. Try Backend Updates Endpoint First
  try {
    const backendRes = await fetchWithTimeout(`${API_BASE_URL}/updates/check?currentVersion=${encodeURIComponent(currentVersion)}`, {
      headers: { 'Accept': 'application/json' },
    }, 10_000);
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

  // 2. Direct GitHub Releases API Fallback.
  // Host is pinned to api.github.com (no open-redirect follow): fetchWithTimeout
  // uses the pinned GITHUB_RELEASES_API constant only — never a URL from server
  // input. TLS is enforced (https://).
  // NOTE(APK integrity): before prompting install, verify the APK asset SHA
  // (compare the asset's sha256 against the release notes / backend-signed
  // manifest). Never silently install an APK whose hash was not verified.
  try {
    const ghRes = await fetchWithTimeout(GITHUB_RELEASES_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'JABY-Secure-Messenger-App',
      },
    }, 10_000);

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
    logger.info('Updates', 'GitHub update check notice:', ghErr);
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
