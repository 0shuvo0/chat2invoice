'use client';
export type Attachment = { id: string; name: string; size: number; kind: 'pdf' | 'text' | 'image'; text?: string; base64?: string; error?: string };

async function pdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    out.push(c.items.map((it: any) => ('str' in it ? it.str : '')).join(' '));
  }
  return out.join('\n\n');
}

function readBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

export async function processFile(file: File): Promise<Attachment> {
  const id = Math.random().toString(36).slice(2);
  const base = { id, name: file.name, size: file.size };
  try {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { ...base, kind: 'pdf', text: await pdfText(file) };
    if (file.type.startsWith('image/')) return { ...base, kind: 'image', base64: await readBase64(file) };
    return { ...base, kind: 'text', text: await file.text() };
  } catch (e: any) {
    return { ...base, kind: 'text', text: '', error: e?.message || 'Could not read file' };
  }
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
