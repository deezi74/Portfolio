import { create } from 'zustand';
import { Camera } from 'expo-camera';

interface FlashlightState {
  on: boolean;
  available: boolean;
  setOn: (on: boolean) => Promise<boolean>;
  toggle: () => Promise<boolean>;
}

/**
 * expo-camera controls the torch via a mounted <CameraView enableTorch>
 * rather than an imperative call — App.tsx keeps one hidden 1x1 CameraView
 * alive and reads `on` from this store to drive its `enableTorch` prop.
 * This store is just the on/off intent + permission gate; the actual
 * hardware toggle happens in that view.
 */
export const useFlashlightStore = create<FlashlightState>((set, get) => ({
  on: false,
  available: true,

  setOn: async (on) => {
    if (on) {
      const { granted } = await Camera.requestCameraPermissionsAsync();
      if (!granted) {
        set({ available: false, on: false });
        return false;
      }
    }
    set({ on, available: true });
    return true;
  },

  toggle: async () => {
    return get().setOn(!get().on);
  },
}));
