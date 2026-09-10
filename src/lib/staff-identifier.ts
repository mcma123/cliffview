/**
 * Turn what someone types in a sign-in box into the email Convex Auth needs.
 *
 * There is no username in this system, and there cannot easily be one: the
 * `Password` provider keys accounts on an email address, and
 * `createOrUpdateUser` in `convex/auth.ts` looks the signing-in person up by
 * `users.email`. Adding a real username column would mean a second lookup path
 * into the same table and a second uniqueness invariant to keep.
 *
 * So a username is resolved to an email instead. Anything without an `@` is
 * treated as the local part of a Cliffview address, which means `admin` signs
 * in as `admin@cliffview.example` and `hendrik.vanwyk` works as well as the
 * full address. Anything with an `@` is passed through untouched, so an
 * external address still works if one is ever provisioned.
 */

/**
 * The school's email domain.
 *
 * Must match the domain on the `users` rows, or every bare username resolves to
 * an address that is not provisioned and sign-in fails with NOT_PROVISIONED.
 * The seeded staff use `cliffview.example` (a reserved placeholder domain, RFC
 * 2606); change this and the seed together when the real domain is known.
 */
export const CLIFFVIEW_EMAIL_DOMAIN = "cliffview.example";

/**
 * @param input Whatever was typed: a bare username or a full email address.
 * @returns A lowercased email address. `createOrUpdateUser` lowercases before
 * its lookup too, so casing never decides whether a sign-in works.
 */
export function toStaffEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return "";
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@${CLIFFVIEW_EMAIL_DOMAIN}`;
}
