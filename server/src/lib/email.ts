import { env } from '../env';

// Product name as it appears to the user — subject line, From name and body.
export const PRODUCT_NAME = 'task manager';

// Resend's shared sandbox sender. It only delivers to the Resend account
// owner's own verified address, so it is a dev/stage convenience only — open
// sign-up on it would silently drop every other user's confirmation code.
const SANDBOX_FROM = `${PRODUCT_NAME} <onboarding@resend.dev>`;

// Set MAIL_FROM (an address on a Resend-verified domain) in prod.
export const FROM = env.MAIL_FROM ?? SANDBOX_FROM;

// True when mail can only reach the Resend account owner — used to fail loudly
// rather than pretend a confirmation code was delivered.
export const usingSandboxSender = FROM === SANDBOX_FROM;

export const MAGIC_LINK_SUBJECT = `Your ${PRODUCT_NAME} sign-in code`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The sign-in email carries both a tap-to-open link and the raw token, because
// the app also accepts the token pasted into its "paste your code" field. The
// token gets its own monospaced block on its own line so it is easy to select.
export function buildMagicLinkEmail(link: string, token: string): { html: string; text: string } {
  const safeLink = escapeHtml(link);
  const safeToken = escapeHtml(token);

  const html = [
    `<p>Tap to sign in to ${PRODUCT_NAME}:</p>`,
    `<p><a href="${safeLink}">${safeLink}</a></p>`,
    `<p>Or paste this code into the app:</p>`,
    `<p style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;` +
      `word-break:break-all;background:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;` +
      `padding:12px 14px;margin:0 0 16px">${safeToken}</p>`,
    `<p>This code expires in 15 minutes.</p>`,
  ].join('');

  // Plain-text fallback: the token sits alone on its own line so a mail client
  // (or a human double-click) selects exactly the token and nothing else.
  const text = [
    `Sign in to ${PRODUCT_NAME}:`,
    link,
    '',
    'Or paste this code into the app:',
    '',
    token,
    '',
    'This code expires in 15 minutes.',
  ].join('\n');

  return { html, text };
}

// Sends the sign-in email via Resend when RESEND_API_KEY is set; otherwise logs
// the link and code to the server console so auth can be tested end-to-end in dev.
export async function sendMagicLink(email: string, link: string, token: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n[magic-link] ${email}\n  link: ${link}\n  code: ${token}\n`);
    return;
  }

  const { html, text } = buildMagicLinkEmail(link, token);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: email,
      subject: MAGIC_LINK_SUBJECT,
      html,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }
}
