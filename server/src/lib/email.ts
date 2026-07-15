import { env } from '../env';

// Sends the magic-link email via Resend when RESEND_API_KEY is set; otherwise
// logs the link to the server console so auth can be tested end-to-end in dev.
export async function sendMagicLink(email: string, link: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`\n[magic-link] ${email}\n  ${link}\n`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Log <onboarding@resend.dev>',
      to: email,
      subject: 'Your Log sign-in link',
      html: `<p>Tap to sign in:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
  }
}
