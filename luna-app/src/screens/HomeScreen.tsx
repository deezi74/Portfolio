import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { GraphCanvas } from '../graph/GraphCanvas';
import { LunaReactor } from '../reactor/LunaReactor';
import { TopStatusBar } from '../components/TopStatusBar';
import { CommandBar } from '../components/CommandBar';
import { NodeInspector } from '../components/NodeInspector';
import { FilterSheet } from '../components/FilterSheet';
import { ToolActionCard } from '../components/ToolActionCard';
import { MemorySavedToast } from '../components/MemorySavedToast';
import { VoiceModeOverlay } from '../components/VoiceModeOverlay';
import { SettingsOverlay } from '../components/SettingsOverlay';

import { useGraphStore } from '../state/useGraphStore';
import { useSettingsStore } from '../state/useSettingsStore';
import { useLunaAssistant } from '../assistant/useLunaAssistant';
import { bg, text as textColor } from '../theme';
import type { PerformanceProfile } from '../theme/tokens';
import type { GraphCategory } from '../theme/colors';

export function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const graph = useGraphStore();
  const settings = useSettingsStore();
  const assistant = useLunaAssistant();

  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVoiceMode, setShowVoiceMode] = useState(false);
  const [hiddenCategories, setHiddenCategories] = useState<Set<GraphCategory>>(new Set());
  const [memoryPulse, setMemoryPulse] = useState(false);

  useEffect(() => {
    graph.init();
    settings.hydrate();
  }, []);

  // Pulse "memory saved" whenever a memory-category node appears.
  const memoryCount = useMemo(() => graph.nodes.filter((n) => n.category === 'memory').length, [graph.nodes]);
  const prevMemoryCountRef = React.useRef(memoryCount);
  useEffect(() => {
    if (memoryCount > prevMemoryCountRef.current) {
      setMemoryPulse(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setMemoryPulse(false), 1100);
    }
    prevMemoryCountRef.current = memoryCount;
  }, [memoryCount]);

  const visibleNodes = useMemo(
    () => [...graph.nodes, ...graph.webSourceNodes].filter((n) => !hiddenCategories.has(n.category)),
    [graph.nodes, graph.webSourceNodes, hiddenCategories],
  );

  const resolvedProfile: PerformanceProfile = settings.performanceProfile === 'auto' ? 'high' : settings.performanceProfile;

  const selectedNode = graph.selectedNodeId ? graph.nodes.find((n) => n.id === graph.selectedNodeId) ?? null : null;

  const toggleCategory = useCallback((cat: GraphCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const modelLabel =
    settings.activeModelSource === 'local'
      ? `LOCAL${settings.localModel.name ? ' • ' + settings.localModel.name.replace('.gguf', '').toUpperCase() : ''}`
      : settings.activeModelSource.toUpperCase();

  const graphHeight = height - insets.top - 210;

  return (
    <View style={[styles.root, { backgroundColor: settings.oledMode ? bg.oled : bg.edge }]}>
      <TopStatusBar modelLabel={modelLabel} online={settings.activeModelSource !== 'local'} onOpenSettings={() => setShowSettings(true)} />

      <View style={{ height: graphHeight }}>
        <GraphCanvas
          nodes={visibleNodes}
          edges={graph.edges}
          width={width}
          height={graphHeight}
          selectedNodeId={graph.selectedNodeId}
          retrievalPath={graph.retrievalPath}
          dimmed={showVoiceMode}
          performanceProfile={resolvedProfile}
          onSelectNode={graph.select}
          onOpenDetail={graph.select}
          onOpenActions={graph.select}
        />

        <Pressable
          style={[styles.reactorFab, { top: 12, right: 12 }]}
          onPress={() => setShowVoiceMode(true)}
        >
          <LunaReactor
            size={64}
            state={assistant.reactorState}
            amplitude={assistant.amplitude}
            showParticleTrails={resolvedProfile !== 'battery'}
          />
        </Pressable>

        <View style={[styles.hudRow, { top: 12, left: 12 }]}>
          <Pressable onPress={() => setShowFilters((v) => !v)} style={styles.hudButton}>
            <Text style={styles.hudButtonText}>FILTERS</Text>
          </Pressable>
        </View>

        {assistant.toolCard && (
          <ToolActionCard label={assistant.toolCard.label} statusText={assistant.toolCard.statusText} active={assistant.toolCard.active} />
        )}
        <MemorySavedToast visible={memoryPulse} />
      </View>

      {selectedNode && !showFilters && (
        <NodeInspector
          node={selectedNode}
          edges={graph.edges}
          allNodes={graph.nodes}
          onClose={() => graph.select(null)}
          onForget={(id) => graph.removeNode(id)}
        />
      )}

      {showFilters && <FilterSheet hidden={hiddenCategories} onToggle={toggleCategory} onClose={() => setShowFilters(false)} />}

      <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 10 }}>
        <CommandBar
          onSend={assistant.sendText}
          onMicPress={assistant.toggleHandsFree}
          onVoiceModePress={() => setShowVoiceMode(true)}
          listening={assistant.reactorState === 'listening'}
          speaking={assistant.reactorState === 'speaking'}
          onStopSpeaking={assistant.interrupt}
        />
      </View>

      <VoiceModeOverlay
        visible={showVoiceMode}
        state={assistant.reactorState}
        amplitude={assistant.amplitude}
        handsFree={assistant.handsFree}
        partialTranscript={assistant.partialTranscript}
        lastUserText={assistant.lastUserText}
        lastAssistantText={assistant.lastAssistantText}
        streamingText={assistant.streamingText}
        captionsEnabled={settings.captionsEnabled}
        onToggleHandsFree={assistant.toggleHandsFree}
        onClose={() => setShowVoiceMode(false)}
      />

      {showSettings && <SettingsOverlay onClose={() => setShowSettings(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  reactorFab: {
    position: 'absolute',
  },
  hudRow: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 8,
  },
  hudButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hudButtonText: {
    color: textColor.secondary,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },
});
