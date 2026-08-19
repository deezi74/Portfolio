/**
 * Luna color system.
 *
 * Background is near-black with a very faint radial warmth toward cyan —
 * never flat black, never colorful. Glow is reserved for things that are
 * actually active: live nodes, the reactor, the mic, selected controls.
 * Category colors are configurable so the graph's palette can be re-themed
 * without touching any rendering code.
 */

export const bg = {
  /** Radial gradient center — used behind the reactor and active HUD regions. */
  center: '#071015',
  /** Radial gradient edge / page background. */
  edge: '#010305',
  /** True black for OLED mode. */
  oled: '#000000',
};

export const surface = {
  glass: 'rgba(8, 16, 22, 0.72)',
  glassBorder: 'rgba(120, 210, 230, 0.16)',
  glassHighlight: 'rgba(255, 255, 255, 0.06)',
  raised: 'rgba(14, 26, 34, 0.85)',
};

export const cyan = {
  50: '#E9FBFF',
  200: '#8FEFFF',
  400: '#3FE0FF',
  500: '#0AF0FF',
  600: '#00C9E0',
  700: '#0596A8',
  glow: 'rgba(10, 240, 255, 0.35)',
};

export const text = {
  primary: '#EAF6F8',
  secondary: '#9FB4BC',
  tertiary: '#5E7178',
  disabled: '#3A4650',
  onAccent: '#02131A',
};

export const status = {
  live: '#3FE0A0',
  warning: '#F5A623',
  error: '#FF5A5F',
  errorGlow: 'rgba(255, 90, 95, 0.35)',
  offline: '#5A6B72',
};

/** Default, user-configurable knowledge graph category palette. */
export const categoryPalette = {
  technology: { base: '#3FE0FF', glow: 'rgba(63, 224, 255, 0.45)' }, // cyan
  document: { base: '#4C8DFF', glow: 'rgba(76, 141, 255, 0.45)' }, // blue
  aiModel: { base: '#B98CFF', glow: 'rgba(185, 140, 255, 0.45)' }, // violet
  person: { base: '#57E39A', glow: 'rgba(87, 227, 154, 0.45)' }, // green
  project: { base: '#F5B94C', glow: 'rgba(245, 185, 76, 0.45)' }, // amber
  memory: { base: '#FF7FB0', glow: 'rgba(255, 127, 176, 0.45)' }, // pink
  location: { base: '#57E39A', glow: 'rgba(87, 227, 154, 0.4)' }, // green (place)
  task: { base: '#F5B94C', glow: 'rgba(245, 185, 76, 0.4)' },
  automation: { base: '#B98CFF', glow: 'rgba(185, 140, 255, 0.4)' },
  webSource: { base: '#E7E9EC', glow: 'rgba(231, 233, 236, 0.35)' }, // external info
  general: { base: '#EAF6F8', glow: 'rgba(234, 246, 248, 0.3)' },
} as const;

export type GraphCategory = keyof typeof categoryPalette;

export const reactorState = {
  idle: { base: cyan[600], bright: cyan[400] },
  listening: { base: '#3FE0A0', bright: '#8CFFCF' },
  thinking: { base: cyan[500], bright: cyan[50] },
  tool: { base: '#F5B94C', bright: '#FFDA9B' },
  speaking: { base: cyan[400], bright: '#FFFFFF' },
  offline: { base: '#4A5960', bright: '#6E828A' },
  error: { base: '#FF5A5F', bright: '#FF9B9E' },
} as const;

export type ReactorStateName = keyof typeof reactorState;
