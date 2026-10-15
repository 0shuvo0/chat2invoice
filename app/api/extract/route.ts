import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEYS = ['freelancer_name', 'freelancer_email', 'freelancer_company', 'client_name', 'client_email', 'client_company',
  'project_description', 'project_details', 'project_deadline', 'amount', 'currency', 'discount_amount', 'due_now',
  'payment_instructions', 'tax_note'] as const;

function buildPrompt(today: string, chat: string, notes: string, docs: string) {
  return `You extract invoice data from a conversation between a freelancer and a client.
Today's date is ${today}.
Return ONLY a JSON object with EXACTLY these keys (all string values, use "" when the information is not clearly present - never guess or invent):
{
  "freelancer_name": "name of the freelancer / person sending the invoice",
  "freelancer_email": "freelancer's email address",
  "freelancer_company": "freelancer's business name, if any",
  "client_name": "name of the client / person paying",
  "client_email": "client's email address",
  "client_company": "client's company name, if any",
  "project_description": "short title of the work, max 12 words",
  "project_details": "one short line of quantity/rate detail e.g. '40.0 hrs x $75.00/hr', or ''",
  "project_deadline": "payment due date as YYYY-MM-DD; resolve relative dates like 'Friday' or 'net 15' against today's date; '' if not mentioned",
  "amount": "total subtotal as a plain number without currency symbols, e.g. '3000'. Compute it if hours x rate are given",
  "currency": "ISO currency code, default 'USD'",
  "discount_amount": "discount as a plain number (convert percentages to an amount), or ''",
  "due_now": "amount due now as a plain number if a deposit/partial payment is mentioned, else ''",
  "payment_instructions": "payment method / terms text, or ''",
  "tax_note": "any tax note, or ''"
}
Rules: "Additional notes" written by the user OVERRIDE anything in the chat. Use the attached documents and images as extra evidence. Output JSON only.

=== CHAT HISTORY ===
${chat || '(empty)'}

=== ADDITIONAL NOTES (highest priority) ===
${notes || '(none)'}

=== ATTACHED DOCUMENT TEXT ===
${docs || '(none)'}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function clean(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const k of KEYS) {
    let v = src[k];
    if (v === null || v === undefined) v = '';
    if (typeof v === 'object') v = '';
    v = String(v).trim();
    if (/^(n\/a|null|none|unknown|not (mentioned|specified|provided))$/i.test(v)) v = '';
    out[k] = v;
  }
  for (const k of ['freelancer_email', 'client_email']) if (out[k] && !EMAIL_RE.test(out[k])) out[k] = '';
  for (const k of ['amount', 'discount_amount', 'due_now']) {
    if (!out[k]) continue;
    const n = parseFloat(out[k].replace(/[^0-9.\-]/g, ''));
    out[k] = isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : '';
  }
  if (out.project_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(out.project_deadline)) {
    const d = new Date(out.project_deadline);
    out.project_deadline = isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  out.currency = /^[A-Za-z]{3}$/.test(out.currency) ? out.currency.toUpperCase() : 'USD';
  return out;
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const chat = String(body?.chat ?? '').slice(0, 60000);
  const notes = String(body?.notes ?? '').slice(0, 10000);
  const docs = String(body?.docs ?? '').slice(0, 60000);
  const images: string[] = Array.isArray(body?.images) ? body.images.filter((x: any) => typeof x === 'string').slice(0, 6) : [];
  if (!chat.trim() && !notes.trim() && !docs.trim() && images.length === 0)
    return NextResponse.json({ error: 'Paste a conversation or attach a file first.' }, { status: 400 });

  const host = (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_AI_MODEL || 'gemma3:latest';
  const today = new Date().toISOString().slice(0, 10);
  const message: any = { role: 'user', content: buildPrompt(today, chat, notes, docs) };
  if (images.length) message.images = images;

  let res: Response;
  try {
    res = await fetch(`${host}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [message], format: 'json', stream: false, options: { temperature: 0 } }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e: any) {
    return NextResponse.json({
      error: `Can't reach the local AI at ${host}. Make sure Ollama is running ("ollama serve") and the model is pulled ("ollama pull ${model}").`,
      code: 'OLLAMA_UNREACHABLE',
    }, { status: 503 });
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const notFound = res.status === 404 || /not found/i.test(t);
    return NextResponse.json({
      error: notFound ? `Model "${model}" isn't installed. Run: ollama pull ${model}` : `Ollama returned an error (${res.status}): ${t.slice(0, 300)}`,
      code: notFound ? 'MODEL_MISSING' : 'OLLAMA_ERROR',
    }, { status: 502 });
  }
  const data: any = await res.json().catch(() => null);
  const content: string = data?.message?.content ?? '';
  let parsed: any = null;
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
  }
  if (!parsed) return NextResponse.json({ error: 'The AI returned an unreadable answer. Please try again, or fill the fields manually.', code: 'BAD_JSON', data: clean({}) }, { status: 502 });
  return NextResponse.json({ data: clean(parsed), model });
}
