import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { env } from "../config/env.js";
import { smtpMailer } from "./mailer.js";

const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

// Tests must never be able to send a real email
if (env.SMTP_HOST !== "localhost") {
  throw new Error("Mailer tests only run against a local SMTP server (Mailpit)");
}

const messagesSchema = z.object({
  messages: z.array(
    z.object({
      Subject: z.string(),
      To: z.array(z.object({ Address: z.string() })),
    }),
  ),
});

async function waitForMessage(subject: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(`${mailpitUrl}/api/v1/messages`);
    const { messages } = messagesSchema.parse(await res.json());
    const found = messages.find((m) => m.Subject === subject);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Message "${subject}" never reached Mailpit`);
}

beforeEach(async () => {
  await fetch(`${mailpitUrl}/api/v1/messages`, { method: "DELETE" });
});

describe("smtpMailer", () => {
  it("delivers a message to the SMTP server", async () => {
    const subject = `Test ${randomUUID()}`;

    const { messageId } = await smtpMailer.send({
      to: "ana@example.com",
      subject,
      text: "Hola",
      html: "<p>Hola</p>",
    });

    expect(messageId).toBeTruthy();
    const message = await waitForMessage(subject);
    expect(message.To[0]?.Address).toBe("ana@example.com");
  });
});
