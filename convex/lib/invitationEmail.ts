/**
 * The invitation email's words.
 *
 * A pure function with no imports, deliberately: the copy is the part most
 * likely to change, it is the part worth asserting on, and keeping it free of
 * the Resend client means it can be unit-tested with no component registration
 * and no risk of a test sending anything.
 *
 * Both the plain-text and HTML parts are produced from the same inputs in the
 * same call, so the promise about seven days cannot be updated in one and left
 * stale in the other. The text part is not a courtesy — plenty of school mail
 * clients strip HTML, and having one materially improves inbox placement.
 *
 * There is no unsubscribe link and there must never be one. This is
 * transactional mail to a provisioned employee about their own account;
 * offering to unsubscribe from your own credentials is nonsense, and routing
 * it through a marketing audience would be worse.
 */

export type InvitationEmail = { subject: string; text: string; html: string };

/** Kept in sync with `INVITE_TTL_MS` by hand — both live one import apart. */
const EXPIRY_PHRASE = "7 days";

/** Minimal escaping: every interpolated value is school-entered free text. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInvitationEmail(args: {
  firstName: string;
  invitedBy: string;
  link: string;
}): InvitationEmail {
  const { firstName, invitedBy, link } = args;

  const subject = "Your Cliffview Academy account is ready";

  const text = [
    `Hello ${firstName},`,
    "",
    `${invitedBy} has set up a Cliffview Academy account for you. Cliffview`,
    "Academy is where the school's training modules and your CPTD record live.",
    "",
    "Set your password and sign in here:",
    "",
    link,
    "",
    `The link works once and expires in ${EXPIRY_PHRASE}. If it has expired, ask`,
    `${invitedBy} to send you a new one.`,
    "",
    "If you were not expecting this, you can ignore it — nothing happens to",
    "your details until the link is used.",
    "",
    "Cliffview Academy",
    "This mailbox is not monitored. Please reply to whoever invited you.",
  ].join("\n");

  const safeName = escapeHtml(firstName);
  const safeInviter = escapeHtml(invitedBy);
  const safeLink = escapeHtml(link);

  // Inline styles only, no <style> block, no web fonts, no images and no
  // tracking pixel: anything else is a coin flip across mail clients, and a
  // pixel in a credential email is indefensible.
  const html = `<div style="max-width:600px;margin:0 auto;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
  <p>Hello ${safeName},</p>
  <p>${safeInviter} has set up a Cliffview Academy account for you. Cliffview Academy is where the school's training modules and your CPTD record live.</p>
  <p style="margin:32px 0">
    <a href="${safeLink}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#0d2c4b;color:#ffffff;text-decoration:none;font-weight:600">Set your password</a>
  </p>
  <p style="font-size:14px;color:#555">Or paste this address into your browser:<br>
    <span style="word-break:break-all">${safeLink}</span>
  </p>
  <p style="font-size:14px;color:#555">The link works once and expires in ${EXPIRY_PHRASE}. If it has expired, ask ${safeInviter} to send you a new one.</p>
  <p style="font-size:14px;color:#555">If you were not expecting this, you can ignore it — nothing happens to your details until the link is used.</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0">
  <p style="font-size:12px;color:#888">Cliffview Academy<br>This mailbox is not monitored. Please reply to whoever invited you.</p>
</div>`;

  return { subject, text, html };
}
