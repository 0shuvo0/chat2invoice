export type InvoiceData = {
  freelancer_name: string;
  freelancer_email: string;
  freelancer_company: string;
  client_name: string;
  client_email: string;
  client_company: string;
  project_description: string;
  project_details: string;
  project_deadline: string; // YYYY-MM-DD
  amount: string;
  currency: string;
  discount_amount: string;
  due_now: string;
  payment_instructions: string;
  tax_note: string;
  invoice_id: string;
  issue_date: string; // "13 Oct 2026"
};

export const REQUIRED_FIELDS = [
  'freelancer_name', 'freelancer_email', 'client_name', 'client_email',
  'project_description', 'project_deadline', 'amount',
] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export const FIELD_LABELS: Record<RequiredField, string> = {
  freelancer_name: 'Your Name',
  freelancer_email: 'Your Email',
  client_name: 'Client Name',
  client_email: 'Client Email',
  project_description: 'Project Description & Scope',
  project_deadline: 'Payment Due Date',
  amount: 'Invoice Subtotal Amount',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function formatIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return formatDate(new Date(+m[1], +m[2] - 1, +m[3]));
}
export function generateInvoiceId(d = new Date()): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  const buf = new Uint32Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 1e9);
  for (let i = 0; i < 4; i++) r += chars[buf[i] % chars.length];
  return `INV-${d.getFullYear()}-${MONTHS[d.getMonth()].toUpperCase()}-${String(d.getDate()).padStart(2, '0')}-${r}`;
}

export function toNumber(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return NaN;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return n;
}
const SYMBOLS: Record<string, string> = { USD: '$', CAD: 'CA$', AUD: 'A$', GBP: '£', EUR: '€', INR: '₹', BDT: '৳', NZD: 'NZ$', JPY: '¥' };
export function currencySymbol(c: string) { return SYMBOLS[(c || 'USD').toUpperCase()] ?? `${(c || 'USD').toUpperCase()} `; }
export function money(v: string | number, currency = 'USD'): string {
  const n = typeof v === 'number' ? v : toNumber(v);
  if (!isFinite(n)) return '—';
  return currencySymbol(currency) + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function emptyInvoice(): InvoiceData {
  const now = new Date();
  return {
    freelancer_name: '', freelancer_email: '', freelancer_company: '', client_name: '', client_email: '', client_company: '',
    project_description: '', project_details: '', project_deadline: '', amount: '', currency: 'USD', discount_amount: '',
    due_now: '', payment_instructions: '', tax_note: '', invoice_id: generateInvoiceId(now), issue_date: formatDate(now),
  };
}

export function computeDueNow(d: InvoiceData): number {
  const explicit = toNumber(d.due_now);
  if (isFinite(explicit) && d.due_now.trim() !== '') return explicit;
  const amt = toNumber(d.amount); const disc = toNumber(d.discount_amount);
  if (!isFinite(amt)) return NaN;
  return Math.max(0, amt - (isFinite(disc) ? disc : 0));
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function fieldValid(k: RequiredField, v: string): boolean {
  const s = (v || '').trim();
  if (!s) return false;
  if (k.endsWith('email')) return EMAIL_RE.test(s);
  if (k === 'amount') return isFinite(toNumber(s)) && toNumber(s) > 0;
  if (k === 'project_deadline') return /^\d{4}-\d{2}-\d{2}$/.test(s);
  return true;
}
