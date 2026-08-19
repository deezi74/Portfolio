import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cyan, status, text as textColor, type as t } from '../theme';
import { useSettingsStore } from '../state/useSettingsStore';

interface Props {
  modelLabel: string;
  online: boolean;
  onOpenSettings: () => void;
}

export function TopStatusBar({ modelLabel, online, onOpenSettings }: Props) {
  const insets = useSafeAreaInsets();
  const privacyMode = useSettingsStore((s) => s.activeModelSource === 'local');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <View style={styles.brandRow}>
        <View>
          <Text style={styles.brand}>L U N A</Text>
          <Text style={styles.subtitle}>PERSONAL INTELLIGENCE</Text>
        </View>
        <Pressable onPress={onOpenSettings} hitSlop={12} style={styles.settingsButton}>
          <View style={styles.settingsDot} />
          <View style={styles.settingsDot} />
          <View style={styles.settingsDot} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        <Chip color={status.live} label="LIVE" dot />
        <Chip color={online ? cyan[400] : status.offline} label={online ? 'ONLINE' : 'OFFLINE'} dot />
        <Chip color={cyan[400]} label={modelLabel} />
        {privacyMode && <Chip color={textColor.secondary} label="PRIVATE" />}
      </View>
    </View>
  );
}

function Chip({ color, label, dot }: { color: string; label: string; dot?: boolean }) {
  return (
    <View style={styles.chip}>
      {dot && <View style={[styles.dot, { backgroundColor: color, shadowColor: color }]} />}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brand: {
    ...t.brand,
    color: textColor.primary,
  },
  subtitle: {
    ...t.hudLabel,
    color: textColor.tertiary,
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  settingsDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: textColor.secondary,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  chipText: {
    ...t.hudLabel,
    fontSize: 10,
  },
});
