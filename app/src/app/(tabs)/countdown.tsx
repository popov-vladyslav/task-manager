import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Header } from '../../components/header';
import { WideSidebar } from '../../features/nav/wide-sidebar';
import { useT } from '../../lib/i18n';
import { useUiStore } from '../../store/ui';
import { useTheme, type Theme } from '../../theme';

export default function CountdownRoute() {
  const t = useTheme();
  const tr = useT();
  const styles = useMemo(() => makeStyles(t), [t]);
  const { width } = useWindowDimensions();
  const wide = width >= t.sizes.wideBreakpoint;
  const openDrawer = useUiStore((s) => s.openDrawer);

  const body = (
    <View style={styles.body}>
      <Text style={styles.text}>{tr('nav.countdownPlaceholder')}</Text>
    </View>
  );

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <WideSidebar />
        <View style={styles.flex1}>
          <Header
            title={tr('nav.countdown')}
            leftNode={null}
            right={<View style={styles.spacer} />}
            align="start"
            horizontalPadding={20}
          />
          {body}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Header
        title={tr('nav.countdown')}
        onLeftPress={openDrawer}
        right={<View style={styles.spacer} />}
      />
      {body}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    flex1: { flex: 1 },
    root: { flex: 1, backgroundColor: t.colors.bgBase },
    wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: t.colors.bgBase },
    spacer: { width: 38, height: 38 },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    text: { fontSize: 14, color: t.colors.textMuted, textAlign: 'center' },
  });
