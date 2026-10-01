// Relative time in Bengali. <24h -> 'X মিনিট/ঘণ্টা আগে', else date+time.
export function timeAgoBn(raw: any): string {
  if (!raw) return '-';
  const s = String(raw).replace('T', ' ').slice(0, 19);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return String(raw);
  // DB stores UTC without marker -> Date.UTC, so 'x আগে' is correct in Dhaka.
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  if (Number.isNaN(t)) return String(raw);
  const diffMin = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (diffMin < 1) return 'এইমাত্র';
  if (diffMin < 60) return diffMin + ' মিনিট আগে';
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + ' ঘণ্টা আগে';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dd = new Date(t + 6 * 3600 * 1000);
  const m4 = String(dd.getUTCHours()).padStart(2, '0');
  let h = dd.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return dd.getUTCDate() + ' ' + (MON[dd.getUTCMonth()] || '') + ' ' + dd.getUTCFullYear() + ', ' + String(h).padStart(2, '0') + ':' + String(dd.getUTCMinutes()).padStart(2, '0') + ' ' + ap;
}
