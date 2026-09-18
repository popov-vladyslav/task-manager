import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

const ART = {
  cardFill: '#10151C',
  cardStroke: '#2C3542',
  backCard1: '#1B222B',
  backCard2: '#222A35',
  addRing: '#5A4520',
  rows: [
    { y: 76, x2: 168, opacity: 0.95, ring: '#333C4A', dots: '#2B3340' },
    { y: 102, x2: 146, opacity: 0.62, ring: '#2C3542', dots: '#272F3B' },
    { y: 128, x2: 122, opacity: 0.33, ring: '#252D38', dots: '#222A34' },
  ],
};

function EmptyListIllustration({ label }: { label: string }) {
  const t = useTheme();
  const accent = t.colors.accentPrimary;
  return (
    <Svg
      width={228}
      height={172}
      viewBox="0 0 228 172"
      fill="none"
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Defs>
        <RadialGradient id="emptyGlow" cx="50%" cy="46%" r="50%">
          <Stop offset="0%" stopColor={accent} stopOpacity={0.1} />
          <Stop offset="55%" stopColor={accent} stopOpacity={0.03} />
          <Stop offset="100%" stopColor={accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={114} cy={80} rx={104} ry={76} fill="url(#emptyGlow)" />
      <Rect
        x={52}
        y={16}
        width={124}
        height={20}
        rx={7}
        stroke={ART.backCard1}
        strokeWidth={1.4}
        transform="rotate(-5 114 26)"
      />
      <Rect
        x={44}
        y={30}
        width={140}
        height={22}
        rx={8}
        stroke={ART.backCard2}
        strokeWidth={1.4}
        transform="rotate(-2.5 114 41)"
      />
      <Rect
        x={30}
        y={50}
        width={168}
        height={104}
        rx={16}
        fill={ART.cardFill}
        stroke={ART.cardStroke}
        strokeWidth={1.5}
      />
      {ART.rows.map((r) => (
        <G key={r.y} opacity={r.opacity}>
          <Circle cx={56} cy={r.y} r={7.5} stroke={r.ring} strokeWidth={1.5} />
          <Path
            d={`M74 ${r.y}H${r.x2}`}
            stroke={r.dots}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="1 9"
          />
        </G>
      ))}
      <Circle cx={198} cy={150} r={17} fill={t.colors.bgBase} />
      <Circle
        cx={198}
        cy={150}
        r={17}
        stroke={ART.addRing}
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
      <Path
        d="M198 143.5v13M191.5 150h13"
        stroke={accent}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.85}
      />
    </Svg>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <View style={styles.root}>
      <EmptyListIllustration label={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
});
