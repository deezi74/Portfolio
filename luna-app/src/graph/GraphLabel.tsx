import React, { useMemo } from 'react';
import { Text, matchFont } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { LabelPlacement } from './useLabelLayout';

const font = matchFont({ fontFamily: 'sans-serif', fontSize: 11, fontStyle: 'normal', fontWeight: 'normal' });

interface Props {
  id: string;
  text: string;
  placements: SharedValue<Record<string, LabelPlacement>>;
  emphasis?: boolean;
}

export const GraphLabel = React.memo(function GraphLabel({ id, text, placements, emphasis }: Props) {
  const x = useDerivedValue(() => (placements.value[id]?.x ?? -1000) - (text.length * 3.2));
  const y = useDerivedValue(() => (placements.value[id]?.y ?? -1000) + 26);
  const opacity = useDerivedValue(() => (placements.value[id]?.visible ? 1 : 0));

  return (
    <Text
      x={x}
      y={y}
      text={text}
      font={font}
      color={emphasis ? '#FFFFFF' : '#B9CDD3'}
      opacity={opacity}
    />
  );
});
