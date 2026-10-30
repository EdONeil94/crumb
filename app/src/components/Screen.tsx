import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

export function Placeholder({ text }: { text: string }) {
  return <Text style={styles.placeholder}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.parchment, padding: 20 },
  title: { fontSize: 28, fontWeight: '700', color: colors.espresso, marginBottom: 12 },
  placeholder: { color: colors.textMuted, fontSize: 16 },
});
