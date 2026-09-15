import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmtWhen, parseWhen } from './when';

test('an explicit offset or Z is taken as given', () => {
  assert.equal(parseWhen('2026-09-15T18:00:00Z').toISOString(), '2026-09-15T18:00:00.000Z');
  assert.equal(parseWhen('2026-09-15T18:00:00+02:00').toISOString(), '2026-09-15T16:00:00.000Z');
});

test('a zone-less value is Europe/Warsaw wall-clock (CEST in September, CET in January)', () => {
  assert.equal(parseWhen('2026-09-15T18:00:00').toISOString(), '2026-09-15T16:00:00.000Z');
  assert.equal(parseWhen('2026-09-15 18:00').toISOString(), '2026-09-15T16:00:00.000Z');
  assert.equal(parseWhen('2026-01-15T18:00').toISOString(), '2026-01-15T17:00:00.000Z');
  assert.equal(parseWhen('2026-09-15').toISOString(), '2026-09-14T22:00:00.000Z');
});

test('the DST switch day resolves to the wall-clock the user typed', () => {
  assert.equal(parseWhen('2026-10-25T12:00').toISOString(), '2026-10-25T11:00:00.000Z');
  assert.equal(parseWhen('2026-03-29T12:00').toISOString(), '2026-03-29T10:00:00.000Z');
});

test('fmtWhen prints the Warsaw wall-clock of a UTC instant', () => {
  assert.equal(fmtWhen('2026-09-15T16:00:00.000Z'), '2026-09-15 18:00');
  assert.equal(fmtWhen(new Date('2026-01-15T17:00:00.000Z')), '2026-01-15 18:00');
  assert.equal(fmtWhen('nonsense'), 'nonsense');
});

test('parse and format round-trip', () => {
  assert.equal(fmtWhen(parseWhen('2026-09-15 18:00')), '2026-09-15 18:00');
});
