import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { categoryPalette, type GraphCategory } from '../theme/colors';
import { text as textColor, type as t } from '../theme';

interface Props {
  hidden: Set<GraphCategory>;
  onToggle: (category: GraphCategory) => void;
  onClose: () => void;
}

const LABELS: Record<GraphCategory, string> = {
  technology: 'Technology',
  document: 'Documents',
  aiModel: 'AI Models',
  person: 'People',
  project: 'Projects',
  memory: 'Memories',
  location: 'Locations',
  task: 'Tasks',
  automation: 'Automations',
  webSource: 'Web Sources',
  general: 'General',
};

export function FilterSheet({ hidden, onToggle, onClose }: Props) {
  return (
    <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown} style={styles.wrapper}>
      <GlassPanel intensity={55}>
        <View style={styles.header}>
          <Text style={styles.title}>FILTERS</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {(Object.keys(LABELS) as GraphCategory[]).map((cat) => {
            const isHidden = hidden.has(cat);
            const palette = categoryPalette[cat];
            return (
              <Pressable key={cat} onPress={() => onToggle(cat)} style={[styles.pill, isHidden && styles.pillDim]}>
                <View style={[styles.swatch, { backgroundColor: palette.base, opacity: isHidden ? 0.25 : 1 }]} />
                <Text style={[styles.pillText, isHidden && styles.pillTextDim]}>{LABELS[cat]}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    ...t.sectionTitle,
    color: textColor.primary,
  },
  close: {
    color: textColor.secondary,
    fontSize: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillDim: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  swatch: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  pillText: {
    ...t.bodySmall,
    color: textColor.primary,
  },
  pillTextDim: {
    color: textColor.tertiary,
  },
});
