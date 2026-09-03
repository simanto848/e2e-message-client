import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { X, ShieldAlert, KeyRound, Check, Trash2, Eye, EyeOff } from './Icons';
import { colors, shadows } from '../theme';
import {
  getDuressPin,
  setDuressPin,
  clearDuressPin,
  getDuressAction,
  setDuressAction,
  DuressAction,
} from '../utils/duressConfig';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DuressSettingsModal({ visible, onClose }: Props) {
  const [pin, setPin] = useState('');
  const [action, setAction] = useState<DuressAction>('decoy');
  const [hasExisting, setHasExisting] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (visible) {
      Promise.all([getDuressPin(), getDuressAction()]).then(([storedPin, storedAction]) => {
        if (storedPin) {
          setPin(storedPin);
          setHasExisting(true);
        } else {
          setPin('');
          setHasExisting(false);
        }
        setAction(storedAction);
        setShowPin(false);
      });
    }
  }, [visible]);

  const handleSave = async () => {
    Keyboard.dismiss();
    const trimmed = pin.trim();
    if (!trimmed) {
      Alert.alert('PIN Required', 'Please enter a duress PIN of at least 4 digits.');
      return;
    }
    if (trimmed.length < 4) {
      Alert.alert('Too Short', 'Duress PIN must be at least 4 digits long.');
      return;
    }

    await setDuressPin(trimmed);
    await setDuressAction(action);
    Alert.alert('Duress PIN Activated', 'Your emergency duress protocol has been configured securely.', [
      { text: 'OK', onPress: onClose },
    ]);
  };

  const handleDisable = async () => {
    Alert.alert(
      'Disable Duress Protocol',
      'Are you sure you want to deactivate the duress PIN and emergency decoy mode?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: async () => {
            await clearDuressPin();
            setPin('');
            setHasExisting(false);
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoid}
          >
            <View style={styles.sheetContainer}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <View style={styles.iconCircle}>
                    <ShieldAlert size={20} color={colors.danger} />
                  </View>
                  <View>
                    <Text style={styles.title}>Duress Protocol</Text>
                    <Text style={styles.subtitle}>Emergency Coercion Defense</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>
                    If forced to unlock JABY under coercion or duress, entering your Duress PIN instead of
                    your real PIN triggers an emergency defense without tipping off the coercer.
                  </Text>
                </View>

                {/* Duress PIN Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>EMERGENCY DURESS PIN</Text>
                  <View style={styles.inputBox}>
                    <KeyRound size={18} color={colors.textSecondary} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter 4-6 digit emergency PIN"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry={!showPin}
                      keyboardType="numeric"
                      value={pin}
                      onChangeText={setPin}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPin(!showPin)}
                      style={styles.visibilityBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showPin ? (
                        <EyeOff size={18} color={colors.textSecondary} />
                      ) : (
                        <Eye size={18} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Trigger Action Selector */}
                <Text style={styles.label}>EMERGENCY ACTION</Text>
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={[styles.actionOption, action === 'decoy' && styles.actionOptionActive]}
                    onPress={() => setAction('decoy')}
                  >
                    <View style={styles.optionHeader}>
                      <Text style={[styles.optionTitle, action === 'decoy' && styles.optionTitleActive]}>
                        Decoy Enclave
                      </Text>
                      {action === 'decoy' && <Check size={16} color={colors.primary} />}
                    </View>
                    <Text style={styles.optionDesc}>
                      Unlocks a realistic, clean decoy vault with zero sensitive contacts or message history.
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionOption, action === 'wipe' && styles.actionOptionActive]}
                    onPress={() => setAction('wipe')}
                  >
                    <View style={styles.optionHeader}>
                      <Text style={[styles.optionTitle, action === 'wipe' && styles.optionTitleActive]}>
                        Silent Enclave Wipe
                      </Text>
                      {action === 'wipe' && <Check size={16} color={colors.primary} />}
                    </View>
                    <Text style={styles.optionDesc}>
                      Silently purges all real private cryptographic keys in the background and resets the app.
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Save Button */}
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                  <Text style={styles.saveBtnText}>
                    {hasExisting ? 'Update Duress Protocol' : 'Activate Duress Protocol'}
                  </Text>
                </TouchableOpacity>

                {/* Disable Button */}
                {hasExisting && (
                  <TouchableOpacity style={styles.disableBtn} onPress={handleDisable}>
                    <Trash2 size={16} color={colors.danger} />
                    <Text style={styles.disableBtnText}>Deactivate Duress Protocol</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceElevated,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  infoCard: {
    backgroundColor: colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  visibilityBtn: {
    padding: 4,
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  actionOption: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  optionTitleActive: {
    color: colors.primaryDark,
  },
  optionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
    ...shadows.sm,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  disableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 30,
  },
  disableBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
});
