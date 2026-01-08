import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { OpaqueColorValue, StyleProp, ViewStyle } from 'react-native';

const MAPPING = {
  'chart.bar.fill': 'bar-chart',
  'list.bullet': 'list',
  'dollarsign.circle.fill': 'attach-money',
  'person.fill': 'person',
} as Partial<
  Record<string, React.ComponentProps<typeof MaterialIcons>['name']>
>;

export type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
