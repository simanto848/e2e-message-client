import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';

export interface AppPermissionsStatus {
  camera: boolean;
  microphone: boolean;
  photos: boolean;
  allGranted: boolean;
}

/**
 * Open system app settings if permissions are permanently denied
 */
export async function openAppSettings() {
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('Cannot open settings:', err);
  }
}

/**
 * Request a single hardware permission
 */
export async function requestSinglePermission(type: 'camera' | 'microphone' | 'photos'): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
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
  } catch (err) {
    console.warn(`Failed to request ${type} permission:`, err);
    return false;
  }
}

/**
 * Request Camera, Microphone, and Photos permissions on app startup
 */
export async function requestAppPermissions(): Promise<AppPermissionsStatus> {
  if (Platform.OS === 'android') {
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

      const anyNeverAskAgain = Object.values(granted).includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
      if (!photosGranted && anyNeverAskAgain) {
        // Offer settings shortcut if permanently blocked
      }

      return {
        camera: cameraGranted,
        microphone: micGranted,
        photos: photosGranted,
        allGranted: cameraGranted && micGranted && photosGranted,
      };
    } catch (err) {
      console.warn('Failed to request Android permissions:', err);
      return checkAppPermissions();
    }
  }

  // iOS / Web fallback
  return {
    camera: true,
    microphone: true,
    photos: true,
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

      return {
        camera,
        microphone,
        photos,
        allGranted: camera && microphone && photos,
      };
    } catch {
      return { camera: false, microphone: false, photos: false, allGranted: false };
    }
  }

  return { camera: true, microphone: true, photos: true, allGranted: true };
}
