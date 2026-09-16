import { forwardRef } from 'react';
import { OptionField, type OptionFieldHandle } from './option-field';

const STEP = 15;
const MAX_MIN = 480;
const OPTIONS = Array.from({ length: MAX_MIN / STEP }, (_, i) => (i + 1) * STEP);

export type DurationFieldHandle = OptionFieldHandle;

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const DURATION_OPTIONS = OPTIONS.map((m) => ({ value: m, label: formatDuration(m) }));

export const DurationField = forwardRef<
  DurationFieldHandle,
  { value: number; onChange: (min: number) => void }
>(function DurationField({ value, onChange }, ref) {
  return (
    <OptionField
      ref={ref}
      value={value}
      label={formatDuration(value)}
      options={DURATION_OPTIONS}
      onChange={onChange}
      width={180}
      listHeight={288}
    />
  );
});
