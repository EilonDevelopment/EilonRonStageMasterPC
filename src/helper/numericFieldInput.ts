/** Digits only (P.S.W). */
export const sanitizeDigitsOnly = (raw: string) => raw.replace(/\D/g, '');

/** Leading optional minus, digits, optional single decimal point (Underload). Comma normalized to dot. */
export const sanitizeSignedDecimal = (raw: string) => {
  const s = raw.replace(/,/g, '.').replace(/[^\d.-]/g, '');
  if (s === '' || s === '-') return s;
  const neg = s.startsWith('-');
  let t = neg ? s.slice(1) : s;
  t = t.replace(/-/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot === -1) return (neg ? '-' : '') + t.replace(/\D/g, '');
  const intPart = t.slice(0, firstDot).replace(/\D/g, '');
  const fracPart = t.slice(firstDot + 1).replace(/\D/g, '');
  const trailingDot = t.endsWith('.') && fracPart.length === 0;
  return (neg ? '-' : '') + intPart + (fracPart.length > 0 ? `.${fracPart}` : trailingDot ? '.' : '');
};

/** Digits and at most one decimal point (Overload). */
export const sanitizeUnsignedDecimal = (raw: string) => {
  const s = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot === -1) return s.replace(/\D/g, '');
  const intPart = s.slice(0, firstDot).replace(/\D/g, '');
  const fracPart = s.slice(firstDot + 1).replace(/\D/g, '');
  const trailingDot = s.endsWith('.') && fracPart.length === 0;
  return intPart + (fracPart.length > 0 ? `.${fracPart}` : trailingDot ? '.' : '');
};

/** LC ID list: digits, commas, hyphens for ranges (e.g. 10-15,18). No decimals. */
export const sanitizeLcIds = (raw: string) => raw.replace(/[^\d,\-]/g, '');

/** Group IDs as comma-separated list (digits and commas only). */
export const sanitizeCommaDigits = (raw: string) => raw.replace(/[^\d,]/g, '');

export type NumericKeypadVariant =
  | 'digits'
  | 'signed-decimal'
  | 'unsigned-decimal'
  | 'lc-ids'
  | 'digits-comma';

export function applyNumericKeypadKey(prev: string, key: string, variant: NumericKeypadVariant): string {
  if (key === 'bksp') return prev.slice(0, -1);
  if (key === 'clear') return '';
  if (variant === 'digits-comma') {
    if (/^\d$/.test(key)) return sanitizeCommaDigits(prev + key);
    if (key === ',') return sanitizeCommaDigits(prev + ',');
    return prev;
  }
  if (variant === 'lc-ids') {
    if (/^\d$/.test(key)) return sanitizeLcIds(prev + key);
    if (key === ',') return sanitizeLcIds(prev + ',');
    if (key === '-') return sanitizeLcIds(prev + '-');
    return prev;
  }
  if (key === '-') {
    if (variant !== 'signed-decimal') return prev;
    if (prev.startsWith('-')) return prev.slice(1) || '';
    return `-${prev}`;
  }
  if (key === '.' || key === ',') {
    if (variant === 'digits') return prev;
    if (variant === 'signed-decimal') return sanitizeSignedDecimal(`${prev}.`);
    return sanitizeUnsignedDecimal(`${prev}.`);
  }
  if (/^\d$/.test(key)) {
    if (variant === 'digits') return sanitizeDigitsOnly(prev + key);
    if (variant === 'signed-decimal') return sanitizeSignedDecimal(prev + key);
    return sanitizeUnsignedDecimal(prev + key);
  }
  return prev;
}
