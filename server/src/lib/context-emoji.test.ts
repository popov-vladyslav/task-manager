import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextEmoji, firstGrapheme, isSingleGrapheme } from '@task-manager/shared';

test('single grapheme accepts one emoji, including ZWJ sequences and flags', () => {
  assert.equal(isSingleGrapheme('💼'), true);
  assert.equal(isSingleGrapheme('👨‍👩‍👧‍👦'), true);
  assert.equal(isSingleGrapheme('🇺🇦'), true);
  assert.equal(isSingleGrapheme(' 🔥 '), true);
});

test('single grapheme rejects empty, multiple emoji and words', () => {
  assert.equal(isSingleGrapheme(''), false);
  assert.equal(isSingleGrapheme('💼💼'), false);
  assert.equal(isSingleGrapheme('ab'), false);
});

test('firstGrapheme keeps a whole cluster from a paste', () => {
  assert.equal(firstGrapheme('👨‍👩‍👧‍👦🔥🔥'), '👨‍👩‍👧‍👦');
  assert.equal(firstGrapheme('  '), '');
});

test('contextEmoji prefers the stored emoji over the derived one', () => {
  assert.equal(contextEmoji({ emoji: '💼', color: '#5B8DEF' }), '💼');
  assert.equal(contextEmoji({ emoji: null, color: '#5B8DEF' }), '🔵');
  assert.equal(contextEmoji({ emoji: '', color: null }), null);
});
