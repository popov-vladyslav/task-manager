import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/header';
import { useUiStore } from '../../store/ui';
import { useTheme, type Theme } from '../../theme';

export default function CountdownRoute() {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const openDrawer = useUiStore((s) => s.openDrawer);
  return (
    <View style={styles.root}>
      <Header title="Countdown" onLeftPress={openDrawer} right={<View style={styles.spacer} />} />
      <View style={styles.body}>
        <Text style={styles.text}>Countdowns arrive in a later phase.</Text>
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.colors.bgBase },
    spacer: { width: 38, height: 38 },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    text: { fontSize: 14, color: t.colors.textMuted, textAlign: 'center' },
  });
