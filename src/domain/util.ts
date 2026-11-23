/** SHA-256 hex digest (used to avoid storing the admin code in plain text). */
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash used for admin codes – salted so the hash isn't a plain lookup of "1234". */
export const hashAdminCode = (code: string) => sha256(`stallschemat:${code.trim()}`);

/** Black or white text for best contrast on a background colour (#rrggbb). */
export function textColorFor(bg: string): '#ffffff' | '#1f1a16' {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg);
  if (!m) return '#ffffff';
  const lin = (c: string) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  // Contrast against white vs. near-black; pick the larger.
  const white = 1.05 / (L + 0.05);
  const dark = (L + 0.05) / 0.0164;
  return white >= dark ? '#ffffff' : '#1f1a16';
}

export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}
