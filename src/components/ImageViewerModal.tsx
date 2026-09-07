import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { X, Lock, ImageIcon } from './Icons';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  status?: 'loading' | 'ready' | 'error';
  dataUri?: string;
  senderName?: string;
  timestamp?: number;
  onClose: () => void;
}

/**
 * Full-screen E2EE image viewer. Shows the already-decrypted image — no
 * plaintext ever touches disk or network here. Honors the surrounding
 * screen-capture blocking while open (same OS-level guard as the chat).
 */
export function ImageViewerModal({ visible, status, dataUri, senderName, timestamp, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.titleCol}>
            <Text style={styles.sender} numberOfLines={1}>
              {senderName || 'Encrypted image'}
            </Text>
            {typeof timestamp === 'number' && timestamp > 0 && (
              <Text style={styles.time}>
                {new Date(timestamp).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </View>
          <View style={styles.e2eeChip}>
            <Lock size={10} color="#6ee7b7" />
            <Text style={styles.e2eeText}>E2EE</Text>
          </View>
        </View>

        {/* Image */}
        <View style={styles.stage}>
          {status === 'ready' && dataUri ? (
            <Image source={{ uri: dataUri }} style={styles.image} resizeMode="contain" accessibilityLabel="Full-screen encrypted image" />
          ) : status === 'error' ? (
            <View style={styles.centerBox}>
              <ImageIcon size={34} color="#64748b" />
              <Text style={styles.errorText}>Could not decrypt this image</Text>
            </View>
          ) : (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Decrypting…</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 10,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  sender: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  time: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 1,
  },
  e2eeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  e2eeText: {
    color: '#6ee7b7',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  centerBox: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
