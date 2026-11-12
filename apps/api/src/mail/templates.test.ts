import { describe, expect, it } from "vitest";
import { escapeHtml, invitationEmail } from "./templates.js";

const base = {
  to: "ana@example.com",
  patientFirstName: "Ana",
  link: "http://localhost:3000/invitations#token=abc",
  expiresInHours: 72,
};

describe("escapeHtml", () => {
  it("neutralizes markup characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
    );
  });
});

describe("invitationEmail", () => {
  it("includes the link in both the text and the HTML versions", () => {
    const mail = invitationEmail(base);

    expect(mail.to).toBe("ana@example.com");
    expect(mail.text).toContain(base.link);
    expect(mail.html).toContain(`href="${base.link}"`);
    expect(mail.text).toContain("72 horas");
  });

  it("escapes the patient's name in the HTML", () => {
    const mail = invitationEmail({ ...base, patientFirstName: "<img src=x onerror=alert(1)>" });

    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("refuses links that are not http or https", () => {
    expect(() => invitationEmail({ ...base, link: "javascript:alert(1)" })).toThrow();
    expect(() => invitationEmail({ ...base, link: "data:text/html,hi" })).toThrow();
  });
});
