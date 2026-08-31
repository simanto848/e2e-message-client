import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Svg, Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme';

interface Props {
  size?: number;
  showText?: boolean;
  subtitle?: string;
}

export function JabyLogo({ size = 44, showText = true, subtitle = 'SECURE MESSENGER' }: Props) {
  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#10b981" />
            <Stop offset="50%" stopColor="#0284c7" />
            <Stop offset="100%" stopColor="#6366f1" />
          </LinearGradient>
        </Defs>
        <Path
          d="M50 10 L85 24 V50 C85 70 70 85 50 92 C30 85 15 70 15 50 V24 Z"
          fill="#ffffff"
          stroke="url(#shieldGrad)"
          strokeWidth="4"
        />
        <Circle cx="50" cy="46" r="14" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="4 3" />
        <Path
          d="M50 38 V48 M50 56 V58"
          stroke="#0284c7"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </Svg>
      {showText && (
        <View style={styles.textContainer}>
          <View style={styles.brandRow}>
            <Text style={styles.brandName}>JABY</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>E2EE</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.textPrimary,
  },
  badge: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
