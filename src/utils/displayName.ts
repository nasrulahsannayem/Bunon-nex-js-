/**
 * Display-name helper for channel identities.
 *
 * 709 of 751 identities have no real name, and `display_name` holds the bare
 * numeric sender id for those (e.g. "289432522086"). Facebook will not return
 * a customer profile without `pages_read_engagement` on the connected token,
 * so the id is often all we have.
 *
 * Showing a raw id as a person's name is what the screenshots flagged. This
 * turns it into something readable — the channel plus a short handle — and
 * always prefers a genuine name when one exists.
 *
 * Kept in the service so the API and the UI agree, and so a future Graph
 * backfill automatically improves every surface at once.
 */

export type IdentityLike = {
  display_name?: string | null;
  primary_phone?: string | null;
  external_username?: string | null;
  platform?: string | null;
  channel_identities?: string | null;
};

const BN: Record<string, string> = {
  facebook: 'ফেসবুক',
  instagram: 'ইনস্টা',
  whatsapp: 'হোয়াটসঅ্যাপ',
  tiktok: 'টিকটক',
};

/** True when the value is a bare number (sender id or phone) rather than a name.
 *
 *  Bangladeshi MSISDNs are 13 digits (8801XXXXXXXXX) and Facebook sender ids
 *  are 15-17, so the bound is wide on purpose. Anything purely numeric in
 *  these fields is an identifier, never a human name.
 */
function isNumericId(v?: string | null): boolean {
  return !!v && /^\d{9,20}$/.test(v.replace(/[+\s-]/g, ''));
}

/** Pick the platform from whichever field the row happens to carry. */
function platformOf(x: IdentityLike): string {
  const direct = (x.platform || '').toLowerCase();
  if (direct) return direct;
  const list = (x.channel_identities || '').toLowerCase();
  for (const p of Object.keys(BN)) if (list.includes(p)) return p;
  return '';
}

/**
 * A name safe to show in the UI.
 *
 * Priority: a real name > the phone number (a Bangladeshi shopper is
 * recognisable by it) > a shortened channel handle > a neutral label.
 */
export function displayNameFor(x: IdentityLike | null | undefined): string {
  if (!x) return 'অজানা ক্রেতা';

  const name = (x.display_name || '').trim();
  if (name && !isNumericId(name)) return name;

  // A phone is a legitimate display identity — far more useful to an agent
  // than a bare sender id. Guarded on length rather than "is it numeric",
  // since every phone is numeric and the previous guard could never pass.
  const phone = (x.primary_phone || '').replace(/[+\s-]/g, '');
  if (/^\d{10,15}$/.test(phone)) return phone;

  const handle = (x.external_username || '').trim();
  if (handle) return handle.startsWith('@') ? handle : '@' + handle;

  // nothing but a sender id: label it with the channel and a short tail so it
  // is at least obviously an identity, not a name
  const p = platformOf(x);
  if (isNumericId(name)) {
    const tail = name.slice(-4);
    return p ? `${BN[p]} · ·${tail}` : `· ·${tail}`;
  }

  return p ? `${BN[p]} ক্রেতা` : 'অজানা ক্রেতা';
}

/** Initials/avatar tint seed: prefer a genuine name, else the identity id. */
export function avatarSeedFor(x: IdentityLike | null | undefined): string {
  if (!x) return '?';
  const name = (x.display_name || '').trim();
  if (name) return name;
  if (x.primary_phone) return x.primary_phone;
  if (x.external_username) return x.external_username;
  return '?';
}

/** True when there is a genuine name (as opposed to an id or a fallback). */
export function hasRealName(x: IdentityLike | null | undefined): boolean {
  const n = (x?.display_name || '').trim();
  return !!n && !isNumericId(n);
}