import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Laptop, Smartphone, Tablet, Globe, X, Trash2, QrCode } from './Icons';
import { LinkedDevice } from '../types';
import { colors, shadows } from '../theme';

interface Props {
  visible: boolean;
  devices: LinkedDevice[];
  onRevokeDevice: (deviceId: string) => void;
  onLinkNewDevice: () => void;
  onClose: () => void;
}

export function LinkedDevicesModal({
  visible,
  devices,
  onRevokeDevice,
  onLinkNewDevice,
  onClose,
}: Props) {
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'laptop': return <Laptop size={20} color={colors.accentBlue} />;
      case 'tablet': return <Tablet size={20} color={colors.accentPurple} />;
      case 'browser': return <Globe size={20} color="#d97706" />;
      default: return <Smartphone size={20} color={colors.primary} />;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Laptop size={20} color={colors.primary} />
              <Text style={styles.title}>Linked Devices</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.linkNewCard} onPress={onLinkNewDevice}>
              <QrCode size={24} color={colors.primaryDark} />
              <View style={styles.linkNewTextContainer}>
                <Text style={styles.linkNewTitle}>Link Another Device</Text>
                <Text style={styles.linkNewSubtitle}>Scan QR code to connect desktop or tablet</Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>YOUR DEVICES</Text>

            {devices.map((dev) => (
              <View key={dev.id} style={styles.deviceItem}>
                <View style={styles.deviceIconBox}>
                  {getDeviceIcon(dev.type)}
                </View>

                <View style={styles.deviceInfo}>
                  <View style={styles.deviceNameRow}>
                    <Text style={styles.deviceName}>{dev.name}</Text>
                    {dev.currentDevice && (
                      <View style={styles.thisDeviceBadge}>
                        <Text style={styles.thisDeviceText}>THIS DEVICE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.deviceMeta}>
                    {dev.os} · {dev.ipAddress}
                  </Text>
                </View>

                {!dev.currentDevice && (
                  <TouchableOpacity
                    style={styles.revokeButton}
                    onPress={() => onRevokeDevice(dev.id)}
                  >
                    <Trash2 size={16} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    marginBottom: 16,
  },
  linkNewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#a7f3d0',
    marginBottom: 20,
  },
  linkNewTextContainer: {
    flex: 1,
  },
  linkNewTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  linkNewSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 10,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  thisDeviceBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  thisDeviceText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065f46',
  },
  deviceMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  revokeButton: {
    padding: 8,
    backgroundColor: colors.dangerLight,
    borderRadius: 8,
  },
});
