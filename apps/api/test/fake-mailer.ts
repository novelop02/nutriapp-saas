import type { MailMessage, Mailer } from "../src/lib/mailer.js";

export function fakeMailer() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = {
    send: (message) => {
      sent.push(message);
      return Promise.resolve({ messageId: `fake-${sent.length}` });
    },
  };
  return { mailer, sent };
}
