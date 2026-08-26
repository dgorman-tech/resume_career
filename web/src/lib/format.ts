// Unambiguous per-currency labels: a bare "$" is a lie the moment a posting or a
// profile isn't priced in USD/CAD, so every symbol here says which one it is.
const CURRENCY_SYMBOLS: Record<string, string> = {
  CAD: "CA$", USD: "US$", EUR: "€", GBP: "£", AUD: "A$", NZD: "NZ$",
  CHF: "CHF ", SEK: "kr ", INR: "₹", SGD: "S$",
};

export function fmtSalary(min: number | null, max: number | null, currency: string = "CAD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const k = (v: number) => `${symbol}${Math.round(v / 1000)}K`;
  if (min && max && min !== max) return `${k(min)}–${k(max)}`;
  if (min || max) return k((min || max)!);
  return "—";
}

export function fmtAge(iso: string): string {
  if (!iso) return "";
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
