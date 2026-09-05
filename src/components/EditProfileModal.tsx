import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X, User, Camera, ShieldCheck } from './Icons';
import { UserProfile } from '../types';
import { colors, shadows } from '../theme';
import { uploadAvatar } from '../utils/avatarUpload';
import { beginExternalActivity, endExternalActivity } from '../utils/appLockGuard';
import { Avatar } from './Avatar';

interface Props {
  visible: boolean;
  currentUser: UserProfile;
  onSave: (updates: { name: string; avatar: string }) => Promise<boolean>;
  onClose: () => void;
}

export function EditProfileModal({ visible, currentUser, onSave, onClose }: Props) {
  const [name, setName] = useState(currentUser.name);
  // localPreviewUri is set immediately after picking, before the Cloudinary
  // upload finishes, so the picked photo shows right away instead of a blank
  // gap while uploading.
  const [localPreviewUri, setLocalPreviewUri] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset local edit state whenever the sheet is (re)opened for a fresh edit.
  useEffect(() => {
    if (visible) {
      setName(currentUser.name);
      setLocalPreviewUri(null);
      setUploadedAvatarUrl(null);
    }
  }, [visible, currentUser.name]);

  const handlePickPhoto = async () => {
    beginExternalActivity();
    let result: ImagePicker.ImagePickerResult | null = null;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo access needed', 'JABY needs photo library access to set a profile picture.');
        return;
      }

      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });
    } catch (err) {
      console.warn('[EditProfile] Failed to pick photo:', err);
      return;
    } finally {
      endExternalActivity();
    }
    if (!result || result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setLocalPreviewUri(asset.uri);
    setIsUploadingPhoto(true);
    try {
      const url = await uploadAvatar(asset.uri, asset.mimeType || 'image/jpeg');
      setUploadedAvatarUrl(url);
    } catch (err) {
      console.warn('[EditProfile] Avatar upload failed:', err);
      const message = err instanceof Error ? err.message : 'Could not upload your photo. Please check your connection and try again.';
      Alert.alert('Upload failed', message);
      setLocalPreviewUri(null);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Please enter a display name.');
      return;
    }
    if (isUploadingPhoto) {
      Alert.alert('Please wait', 'Your photo is still uploading.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await onSave({
        name: trimmedName,
        avatar: uploadedAvatarUrl || currentUser.avatar,
      });
      if (success) onClose();
      else Alert.alert('Save failed', 'Could not update your profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayedAvatar = localPreviewUri || currentUser.avatar;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <User size={20} color={colors.primary} />
              <Text style={styles.title}>Edit Profile</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.avatarSection}>
              <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickPhoto} disabled={isUploadingPhoto}>
                <Avatar uri={displayedAvatar} name={currentUser.name} size={96} style={styles.avatar} />
                <View style={styles.avatarEditBadge}>
                  {isUploadingPhoto ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Camera size={16} color="#ffffff" />
                  )}
                </View>
              </TouchableOpacity>
              <Text style={styles.avatarHint}>
                {isUploadingPhoto ? 'Uploading...' : 'Tap to change photo'}
              </Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>DISPLAY NAME</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={colors.textMuted}
                  maxLength={40}
                />
              </View>
            </View>

            <View style={styles.handleCard}>
              <ShieldCheck size={14} color={colors.textMuted} />
              <Text style={styles.handleCardText}>
                Your handle ({currentUser.handle}) can't be changed.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, (isSaving || isUploadingPhoto) && styles.disabledBtn]}
              onPress={handleSave}
              disabled={isSaving || isUploadingPhoto}
            >
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceElevated,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarHint: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrapper: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  textInput: {
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 12,
  },
  handleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
  },
  handleCardText: {
    color: colors.textMuted,
    fontSize: 11,
    flex: 1,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    ...shadows.sm,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
