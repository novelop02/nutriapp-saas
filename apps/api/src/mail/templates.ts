import type { MailMessage } from "../lib/mailer.js";

// User data goes into HTML: escape it, or a name like <script> becomes markup
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertWebLink(link: string): void {
  // Blocks javascript:, data: and anything that is not a plain web link
  if (!/^https?:\/\//i.test(link)) throw new Error("Email links must use http or https");
}

export function invitationEmail(input: {
  to: string;
  patientFirstName: string;
  link: string;
  expiresInHours: number;
}): MailMessage {
  assertWebLink(input.link);
  const name = escapeHtml(input.patientFirstName);
  const link = escapeHtml(input.link);

  return {
    to: input.to,
    subject: "Tu nutriólogo te invitó a NutriApp",
    text: [
      `Hola ${input.patientFirstName}:`,
      "",
      `Tu nutriólogo te invitó a NutriApp. Crea tu contraseña con este enlace (vale ${input.expiresInHours} horas):`,
      "",
      input.link,
      "",
      "Si no esperabas este correo, ignóralo.",
    ].join("\n"),
    html: [
      `<p>Hola ${name}:</p>`,
      `<p>Tu nutriólogo te invitó a NutriApp. Crea tu contraseña con este enlace (vale ${input.expiresInHours} horas):</p>`,
      `<p><a href="${link}">Aceptar invitación</a></p>`,
      "<p>Si no esperabas este correo, ignóralo.</p>",
    ].join("\n"),
  };
}
