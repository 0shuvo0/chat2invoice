import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY; const from = process.env.RESEND_SENDER_EMAIL;
  if (!key || !from) return NextResponse.json({ error: 'Email sending is not configured on this server.' }, { status: 501 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const to = String(b?.to ?? '').trim(); const message = String(b?.message ?? '');
  const subject = String(b?.subject ?? 'Invoice').slice(0, 200);
  const filename = String(b?.filename ?? 'invoice.pdf').replace(/[^\w.\-]/g, '_');
  const pdf = String(b?.pdfBase64 ?? '');
  const replyTo = String(b?.replyTo ?? '').trim();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Enter a valid recipient email.' }, { status: 400 });
  if (!pdf) return NextResponse.json({ error: 'Missing PDF attachment.' }, { status: 400 });
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], subject, text: message,
        html: `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#151a33">${esc(message).replace(/\n/g, '<br/>')}</div>`,
        ...(EMAIL_RE.test(replyTo) ? { reply_to: replyTo } : {}),
        attachments: [{ filename, content: pdf }],
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ error: j?.message || `Resend error (${r.status})` }, { status: 502 });
    return NextResponse.json({ ok: true, id: j?.id });
  } catch {
    return NextResponse.json({ error: 'Could not reach the email service. Check your internet connection.' }, { status: 503 });
  }
}
