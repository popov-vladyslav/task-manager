import { forwardRef, useMemo } from 'react';
import { OptionField, type OptionFieldHandle } from '../../components/option-field';
import { currentT, useT, type T } from '../../lib/i18n';

const STEP = 15;
const MAX_MIN = 480;
const OPTIONS = Array.from({ length: MAX_MIN / STEP }, (_, i) => (i + 1) * STEP);

export type DurationFieldHandle = OptionFieldHandle;

function formatDurationWith(tr: T, minutes: number): string {
  if (minutes < 60) return tr('common.minutesShort', { n: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? tr('common.hoursShort', { n: h }) : tr('common.hoursMinutesShort', { h, m });
}

export function formatDuration(minutes: number): string {
  return formatDurationWith(currentT(), minutes);
}

export const DurationField = forwardRef<
  DurationFieldHandle,
  { value: number; onChange: (min: number) => void }
>(function DurationField({ value, onChange }, ref) {
  const tr = useT();
  const options = useMemo(
    () => OPTIONS.map((m) => ({ value: m, label: formatDurationWith(tr, m) })),
    [tr],
  );
  return (
    <OptionField
      ref={ref}
      value={value}
      label={formatDurationWith(tr, value)}
      options={options}
      onChange={onChange}
      width={180}
      listHeight={288}
    />
  );
});
