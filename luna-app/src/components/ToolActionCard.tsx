import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { status, text as textColor, type as t } from '../theme';

interface Props {
  label: string;
  statusText: string;
  active: boolean;
}

export function ToolActionCard({ label, statusText, active }: Props) {
  return (
    <Animated.View entering={FadeInUp.springify().damping(15)} exiting={FadeOutDown} style={styles.wrapper}>
      <GlassPanel intensity={45} style={styles.panel}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: active ? status.warning : status.live }]} />
          <View>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.status}>{statusText}</Text>
          </View>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 130,
    alignSelf: 'center',
  },
  panel: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    ...t.hudLabel,
    color: textColor.primary,
  },
  status: {
    ...t.caption,
    color: textColor.secondary,
    marginTop: 2,
  },
});
