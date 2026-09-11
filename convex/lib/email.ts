import { Resend } from "@convex-dev/resend";

import { components } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { buildInvitationEmail } from "./invitationEmail";

/**
 * Transactional email, the app's only outbound channel.
 *
 * The component reads `RESEND_API_KEY` from deployment env in its constructor,
 * exactly as R2 reads its five credentials — never from an argument, and never
 * from anything `VITE_`-prefixed. A leaked Resend key is worse than a leaked
 * bucket key: it sends mail *as the school*.
 *
 * One instance, here rather than in `invites.ts`, for the same reason `r2`
 * lives in `storage.ts`: password resets and assignment notices will want it
 * too, and a second `new Resend(...)` would be a second place to keep
 * `testMode` configured — the one option where getting it wrong means either
 * no mail at all or real mail escaping a rehearsal.
 */

/**
 * `testMode` defaults to **true** in the component, which refuses every
 * recipient that is not one of Resend's `@resend.dev` test addresses. That
 * default is the right one, so it is inverted only by an explicit deployment
 * env var, set once the sending domain is verified. A deployment nobody has
 * configured sends nothing rather than sending badly.
 */
export const resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE !== "false",
});

/**
 * Who invitations come from.
 *
 * In code rather than env because it is not a secret — it is a reviewable
 * product decision that belongs next to the copy it appears in, the same
 * argument that keeps `MAX_FILE_BYTES` in `storage.ts`.
 *
 * The domain must be verified in Resend or the send is rejected outright. It
 * is overridable by env so a preview deployment can point at a different
 * verified domain without a code change.
 */
export const INVITATION_FROM =
  process.env.INVITATION_FROM_EMAIL ?? "Cliffview Academy <no-reply@cyphersoftai.com>";

/** Why an invitation could not be sent. None of these may lose the staff row. */
export type InvitationBlock = "no-api-key" | "no-site-url" | "undeliverable-domain";

/**
 * Domains that can never receive mail.
 *
 * Every seeded staff member is on `cliffview.example`, an RFC 2606 reserved
 * placeholder with no MX record (see `src/lib/staff-identifier.ts`). Mailing
 * one is not a harmless no-op: Resend accepts it, and the hard bounce counts
 * against the sending domain's reputation, so the *first real* invitation is
 * the one that lands in spam. Refuse locally instead.
 */
const UNDELIVERABLE_TLDS = new Set(["example", "invalid", "test", "localhost"]);
const UNDELIVERABLE_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

export function isUndeliverable(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (domain === undefined || domain.length === 0) return true;
  if (UNDELIVERABLE_DOMAINS.has(domain)) return true;
  const tld = domain.split(".").pop();
  return tld !== undefined && UNDELIVERABLE_TLDS.has(tld);
}

/**
 * Where an invitation link points.
 *
 * `SITE_URL` is the deployed frontend origin and has been set on prod since
 * the frontend shipped, read by nothing until now. Deliberately no fallback: a
 * deployment without it would otherwise mint `undefined/academy/invite/...`
 * links, and a teacher who follows one sets nothing at all.
 */
export function inviteBaseUrl(): string | null {
  const raw = process.env.SITE_URL;
  if (raw === undefined || raw.length === 0) return null;
  return raw.replace(/\/+$/, "");
}

export function invitationLink(base: string, token: string): string {
  return `${base}/academy/invite?token=${token}`;
}

/** Everything that must be true before a send is even attempted. */
export function invitationBlockReason(email: string): InvitationBlock | null {
  if (isUndeliverable(email)) return "undeliverable-domain";
  if (inviteBaseUrl() === null) return "no-site-url";
  // The component throws "API key is not set" on an empty key. Pre-checking
  // rather than catching keeps that throw unreachable in normal operation.
  const key = process.env.RESEND_API_KEY;
  if (key === undefined || key.length === 0) return "no-api-key";
  return null;
}

export type InvitationOutcome =
  | { sent: true; emailId: string; link: string }
  | { sent: false; reason: InvitationBlock; link: string | null };

/**
 * Queue one invitation.
 *
 * Returns an outcome rather than throwing, because every caller has already
 * committed to creating the staff member: a misconfigured mail setup must not
 * be able to roll back a person's profile.
 *
 * `idempotencyKey` is the token, which is minted once per invitation, so a
 * platform-level retry of the caller collapses into one delivery rather than
 * two copies of the same link.
 */
export async function sendInvitationEmail(
  ctx: MutationCtx | ActionCtx,
  args: { to: string; firstName: string; invitedBy: string; token: string },
): Promise<InvitationOutcome> {
  const base = inviteBaseUrl();
  const link = base === null ? null : invitationLink(base, args.token);

  const blocked = invitationBlockReason(args.to);
  if (blocked !== null) return { sent: false, reason: blocked, link };

  const body = buildInvitationEmail({
    firstName: args.firstName,
    invitedBy: args.invitedBy,
    link: link!,
  });

  const emailId = await resend.sendEmail(ctx, {
    from: INVITATION_FROM,
    to: args.to,
    subject: body.subject,
    text: body.text,
    html: body.html,
    idempotencyKey: `invite:${args.token}`,
  });
  return { sent: true, emailId, link: link! };
}
