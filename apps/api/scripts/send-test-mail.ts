import { smtpMailer } from "../src/lib/mailer.js";
import { invitationEmail } from "../src/mail/templates.js";

const message = invitationEmail({
  to: "ana@example.com",
  patientFirstName: "Ana <b>escaped</b>",
  link: "http://localhost:3000/invitations#token=test",
  expiresInHours: 72,
});

const { messageId } = await smtpMailer.send(message);
console.log("Sent", messageId, "- open http://localhost:8025");
