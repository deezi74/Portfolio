import { Platform } from 'react-native';

/**
 * Type system: a clean system sans for readable content, a monospaced face
 * reserved for small technical/HUD labels. Accessibility over decoration —
 * nothing load-bearing drops below 12px, and HUD labels use letter-spacing
 * instead of size reduction to read as "technical".
 */

export const fontFamily = {
  sans: Platform.select({ android: 'sans-serif', ios: 'System', default: 'System' }),
  sansMedium: Platform.select({ android: 'sans-serif-medium', ios: 'System', default: 'System' }),
  mono: Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' }),
};

export const type = {
  hudLabel: {
    fontFamily: fontFamily.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  hudValue: {
    fontFamily: fontFamily.mono,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  title: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 22,
    letterSpacing: 1,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    letterSpacing: 0.1,
  },
  bodySmall: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  brand: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 20,
    letterSpacing: 8,
  },
};
