import { describe, expect, test } from "vitest";

import { buildInvitationEmail } from "./lib/invitationEmail";
import { invitationLink, isUndeliverable } from "./lib/email";

/**
 * The invitation copy, tested as a pure function.
 *
 * No Convex, no components, no registration: `buildInvitationEmail` imports
 * nothing, which is why it lives in its own module. The bug worth catching
 * here is a broken or missing link, because that is the one defect that makes
 * the whole feature useless while every other test still passes.
 */

const ARGS = {
  firstName: "Nomsa",
  invitedBy: "Ada Admin",
  link: "https://cliffview.test/academy/invite?token=abc123",
};

describe("the invitation email", () => {
  test("puts the link in both the text and HTML parts", () => {
    const mail = buildInvitationEmail(ARGS);
    expect(mail.text).toContain(ARGS.link);
    expect(mail.html).toContain(ARGS.link);
  });

  test("names the invitee and the person who invited them", () => {
    const mail = buildInvitationEmail(ARGS);
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain("Nomsa");
      expect(part).toContain("Ada Admin");
    }
  });

  test("promises the same expiry in both parts, so they cannot drift", () => {
    const mail = buildInvitationEmail(ARGS);
    expect(mail.text).toContain("7 days");
    expect(mail.html).toContain("7 days");
  });

  test("has a non-empty subject and a real plain-text alternative", () => {
    const mail = buildInvitationEmail(ARGS);
    expect(mail.subject.length).toBeGreaterThan(0);
    // Not a courtesy: a missing text part hurts inbox placement, and plenty of
    // school mail clients strip HTML outright.
    expect(mail.text.length).toBeGreaterThan(100);
  });

  test("leaves no unreplaced placeholder", () => {
    const mail = buildInvitationEmail(ARGS);
    expect(mail.text).not.toMatch(/\$\{|\{\{/);
    expect(mail.html).not.toMatch(/\$\{|\{\{/);
  });

  test("escapes a name that would otherwise inject markup", () => {
    const mail = buildInvitationEmail({ ...ARGS, firstName: '<script>alert("x")</script>' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  test("offers no unsubscribe link - this is transactional, not marketing", () => {
    const mail = buildInvitationEmail(ARGS);
    expect(mail.text.toLowerCase()).not.toContain("unsubscribe");
    expect(mail.html.toLowerCase()).not.toContain("unsubscribe");
  });
});

describe("addresses that can never receive mail are refused locally", () => {
  test("the seeded placeholder domain is caught", () => {
    // Every seeded staff member is on this RFC 2606 domain. Mailing one is not
    // a no-op: the hard bounce counts against the sending domain's reputation.
    expect(isUndeliverable("priya.naidoo@cliffview.example")).toBe(true);
    expect(isUndeliverable("someone@example.com")).toBe(true);
    expect(isUndeliverable("someone@thing.invalid")).toBe(true);
    expect(isUndeliverable("someone@localhost")).toBe(true);
  });

  test("real addresses are allowed through", () => {
    expect(isUndeliverable("mcmarsh.fif@gmail.com")).toBe(false);
    expect(isUndeliverable("head@cliffview.co.za")).toBe(false);
  });

  test("a malformed address is treated as undeliverable rather than tried", () => {
    expect(isUndeliverable("not-an-address")).toBe(true);
    expect(isUndeliverable("")).toBe(true);
  });
});

describe("the invitation link", () => {
  test("is built against the deployed origin with the token as a query param", () => {
    expect(invitationLink("https://cliffview.cyphersoftai.com", "abc")).toBe(
      "https://cliffview.cyphersoftai.com/academy/invite?token=abc",
    );
  });
});
