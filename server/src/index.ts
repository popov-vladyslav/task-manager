import { env } from './env';
import { createApp } from './app';
import { usingSandboxSender } from './lib/email';
import { startScheduler } from './scheduler';

// Safety net: a stray async rejection (e.g. a background job hitting a transient
// DB/network error) should be logged, not crash the always-on service.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});

// Sign-in codes are undeliverable to anyone but the Resend account owner while
// the sandbox sender is in use. Harmless for the single-owner deployment; a
// launch blocker the moment sign-up is open to other people.
if (env.APP_ENV === 'prod' && usingSandboxSender) {
  console.warn(
    '[mail] WARNING: prod is using Resend\'s sandbox sender. Confirmation codes ' +
      'will only reach the Resend account owner. Set MAIL_FROM to an address on ' +
      'a verified domain before opening sign-up.',
  );
}

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  startScheduler();
});
