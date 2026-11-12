import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

// SMTP today (Mailpit locally), SES in week 14, a fake in tests
export interface Mailer {
  send(message: MailMessage): Promise<{ messageId: string }>;
}

export function createSmtpMailer(opts: { host: string; port: number; from: string }): Mailer {
  const transport = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
  });

  return {
    async send(message) {
      const info = await transport.sendMail({ from: opts.from, ...message });
      return { messageId: info.messageId };
    },
  };
}

export const smtpMailer = createSmtpMailer({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  from: env.MAIL_FROM,
});
