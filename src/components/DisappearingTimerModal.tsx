import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Flame, X, Clock, Check, Plus, Shield } from './Icons';
import { colors, shadows } from '../theme';
import {
  formatDisappearingTimer,
  formatTimerDescription,
  PRESET_TIMERS,
} from '../utils/timerUtils';

interface Props {
  visible: boolean;
  currentTimer: number; // in seconds (0 = off)
  contactName: string;
  onSelectTimer: (seconds: number) => void;
  onClose: () => void;
}

export function DisappearingTimerModal({
  visible,
  currentTimer,
  contactName,
  onSelectTimer,
  onClose,
}: Props) {
  // Compute initial hours and minutes from currentTimer
  const initialHours = Math.floor(currentTimer / 3600);
  const initialMinutes = Math.floor((currentTimer % 3600) / 60);

  const [hours, setHours] = useState<string>(initialHours > 0 ? String(initialHours) : '0');
  const [minutes, setMinutes] = useState<string>(initialMinutes > 0 ? String(initialMinutes) : '0');
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  // Reset local state whenever modal opens
  useEffect(() => {
    if (visible) {
      const h = Math.floor(currentTimer / 3600);
      const m = Math.floor((currentTimer % 3600) / 60);
      setHours(String(h));
      setMinutes(String(m));

      const isPreset = PRESET_TIMERS.some(p => p.value === currentTimer);
      if (!isPreset && currentTimer > 0) {
        setActiveTab('custom');
      } else {
        setActiveTab('presets');
      }
    }
  }, [visible, currentTimer]);

  const customTotalSeconds = (parseInt(hours || '0', 10) * 3600) + (parseInt(minutes || '0', 10) * 60);

  const handleSelectPreset = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSelectTimer(value);
    onClose();
  };

  const handleApplyCustom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    onSelectTimer(customTotalSeconds);
    onClose();
  };

  const adjustHours = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const currentH = parseInt(hours || '0', 10);
    const nextH = Math.max(0, currentH + delta);
    setHours(String(nextH));
  };

  const adjustMinutes = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const currentM = parseInt(minutes || '0', 10);
    const nextM = Math.max(0, Math.min(59, currentM + delta));
    setMinutes(String(nextM));
  };

  const addQuickDuration = (addedHours: number, addedMinutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const currentH = parseInt(hours || '0', 10);
    const currentM = parseInt(minutes || '0', 10);
    const totalM = currentM + addedMinutes;
    const extraH = Math.floor(totalM / 60);
    const finalM = totalM % 60;
    const finalH = currentH + addedHours + extraH;
    setHours(String(finalH));
    setMinutes(String(finalM));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.sheetContainer}>
            {/* Top Drag Indicator */}
            <View style={styles.dragIndicator} />

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header Badge & Title */}
              <View style={styles.header}>
                <View style={styles.flameIconBadge}>
                  <Flame size={24} color="#d97706" />
                </View>
                <Text style={styles.title}>Disappearing Messages</Text>
                <Text style={styles.subtitle}>
                  For extra privacy, messages in this chat with <Text style={styles.boldContact}>{contactName}</Text> will self-destruct after being opened.
                </Text>
              </View>

              {/* Current Status Pill */}
              <View style={styles.statusPill}>
                <Shield size={14} color={currentTimer > 0 ? '#b45309' : colors.textSecondary} />
                <Text style={styles.statusPillText}>
                  Current: <Text style={styles.statusValue}>{formatDisappearingTimer(currentTimer)}</Text> ({formatTimerDescription(currentTimer)})
                </Text>
              </View>

              {/* Section Mode Tabs */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'presets' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('presets')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, activeTab === 'presets' && styles.tabTextActive]}>
                    Quick Presets
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'custom' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('custom')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, activeTab === 'custom' && styles.tabTextActive]}>
                    Custom (Hour : Min)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Presets Grid */}
              {activeTab === 'presets' ? (
                <View style={styles.presetsGrid}>
                  {PRESET_TIMERS.map(item => {
                    const isSelected = currentTimer === item.value;
                    return (
                      <TouchableOpacity
                        key={item.value}
                        style={[
                          styles.presetChip,
                          isSelected && styles.presetChipSelected,
                        ]}
                        onPress={() => handleSelectPreset(item.value)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.chipLeft}>
                          {item.value > 0 ? (
                            <Flame
                              size={15}
                              color={isSelected ? '#d97706' : colors.textMuted}
                              style={{ marginRight: 6 }}
                            />
                          ) : (
                            <Clock
                              size={15}
                              color={isSelected ? '#d97706' : colors.textMuted}
                              style={{ marginRight: 6 }}
                            />
                          )}
                          <View>
                            <Text
                              style={[
                                styles.presetChipTitle,
                                isSelected && styles.presetChipTitleSelected,
                              ]}
                            >
                              {item.label}
                            </Text>
                            <Text style={styles.presetChipSubtitle}>{item.subtitle}</Text>
                          </View>
                        </View>

                        {isSelected && (
                          <View style={styles.checkCircle}>
                            <Check size={12} color="#ffffff" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                /* Custom Hours & Minutes Selector */
                <View style={styles.customSection}>
                  <Text style={styles.customSectionLabel}>
                    Set exact hours & minutes for disappearing timer:
                  </Text>

                  {/* Hour : Minute Visual Inputs with Steppers */}
                  <View style={styles.timeInputsRow}>
                    {/* Hours Block */}
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeBlockTitle}>HOURS</Text>
                      <View style={styles.timeControlRow}>
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => adjustHours(-1)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>

                        <TextInput
                          style={styles.timeInput}
                          keyboardType="number-pad"
                          maxLength={3}
                          value={hours}
                          onChangeText={text => setHours(text.replace(/[^0-9]/g, ''))}
                          selectTextOnFocus
                        />

                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => adjustHours(1)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Separator Colon */}
                    <Text style={styles.timeSeparator}>:</Text>

                    {/* Minutes Block */}
                    <View style={styles.timeBlock}>
                      <Text style={styles.timeBlockTitle}>MINUTES</Text>
                      <View style={styles.timeControlRow}>
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => adjustMinutes(-5)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>

                        <TextInput
                          style={styles.timeInput}
                          keyboardType="number-pad"
                          maxLength={2}
                          value={minutes}
                          onChangeText={text => {
                            const clean = text.replace(/[^0-9]/g, '');
                            const num = parseInt(clean || '0', 10);
                            setMinutes(String(Math.min(59, num)));
                          }}
                          selectTextOnFocus
                        />

                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => adjustMinutes(5)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Quick Add Helper Chips */}
                  <View style={styles.quickAddRow}>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(0, 15)}
                    >
                      <Text style={styles.quickAddText}>+15m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(0, 30)}
                    >
                      <Text style={styles.quickAddText}>+30m</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(1, 0)}
                    >
                      <Text style={styles.quickAddText}>+1h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(6, 0)}
                    >
                      <Text style={styles.quickAddText}>+6h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(12, 0)}
                    >
                      <Text style={styles.quickAddText}>+12h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickAddChip}
                      onPress={() => addQuickDuration(24, 0)}
                    >
                      <Text style={styles.quickAddText}>+24h</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Live Calculated Preview Banner */}
                  <View style={styles.previewBox}>
                    <Flame size={16} color="#d97706" style={{ marginRight: 6 }} />
                    <Text style={styles.previewBoxText}>
                      {customTotalSeconds === 0 ? (
                        '0 hours 0 mins = Messages will not disappear (Off)'
                      ) : (
                        `Disappears after ${formatTimerDescription(customTotalSeconds)}`
                      )}
                    </Text>
                  </View>

                  {/* Apply Custom Button */}
                  <TouchableOpacity
                    style={[
                      styles.applyBtn,
                      customTotalSeconds === 0 && styles.applyBtnDisabled,
                    ]}
                    onPress={handleApplyCustom}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.applyBtnText}>
                      {customTotalSeconds === 0 ? 'Turn Off Disappearing Timer' : `Apply ${formatDisappearingTimer(customTotalSeconds)} Timer`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    ...shadows.lg,
  },
  dragIndicator: {
    width: 38,
    height: 4.5,
    backgroundColor: '#cbd5e1',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 14,
  },
  flameIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fef3c7',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...shadows.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  boldContact: {
    fontWeight: '700',
    color: '#0f172a',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 6,
  },
  statusPillText: {
    fontSize: 12.5,
    color: '#92400e',
    fontWeight: '500',
  },
  statusValue: {
    fontWeight: '800',
    color: '#b45309',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    ...shadows.sm,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  presetsGrid: {
    gap: 8,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  presetChipSelected: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
  },
  chipLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetChipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  presetChipTitleSelected: {
    color: '#b45309',
  },
  presetChipSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  customSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 14,
    textAlign: 'center',
  },
  timeInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  timeBlock: {
    alignItems: 'center',
  },
  timeBlockTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  timeControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
  },
  timeInput: {
    width: 64,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  timeSeparator: {
    fontSize: 26,
    fontWeight: '800',
    color: '#94a3b8',
    marginTop: 18,
  },
  quickAddRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  quickAddChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  quickAddText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  previewBoxText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400e',
  },
  applyBtn: {
    backgroundColor: '#d97706',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  applyBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  applyBtnText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
