import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMagicLinkEmail, MAGIC_LINK_SUBJECT, PRODUCT_NAME } from './email';

const LINK = 'https://task-tracker.net/auth?token=abc123';
const TOKEN = 'abc123';

test('the product name is "task manager", never "Log"', () => {
  assert.equal(PRODUCT_NAME, 'task manager');
  assert.match(MAGIC_LINK_SUBJECT, /task manager/);

  const { html, text } = buildMagicLinkEmail(LINK, TOKEN);
  for (const body of [MAGIC_LINK_SUBJECT, html, text]) {
    assert.match(body, /task manager/);
    assert.doesNotMatch(body, /\bLog\b/);
  }
});

test('html renders the token in its own block, apart from the link', () => {
  const { html } = buildMagicLinkEmail(LINK, TOKEN);
  // The token block is a <p> of its own, so it renders on its own line.
  const block = html.match(/<p style="font-family:[^"]*">([^<]*)<\/p>/);
  assert.ok(block, 'expected a styled token block');
  assert.equal(block[1], TOKEN);
  assert.match(block[0], /monospace/);
});

test('plain-text fallback puts the token alone on its own line', () => {
  const { text } = buildMagicLinkEmail(LINK, TOKEN);
  const lines = text.split('\n');
  assert.ok(lines.includes(TOKEN), 'token should occupy a whole line');
  assert.ok(lines.includes(LINK), 'link should occupy a whole line');
  assert.match(text, /expires in 15 minutes/);
});

test('link and token are html-escaped', () => {
  const { html } = buildMagicLinkEmail('https://x.test/auth?a=1&b=2', '<script>x</script>');
  assert.match(html, /a=1&amp;b=2/);
  assert.doesNotMatch(html, /<script>/);
});
