'use client';
import type { InvoiceData } from './invoice';
import { computeDueNow, formatIso, money, toNumber } from './invoice';

const BRAND: [number, number, number] = [90, 69, 230];
const INK: [number, number, number] = [21, 26, 51];
const MUTED: [number, number, number] = [100, 108, 135];
const LAV: [number, number, number] = [241, 242, 252];
const LAV2: [number, number, number] = [226, 230, 250];

export async function buildInvoicePdf(d: InvoiceData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 18, CW = W - M * 2;
  const cur = d.currency || 'USD';
  const amount = toNumber(d.amount);
  const discount = toNumber(d.discount_amount);
  const total = computeDueNow(d);
  const text = (s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: number[]; align?: 'left' | 'right' | 'center'; maxW?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 10);
    doc.setTextColor(...((o.color ?? INK) as [number, number, number]));
    const lines = o.maxW ? doc.splitTextToSize(s, o.maxW) : s;
    doc.text(lines, x, y, { align: o.align ?? 'left' });
    return Array.isArray(lines) ? lines.length : 1;
  };

  // top band
  doc.setFillColor(...BRAND); doc.rect(0, 0, W, 6, 'F');
  let y = 26;
  text('INVOICE', M, y, { size: 30, bold: true });
  doc.setFillColor(255, 237, 213); doc.roundedRect(M + 62, y - 7, 20, 8, 2, 2, 'F');
  text('Unpaid', M + 72, y - 1.6, { size: 9, bold: true, color: [194, 65, 12], align: 'center' });
  text('Original Digital Copy', W - M, y - 1, { size: 9, bold: true, color: MUTED, align: 'right' });
  y += 8;
  text(`# ${d.invoice_id}`, M, y, { size: 11, bold: true, color: MUTED });
  y += 6; doc.setDrawColor(...LAV2); doc.line(M, y, W - M, y);

  // dates
  y += 6; doc.setFillColor(...LAV); doc.roundedRect(M, y, CW, 18, 3, 3, 'F');
  text('Issue Date', M + 5, y + 6.5, { size: 8.5, color: MUTED });
  text(d.issue_date, M + 5, y + 13, { size: 12, bold: true });
  text('Due Date', W - M - 5, y + 6.5, { size: 8.5, color: MUTED, align: 'right' });
  text(formatIso(d.project_deadline) || '—', W - M - 5, y + 13, { size: 12, bold: true, color: [220, 38, 38], align: 'right' });

  // from / billed to
  y += 24; const colW = (CW - 6) / 2;
  const party = (x: number, title: string, name: string, email: string, company: string, fill: number[]) => {
    doc.setFillColor(...(fill as [number, number, number])); doc.roundedRect(x, y, colW, 30, 3, 3, 'F');
    text(title, x + 5, y + 7, { size: 8, bold: true, color: MUTED });
    text(name || '—', x + 5, y + 14, { size: 13, bold: true, maxW: colW - 10 });
    text(email, x + 5, y + 20, { size: 9, color: MUTED, maxW: colW - 10 });
    if (company) text(company, x + 5, y + 25.5, { size: 9, bold: true, maxW: colW - 10 });
  };
  party(M, 'FROM', d.freelancer_name, d.freelancer_email, d.freelancer_company, [248, 248, 253]);
  party(M + colW + 6, 'BILLED TO', d.client_name, d.client_email, d.client_company, LAV2);

  // table
  y += 40;
  text('DESCRIPTION', M, y, { size: 8.5, bold: true, color: MUTED });
  text('TOTAL', W - M, y, { size: 8.5, bold: true, color: MUTED, align: 'right' });
  y += 3; doc.setDrawColor(...LAV2); doc.line(M, y, W - M, y);
  y += 8;
  const n = text(d.project_description || '—', M, y, { size: 11, bold: true, maxW: CW - 45 });
  text(money(amount, cur), W - M, y, { size: 11, bold: true, align: 'right' });
  y += n * 5;
  if (d.project_details) { text(d.project_details, M, y, { size: 9, color: MUTED, maxW: CW - 45 }); y += 5; }
  y += 4; doc.line(M, y, W - M, y);

  // totals
  y += 8;
  const row = (l: string, v: string, bold = false, color = INK) => {
    text(l, M + CW / 2, y, { size: 10, bold, color: bold ? INK : MUTED });
    text(v, W - M, y, { size: 10, bold: true, align: 'right', color });
    y += 7;
  };
  row('Subtotal', money(amount, cur));
  if (isFinite(discount) && discount > 0) row('Discount', `- ${money(discount, cur)}`, false, [22, 163, 74]);
  row(d.tax_note ? `Tax (${d.tax_note})` : 'Tax (0% Service)', money(0, cur));
  y += 1;
  doc.setFillColor(...LAV2); doc.roundedRect(M + CW / 2 - 6, y, CW / 2 + 6, 20, 3, 3, 'F');
  text('TOTAL BALANCE DUE', M + CW / 2, y + 8, { size: 9, bold: true, color: BRAND });
  text(d.payment_instructions ? 'Payment terms below' : `Due ${formatIso(d.project_deadline) || 'on receipt'}`, M + CW / 2, y + 14, { size: 8.5, color: MUTED });
  text(money(total, cur), W - M - 5, y + 13.5, { size: 18, bold: true, color: BRAND, align: 'right' });
  y += 30;

  if (d.payment_instructions) {
    const lines = doc.splitTextToSize(d.payment_instructions, CW - 10);
    const h = 12 + lines.length * 4.5;
    doc.setFillColor(...LAV); doc.roundedRect(M, y, CW, h, 3, 3, 'F');
    text('PAYMENT TERMS', M + 5, y + 7, { size: 8, bold: true, color: MUTED });
    text(d.payment_instructions, M + 5, y + 12.5, { size: 9.5, maxW: CW - 10 });
    y += h + 6;
  }

  // footer
  text('Thank you for your business!', W / 2, 280, { size: 10, bold: true, color: BRAND, align: 'center' });
  text(`Generated with Chat2Invoice · ${d.invoice_id}`, W / 2, 286, { size: 8, color: MUTED, align: 'center' });

  doc.setProperties({ title: `Invoice ${d.invoice_id}`, author: d.freelancer_name, creator: 'Chat2Invoice' });
  return doc.output('blob');
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
