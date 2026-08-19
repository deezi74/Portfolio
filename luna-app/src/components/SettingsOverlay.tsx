import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ScrollView, Switch, Alert } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassPanel } from './GlassPanel';
import { useSettingsStore } from '../state/useSettingsStore';
import { pickAndLoadLocalModel } from '../llm/localModelPicker';
import { getLocalModelStats } from '../llm/providers/localLlama';
import { listElevenLabsVoices } from '../voice/ttsElevenLabs';
import { text as textColor, cyan, type as t } from '../theme';
import type { CloudProviderId } from '../llm/types';
import type { PerformanceProfile } from '../theme/tokens';

const PROVIDER_LABELS: Record<CloudProviderId, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  google: 'Google',
};

const DEFAULT_MODEL_PLACEHOLDER: Record<CloudProviderId, string> = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-5',
  openrouter: 'openrouter/auto',
  google: 'gemini-2.5-flash',
};

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const settings = useSettingsStore();
  const [loadingModel, setLoadingModel] = useState(false);
  const [keyDrafts, setKeyDrafts] = useState<Partial<Record<CloudProviderId, string>>>({});

  const handlePickModel = async () => {
    try {
      setLoadingModel(true);
      const ok = await pickAndLoadLocalModel();
      if (ok) await settings.setActiveModelSource('local');
    } catch (e) {
      Alert.alert('Could not load model', e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModel(false);
    }
  };

  const saveKey = async (id: CloudProviderId) => {
    const key = keyDrafts[id]?.trim();
    if (!key) return;
    await settings.setCloudProvider(id, { apiKey: key, model: DEFAULT_MODEL_PLACEHOLDER[id] });
    await settings.setActiveModelSource(id);
  };

  const stats = getLocalModelStats();

  return (
    <Animated.View entering={SlideInDown.springify().damping(20)} exiting={SlideOutDown} style={styles.container}>
      <GlassPanel intensity={60} style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>SETTINGS</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Active model */}
          <Section title="INTELLIGENCE">
            <Row
              label="Local model"
              sub={settings.localModel.name ?? 'No model loaded'}
              active={settings.activeModelSource === 'local'}
              onPress={() => settings.setActiveModelSource('local')}
            />
            <Pressable style={styles.smallButton} onPress={handlePickModel} disabled={loadingModel}>
              <Text style={styles.smallButtonText}>{loadingModel ? 'LOADING…' : 'PICK .GGUF FILE'}</Text>
            </Pressable>
            {stats && (
              <View style={styles.hud}>
                <Text style={styles.hudText}>{stats.modelName}</Text>
                <Text style={styles.hudTextDim}>
                  {(stats.fileSizeBytes / 1e9).toFixed(1)} GB · {stats.backend}
                  {stats.tokensPerSecond ? ` · ${stats.tokensPerSecond.toFixed(1)} tok/s` : ''}
                </Text>
              </View>
            )}

            {(Object.keys(PROVIDER_LABELS) as CloudProviderId[]).map((id) => (
              <View key={id} style={styles.providerRow}>
                <Row
                  label={PROVIDER_LABELS[id]}
                  sub={settings.cloudProviders[id] ? 'Configured' : 'No API key'}
                  active={settings.activeModelSource === id}
                  onPress={() => settings.cloudProviders[id] && settings.setActiveModelSource(id)}
                />
                <TextInput
                  placeholder={`${PROVIDER_LABELS[id]} API key`}
                  placeholderTextColor={textColor.tertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  value={keyDrafts[id] ?? ''}
                  onChangeText={(v) => setKeyDrafts((s) => ({ ...s, [id]: v }))}
                  style={styles.input}
                />
                <Pressable style={styles.smallButton} onPress={() => saveKey(id)}>
                  <Text style={styles.smallButtonText}>SAVE KEY</Text>
                </Pressable>
              </View>
            ))}
          </Section>

          {/* Voice */}
          <Section title="VOICE">
            <ToggleRow
              label="Hands-free by default"
              value={settings.handsFreeDefault}
              onChange={(v) => settings.setVoiceSettings({ handsFreeDefault: v })}
            />
            <ToggleRow
              label="Captions"
              value={settings.captionsEnabled}
              onChange={(v) => settings.setVoiceSettings({ captionsEnabled: v })}
            />
            <ToggleRow
              label="Premium cloud voice (ElevenLabs)"
              value={settings.cloudVoiceEnabled}
              onChange={(v) => settings.setVoiceSettings({ cloudVoiceEnabled: v })}
            />
            {settings.cloudVoiceEnabled && (
              <>
                <TextInput
                  placeholder="ElevenLabs API key"
                  placeholderTextColor={textColor.tertiary}
                  secureTextEntry
                  autoCapitalize="none"
                  defaultValue={settings.elevenLabsApiKey ?? ''}
                  onChangeText={(v) => settings.setVoiceSettings({ elevenLabsApiKey: v })}
                  style={styles.input}
                />
                <TextInput
                  placeholder="Voice ID"
                  placeholderTextColor={textColor.tertiary}
                  autoCapitalize="none"
                  defaultValue={settings.elevenLabsVoiceId ?? ''}
                  onChangeText={(v) => settings.setVoiceSettings({ elevenLabsVoiceId: v })}
                  style={styles.input}
                />
                <Pressable
                  style={styles.smallButton}
                  onPress={async () => {
                    if (!settings.elevenLabsApiKey) return;
                    try {
                      const voices = await listElevenLabsVoices(settings.elevenLabsApiKey);
                      Alert.alert('Available voices', voices.map((v) => `${v.name} — ${v.voice_id}`).join('\n') || 'None found');
                    } catch (e) {
                      Alert.alert('Could not list voices', e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  <Text style={styles.smallButtonText}>LIST MY VOICES</Text>
                </Pressable>
              </>
            )}
          </Section>

          {/* System */}
          <Section title="SYSTEM">
            <View style={styles.pillRow}>
              {(['auto', 'high', 'balanced', 'battery'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => settings.setSystemSettings({ performanceProfile: p as PerformanceProfile | 'auto' })}
                  style={[styles.profilePill, settings.performanceProfile === p && styles.profilePillActive]}
                >
                  <Text style={[styles.profilePillText, settings.performanceProfile === p && styles.profilePillTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
            <ToggleRow label="OLED black mode" value={settings.oledMode} onChange={(v) => settings.setSystemSettings({ oledMode: v })} />
            <ToggleRow label="Haptics" value={settings.hapticsEnabled} onChange={(v) => settings.setSystemSettings({ hapticsEnabled: v })} />
            <ToggleRow label="Sounds" value={settings.soundsEnabled} onChange={(v) => settings.setSystemSettings({ soundsEnabled: v })} />
            <ToggleRow label="Parallax" value={settings.parallaxEnabled} onChange={(v) => settings.setSystemSettings({ parallaxEnabled: v })} />
          </Section>
        </ScrollView>
      </GlassPanel>
    </Animated.View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, sub, active, onPress }: { label: string; sub: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, active && styles.rowActive]}>
      <View>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      {active && <View style={styles.activeDot} />}
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: '#2A343A', true: cyan[700] }} thumbColor={cyan[400]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(1,3,5,0.6)',
  },
  panel: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '86%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { ...t.sectionTitle, color: textColor.primary },
  close: { color: textColor.secondary, fontSize: 18 },
  section: { marginTop: 18 },
  sectionTitle: { ...t.hudLabel, color: textColor.tertiary, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rowActive: { backgroundColor: 'rgba(10,240,255,0.08)' },
  rowLabel: { ...t.body, fontSize: 14, color: textColor.primary },
  rowSub: { ...t.caption, color: textColor.tertiary, marginTop: 2 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: cyan[400] },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  providerRow: { marginTop: 6, marginBottom: 10 },
  input: {
    color: textColor.primary,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 6,
    fontSize: 13,
  },
  smallButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(10,240,255,0.35)',
  },
  smallButtonText: { ...t.hudLabel, fontSize: 10, color: cyan[400] },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  profilePill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  profilePillActive: { backgroundColor: 'rgba(10,240,255,0.12)' },
  profilePillText: { ...t.hudLabel, fontSize: 10, color: textColor.tertiary },
  profilePillTextActive: { color: cyan[400] },
  hud: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(245,185,76,0.06)',
  },
  hudText: { ...t.hudValue, color: '#F5B94C' },
  hudTextDim: { ...t.caption, color: textColor.tertiary, marginTop: 2 },
});
