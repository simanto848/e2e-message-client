/**
 * JABY Secure Messenger Theme System - Light Theme
 */

export const colors = {
  // Backgrounds
  background: '#f8fafc',       // Slate-50: Main app background
  surface: '#ffffff',          // Pure white: Cards, modals, bubbles
  surfaceElevated: '#f1f5f9',  // Slate-100: Input fields, chips, secondary surfaces
  surfaceHighlight: '#e2e8f0', // Slate-200: Borders, dividers, subtle accents
  
  // Primary brand / status
  primary: '#10b981',          // Emerald-500: Vibrant primary brand
  primaryDark: '#059669',      // Emerald-600: Pressed state / darker accent
  primaryLight: '#d1fae5',     // Emerald-100: Soft badge / highlight background
  primaryText: '#065f46',      // Emerald-800: Readable green text
  
  // Secondary accents
  accentBlue: '#0284c7',       // Sky-600: Links, info, protocol details
  accentBlueLight: '#e0f2fe',  // Sky-100: Soft badge background
  accentPurple: '#7c3aed',     // Violet-600: Security badges
  accentPurpleLight: '#ede9fe',// Violet-100
  
  // Feedback
  danger: '#ef4444',           // Red-500: Destructive actions
  dangerLight: '#fee2e2',      // Red-100
  dangerText: '#991b1b',       // Red-800
  warning: '#f59e0b',          // Amber-500
  warningLight: '#fef3c7',     // Amber-100
  
  // Typography
  textPrimary: '#0f172a',      // Slate-900: High contrast primary text
  textSecondary: '#475569',    // Slate-600: Secondary text, subtitles
  textMuted: '#94a3b8',        // Slate-400: Placeholders, timestamps, hints
  textWhite: '#ffffff',        // White text for dark/accent backgrounds
  
  // Borders
  border: '#e2e8f0',           // Slate-200: Default card and input borders
  borderFocus: '#10b981',      // Focused input border
  borderSubtle: '#f1f5f9',     // Slate-100: Divider lines
  
  // Bubble Colors
  bubbleSent: '#10b981',       // Emerald sent bubble
  bubbleSentText: '#ffffff',
  bubbleReceived: '#ffffff',   // Clean white received bubble
  bubbleReceivedBorder: '#e2e8f0',
  bubbleReceivedText: '#0f172a',

  // Overlays
  overlay: 'rgba(15, 23, 42, 0.45)', // Dark backdrop for modals on light theme
};

export const shadows = {
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
};
