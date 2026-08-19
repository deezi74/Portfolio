import React from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { GlassPanel } from './GlassPanel';
import { categoryPalette } from '../theme/colors';
import { text as textColor, type as t } from '../theme';
import type { GraphNode, GraphEdge } from '../graph/types';

interface Props {
  node: GraphNode;
  edges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onForget: (id: string) => void;
}

export function NodeInspector({ node, edges, allNodes, onClose, onForget }: Props) {
  const palette = categoryPalette[node.category];
  const connected = edges
    .filter((e) => e.source === node.id || e.target === node.id)
    .map((e) => (e.source === node.id ? e.target : e.source))
    .map((id) => allNodes.find((n) => n.id === id))
    .filter(Boolean) as GraphNode[];

  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown} style={styles.wrapper}>
      <GlassPanel intensity={55}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: palette.base }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{node.label}</Text>
            <Text style={[styles.category, { color: palette.base }]}>{formatCategory(node.category)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        {node.summary ? <Text style={styles.summary}>{node.summary}</Text> : null}

        {connected.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>CONNECTED</Text>
            <ScrollView style={{ maxHeight: 110 }}>
              {connected.map((n) => (
                <Text key={n.id} style={styles.connectionItem}>
                  • {n.label}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LAST UPDATED</Text>
          <Text style={styles.meta}>{formatRelative(node.lastUpdated)}</Text>
        </View>

        {node.source && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SOURCE</Text>
            <Text style={styles.meta}>{node.source}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <Pressable onPress={() => onForget(node.id)} style={styles.actionButton}>
            <Text style={styles.actionText}>FORGET</Text>
          </Pressable>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

function formatCategory(c: string) {
  return c.replace(/([A-Z])/g, ' $1').toUpperCase();
}

function formatRelative(ms: number) {
  const diff = Date.now() - ms;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    ...t.title,
    fontSize: 17,
    color: textColor.primary,
  },
  category: {
    ...t.hudLabel,
    marginTop: 2,
  },
  close: {
    color: textColor.secondary,
    fontSize: 16,
    padding: 4,
  },
  summary: {
    ...t.body,
    color: textColor.secondary,
    marginTop: 12,
    lineHeight: 21,
  },
  section: {
    marginTop: 14,
  },
  sectionTitle: {
    ...t.hudLabel,
    color: textColor.tertiary,
    marginBottom: 6,
  },
  connectionItem: {
    ...t.bodySmall,
    color: textColor.secondary,
    paddingVertical: 2,
  },
  meta: {
    ...t.bodySmall,
    color: textColor.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,90,95,0.35)',
  },
  actionText: {
    ...t.hudLabel,
    color: '#FF9B9E',
  },
});
