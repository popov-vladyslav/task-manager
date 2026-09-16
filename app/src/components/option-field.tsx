import { forwardRef, useImperativeHandle, useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Popover, usePopoverAnchor } from './popover';
import { useTheme, type Theme } from '../theme';

export interface OptionFieldHandle {
  open: () => void;
}

export interface Option<T> {
  value: T;
  label: string;
}

interface OptionFieldProps<T> {
  value: T;
  label?: string;
  options: Option<T>[];
  onChange: (value: T) => void;
  closeOnPick?: (value: T) => boolean;
  footer?: ReactNode;
  width?: number;
  listHeight?: number;
}

const ROW_HEIGHT = 36;

function OptionFieldInner<T extends string | number | null>(
  {
    value,
    label,
    options,
    onChange,
    closeOnPick,
    footer,
    width = 200,
    listHeight,
  }: OptionFieldProps<T>,
  ref: React.ForwardedRef<OptionFieldHandle>,
) {
  const t = useTheme();
  const styles = useMemo(() => makeStyles(t), [t]);
  const popover = usePopoverAnchor();
  useImperativeHandle(ref, () => ({ open: popover.open }));
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const offset = useMemo(
    () => ({
      x: 0,
      y: listHeight ? Math.max(0, selectedIndex * ROW_HEIGHT - listHeight / 2 + ROW_HEIGHT / 2) : 0,
    }),
    [selectedIndex, listHeight],
  );
  const listStyle = useMemo(
    () => (listHeight ? StyleSheet.create({ list: { height: listHeight } }).list : undefined),
    [listHeight],
  );
  const shown = label ?? options.find((o) => o.value === value)?.label ?? '';

  return (
    <>
      <View ref={popover.ref} collapsable={false} style={styles.value}>
        <Text style={styles.valueText}>{shown}</Text>
      </View>
      <Popover anchor={popover.anchor} onClose={popover.close} width={width}>
        <ScrollView
          style={listStyle}
          contentOffset={offset}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                onPress={() => {
                  onChange(o.value);
                  if (closeOnPick?.(o.value) ?? true) popover.close();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [styles.row, (pressed || on) && styles.rowOn]}
              >
                <Text style={[styles.rowText, on && styles.rowTextOn]}>{o.label}</Text>
                {on ? <Check size={14} color={t.colors.accentPrimary} strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
        {footer}
      </Popover>
    </>
  );
}

export const OptionField = forwardRef(OptionFieldInner) as <T extends string | number | null>(
  props: OptionFieldProps<T> & { ref?: React.Ref<OptionFieldHandle> },
) => React.ReactElement;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    value: { paddingVertical: 2 },
    valueText: {
      fontFamily: t.fonts.mono,
      fontSize: 13.5,
      fontWeight: '700',
      color: t.colors.accentPrimary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: ROW_HEIGHT,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    rowOn: { backgroundColor: t.colors.bgControl },
    rowText: { fontSize: 14, fontWeight: '600', color: t.colors.textPrimary },
    rowTextOn: { color: t.colors.accentPrimary },
  });
