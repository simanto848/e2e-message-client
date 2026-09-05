import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';

interface Props {
  uri?: string;
  name?: string;
  size: number;
  style?: StyleProp<ImageStyle | ViewStyle>;
}

// Deterministic palette pick per user so the same name always gets the same
// color (no per-render flicker, no need to persist a chosen color anywhere).
const PALETTE = ['#10b981', '#0284c7', '#7c3aed', '#f59e0b', '#ef4444', '#059669', '#0ea5e9', '#8b5cf6'];

function colorForName(name?: string): string {
  const safe = name || '?';
  let hash = 0;
  for (let i = 0; i < safe.length; i++) {
    hash = (hash * 31 + safe.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsForName(name?: string): string {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Renders a user's avatar image, falling back to a colored initials circle
 * when there's no avatar URL (new users, per the server's registration
 * default) or the image fails to load (dead link, offline). Every avatar
 * render site in the app should go through this instead of a bare <Image>,
 * so a broken/missing avatar never just silently renders nothing.
 */
export function Avatar({ uri, name, size, style }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  // Caller `style` goes first and the computed size/color object second, so
  // layout props from the caller (e.g. marginRight) still apply but can't
  // clobber the size or — for the fallback — the computed background color
  // (existing avatar styles across the app set a placeholder backgroundColor
  // for the loading state, which would otherwise silently defeat the
  // colored-initials fallback).
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[style as StyleProp<ImageStyle>, { width: size, height: size, borderRadius: size / 2 }]}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        style as StyleProp<ViewStyle>,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorForName(name || '?') },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsForName(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
