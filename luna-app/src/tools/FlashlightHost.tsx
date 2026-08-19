import React from 'react';
import { CameraView } from 'expo-camera';
import { useFlashlightStore } from './flashlight';

/**
 * expo-camera only exposes the torch through an active CameraView, so this
 * invisible 1x1 view stays mounted for the app's lifetime and mirrors the
 * flashlight store's `on` flag. It only opens the camera hardware once the
 * user (or Luna, on their behalf) actually turns the flashlight on.
 */
export function FlashlightHost() {
  const on = useFlashlightStore((s) => s.on);
  if (!on) return null;
  return (
    <CameraView
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      enableTorch
      facing="back"
      pointerEvents="none"
    />
  );
}
