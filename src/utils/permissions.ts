import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { beginExternalActivity, endExternalActivity } from './appLockGuard';

export interface AppPermissionsStatus {
  camera: boolean;
  microphone: boolean;
  photos: boolean;
  notifications?: boolean;
  allGranted: boolean;
}

/**
 * Open system app settings if permissions are permanently denied
 */
export async function openAppSettings() {
  beginExternalActivity();
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('Cannot open settings:', err);
  } finally {
    endExternalActivity();
  }
}

/**
 * Request a single hardware permission
 */
export async function requestSinglePermission(
  type: 'camera' | 'microphone' | 'photos' | 'notifications'
): Promise<boolean> {
  beginExternalActivity();
  try {
    if (Platform.OS === 'android') {
      let perm: any = null;
      if (type === 'camera') {
        perm = PermissionsAndroid.PERMISSIONS.CAMERA;
      } else if (type === 'microphone') {
        perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      } else if (type === 'photos') {
        if (Number(Platform.Version) >= 33) {
          perm = PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES;
        } else {
          perm = PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        }
      } else if (type === 'notifications') {
        if (Number(Platform.Version) >= 33) {
          perm = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
        } else {
          return true;
        }
      }

      if (!perm) return true;

      const result = await PermissionsAndroid.request(perm);
      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return true;
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        Alert.alert(
          'Permission Required',
          `Please enable ${type} permission in your device Settings to use this feature.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => openAppSettings() },
          ]
        );
        return false;
      }
      return false;
    } else if (Platform.OS === 'ios') {
      if (type === 'camera') {
        const res = await ImagePicker.requestCameraPermissionsAsync();
        return res.granted;
      } else if (type === 'microphone') {
        const res = await Audio.requestPermissionsAsync();
        return res.granted;
      } else if (type === 'photos') {
        const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
        return res.granted;
      } else if (type === 'notifications') {
        return true;
      }
    }
    return true;
  } catch (err) {
    console.warn(`Failed to request ${type} permission:`, err);
    return false;
  } finally {
    endExternalActivity();
  }
}

/**
 * Request Camera, Microphone, and Photos permissions
 */
export async function requestAppPermissions(): Promise<AppPermissionsStatus> {
  if (Platform.OS === 'android') {
    beginExternalActivity();
    try {
      const permissionsToRequest: any[] = [
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      if (Number(Platform.Version) >= 33) {
        permissionsToRequest.push(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO
        );
        if ((PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS) {
          permissionsToRequest.push((PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS);
        }
      } else {
        permissionsToRequest.push(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
      }

      const granted = await PermissionsAndroid.requestMultiple(permissionsToRequest);

      const cameraGranted =
        granted[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED ||
        (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA));

      const micGranted =
        granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED ||
        (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO));

      let photosGranted = false;
      if (Number(Platform.Version) >= 33) {
        photosGranted =
          granted[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] === PermissionsAndroid.RESULTS.GRANTED ||
          (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES));
      } else {
        photosGranted =
          granted[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED ||
          (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE));
      }

      let notifGranted = true;
      const postNotifKey = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
      if (Number(Platform.Version) >= 33 && postNotifKey) {
        notifGranted =
          (granted as Record<string, string>)[postNotifKey] ===
            PermissionsAndroid.RESULTS.GRANTED ||
          (await PermissionsAndroid.check(postNotifKey));
      }

      return {
        camera: cameraGranted,
        microphone: micGranted,
        photos: photosGranted,
        notifications: notifGranted,
        allGranted: cameraGranted && micGranted && photosGranted && notifGranted,
      };
    } catch (err) {
      console.warn('Failed to request Android permissions:', err);
      return checkAppPermissions();
    } finally {
      endExternalActivity();
    }
  } else if (Platform.OS === 'ios') {
    beginExternalActivity();
    try {
      const [cameraRes, micRes, photosRes] = await Promise.all([
        ImagePicker.requestCameraPermissionsAsync().catch(() => ({ granted: false })),
        Audio.requestPermissionsAsync().catch(() => ({ granted: false })),
        ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => ({ granted: false })),
      ]);

      const camera = cameraRes.granted;
      const microphone = micRes.granted;
      const photos = photosRes.granted;

      return {
        camera,
        microphone,
        photos,
        notifications: true,
        allGranted: camera && microphone && photos,
      };
    } catch (err) {
      console.warn('Failed to request iOS permissions:', err);
      return checkAppPermissions();
    } finally {
      endExternalActivity();
    }
  }

  // Web fallback
  return {
    camera: true,
    microphone: true,
    photos: true,
    notifications: true,
    allGranted: true,
  };
}

/**
 * Check current status of permissions without triggering prompt
 */
export async function checkAppPermissions(): Promise<AppPermissionsStatus> {
  if (Platform.OS === 'android') {
    try {
      const camera = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      const microphone = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

      let photos = false;
      if (Number(Platform.Version) >= 33) {
        photos = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
      } else {
        photos = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }

      let notifications = true;
      if (Number(Platform.Version) >= 33 && (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS) {
        notifications = await PermissionsAndroid.check((PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS);
      }

      return {
        camera,
        microphone,
        photos,
        notifications,
        allGranted: camera && microphone && photos && notifications,
      };
    } catch {
      return { camera: false, microphone: false, photos: false, notifications: false, allGranted: false };
    }
  } else if (Platform.OS === 'ios') {
    try {
      const [cameraRes, micRes, photosRes] = await Promise.all([
        ImagePicker.getCameraPermissionsAsync().catch(() => ({ granted: false })),
        Audio.getPermissionsAsync().catch(() => ({ granted: false })),
        ImagePicker.getMediaLibraryPermissionsAsync().catch(() => ({ granted: false })),
      ]);

      const camera = cameraRes.granted;
      const microphone = micRes.granted;
      const photos = photosRes.granted;

      return {
        camera,
        microphone,
        photos,
        notifications: true,
        allGranted: camera && microphone && photos,
      };
    } catch {
      return { camera: false, microphone: false, photos: false, notifications: false, allGranted: false };
    }
  }

  return { camera: true, microphone: true, photos: true, notifications: true, allGranted: true };
}
