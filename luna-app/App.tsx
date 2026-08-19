import React from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { HomeScreen } from './src/screens/HomeScreen';
import { FlashlightHost } from './src/tools/FlashlightHost';
import { bg } from './src/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <LinearGradient colors={[bg.center, bg.edge]} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.15 }} end={{ x: 0.5, y: 1 }} />
        <StatusBar style="light" />
        <HomeScreen />
        <FlashlightHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
