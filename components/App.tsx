'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, CalendarClock, Check, CheckCircle2, ChevronDown, CircleCheck, ClipboardPaste,
  CloudUpload, Download, FileText, FileType2, Image as ImageIcon, Info, Landmark, Loader2, Lock, Mail, MessageSquareText,
  Paperclip, PartyPopper, PlusCircle, Printer, SendHorizontal, Share, ShieldCheck, SlidersHorizontal, Sparkles, User, Wallet,
  X, AlertCircle, AtSign, AlignLeft, Banknote,
} from 'lucide-react';
import {
  computeDueNow, emptyInvoice, FIELD_LABELS, fieldValid, formatIso, InvoiceData, isoDate, money, REQUIRED_FIELDS, RequiredField,
  currencySymbol, toNumber,
} from '../lib/invoice';
import { Attachment, formatSize, processFile } from '../lib/extractText';
import { blobToBase64, buildInvoicePdf } from '../lib/pdf';

type Step = 1 | 2 | 3;

/* ---------------- shared bits ---------------- */
function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-600/30" style={{ width: size, height: size }}>
      <MessageSquareText size={size * 0.5} strokeWidth={2.2} />
    </div>
  );
}

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-lav-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        {step > 1 && (
          <button onClick={onBack} aria-label="Back" className="-ml-1 rounded-lg p-1.5 text-ink hover:bg-lav-100"><ArrowLeft size={24} /></button>
        )}
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[19px] font-bold text-ink">{step === 1 ? 'Chat2Invoice' : 'Invoice Review'}</div>
          <div className="text-[12px] font-semibold text-slate-500">{step === 1 ? 'AI Invoice Generator' : 'Chat2Invoice'}</div>
        </div>
        <div className="ml-auto hidden items-center gap-1.5 text-[12px] font-medium text-slate-500 sm:flex"><Lock size={14} /> Runs locally</div>
      </div>
    </header>
  );
}

const STEP_LABELS = ['Input Conversation', 'Review & Complete', 'Ready to Send'];
function Progress({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${step === 3 ? 'bg-ink' : 'bg-brand-800'}`}>{step}</span>
      <span className="text-[13px] font-bold text-ink sm:text-[14px]">Step {step} of 3: {STEP_LABELS[step - 1]}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {step === 3 ? (
          <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-600"><CircleCheck size={14} /> Ready</span>
        ) : (
          [1, 2, 3].map((i) => <span key={i} className={`h-[6px] w-6 rounded-full sm:w-10 ${i <= step ? 'bg-brand-800' : 'bg-brand-100'}`} />)
        )}
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
export default function App({ emailEnabled }: { emailEnabled: boolean }) {
  const [step, setStep] = useState<Step>(1);
  const [chat, setChat] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [advOpen, setAdvOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceData>(() => emptyInvoice());
  const [missing, setMissing] = useState<RequiredField[]>([]);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  // Dev/screenshot helper: ?demo=2|3 pre-fills demo data (no AI call)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('demo');
    if (!p) return;
    const d = { ...emptyInvoice(), ...DEMO };
    if (p === '2') { d.project_deadline = ''; setData(d); setMissing(['project_deadline']); setStep(2); }
    if (p === '3') { setData(d); setMissing([]); buildInvoicePdf(d).then((b) => { setPdf({ blob: b, url: URL.createObjectURL(b) }); setStep(3); }); }
    if (p === '1') { setChat(DEMO_CHAT); setAdvOpen(true); }
  }, []);

  async function extract() {
    setError(null);
    if (!chat.trim() && !notes.trim() && files.length === 0) { setError('Paste a client conversation (or attach a file) to continue.'); return; }
    setLoading(true);
    try {
      const docs = files.filter((f) => f.text).map((f) => `--- ${f.name} ---\n${f.text}`).join('\n\n');
      const images = files.filter((f) => f.base64).map((f) => f.base64!);
      const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat, notes, docs, images }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `Extraction failed (${res.status})`);
      const base = emptyInvoice();
      const merged: InvoiceData = { ...base, ...Object.fromEntries(Object.entries(j.data || {}).filter(([, v]) => typeof v === 'string')) } as InvoiceData;
      if (!merged.currency) merged.currency = 'USD';
      setData(merged);
      setMissing(REQUIRED_FIELDS.filter((k) => !fieldValid(k, merged[k])));
      setStep(2);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally { setLoading(false); }
  }

  function manualEntry() {
    setError(null); setData(emptyInvoice()); setMissing([...REQUIRED_FIELDS]); setStep(2);
  }

  async function generate() {
    const b = await buildInvoicePdf(data);
    if (pdf) URL.revokeObjectURL(pdf.url);
    setPdf({ blob: b, url: URL.createObjectURL(b) });
    setStep(3);
  }

  function reset() {
    if (pdf) URL.revokeObjectURL(pdf.url);
    setPdf(null); setChat(''); setNotes(''); setFiles([]); setAdvOpen(false); setError(null);
    setData(emptyInvoice()); setMissing([]); setStep(1);
  }

  return (
    <div className="min-h-screen">
      <Header step={step} onBack={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))} />
      <main className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Progress step={step} />
        {step === 1 && (
          <StepInput {...{ chat, setChat, notes, setNotes, files, setFiles, advOpen, setAdvOpen, loading, error, extract, manualEntry }} />
        )}
        {step === 2 && <StepReview data={data} setData={setData} missing={missing} onGenerate={generate} onBack={() => setStep(1)} />}
        {step === 3 && pdf && <StepDone data={data} pdf={pdf} emailEnabled={emailEnabled} onReset={reset} />}
      </main>
    </div>
  );
}

/* ---------------- Step 1 ---------------- */
function StepInput(p: {
  chat: string; setChat: (s: string) => void; notes: string; setNotes: (s: string) => void;
  files: Attachment[]; setFiles: React.Dispatch<React.SetStateAction<Attachment[]>>;
  advOpen: boolean; setAdvOpen: (b: boolean) => void; loading: boolean; error: string | null; extract: () => void; manualEntry: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) p.setChat(p.chat ? `${p.chat}\n${t}` : t); else setPasteMsg('Clipboard is empty');
    } catch { setPasteMsg('Clipboard blocked — press Ctrl/⌘+V in the box'); }
    setTimeout(() => setPasteMsg(null), 2500);
  }
  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const out = await Promise.all(Array.from(list).map(processFile));
    p.setFiles((f) => [...f, ...out]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div>
      <h1 className="mt-2 text-[27px] font-extrabold leading-[1.2] tracking-tight text-ink sm:text-[34px] lg:text-[40px]">Turn client chats into an invoice in seconds</h1>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">Paste your WhatsApp, Slack, iMessage, or email conversation below. Our AI extracts client details, scope, and pricing automatically.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
        {/* chat */}
        <section className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-100 text-brand-700"><MessageSquareText size={18} /></span>
            <h2 className="whitespace-nowrap text-[16px] font-bold text-ink sm:text-[18px]">Client Chat History <span className="text-red-500">*</span></h2>
            <button onClick={paste} className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-brand-100 px-2 py-1.5 text-[12px] sm:px-3 sm:text-[13px] font-semibold text-brand-700 hover:bg-brand-200">
              <ClipboardPaste size={15} /> Paste Clipboard
            </button>
          </div>
          {pasteMsg && <div className="mb-2 text-[12px] font-medium text-amber-700">{pasteMsg}</div>}
          <textarea
            value={p.chat} onChange={(e) => p.setChat(e.target.value)}
            placeholder={'Client: Hey Alex, thanks for the brand guidelines! Can you invoice us for the 40 hrs design work at $75/hr?\n\nAlex: Sure thing Sarah! Sending it over to sarah@acme.inc by Friday. Any purchase order number?'}
            className="field min-h-[230px] resize-y leading-relaxed lg:min-h-[420px]"
          />
          <div className="mt-2 text-right text-[12px] text-slate-400">{p.chat.length.toLocaleString()} characters</div>
        </section>

        {/* advanced */}
        <section className="card overflow-hidden">
          <button onClick={() => p.setAdvOpen(!p.advOpen)} className="flex w-full items-center gap-2 bg-lav-50 px-4 py-4 text-left sm:px-5" aria-expanded={p.advOpen}>
            <SlidersHorizontal size={20} className="text-ink" />
            <span className="whitespace-nowrap text-[15.5px] font-bold text-ink sm:text-[17px]">Advanced &amp; Attachments</span>
            <span className="chip bg-lav-200 text-slate-600">Optional</span>
            <span className={`ml-auto grid h-7 w-7 place-items-center rounded-full bg-lav-200 transition ${p.advOpen ? 'rotate-180' : ''}`}><ChevronDown size={18} /></span>
          </button>
          {p.advOpen && (
            <div className="space-y-5 px-4 pb-5 pt-3 sm:px-5">
              <div>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink"><AlignLeft size={15} /> Additional Notes or Context</span>
                  <span className="text-[12px] font-medium text-slate-500">Overrides auto-extraction</span>
                </div>
                <textarea value={p.notes} onChange={(e) => p.setNotes(e.target.value)} placeholder="e.g., Net 15 payment terms, apply 10% holiday discount, my email is alex@designstudio.co" className="field min-h-[90px] resize-y" />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[14px] font-semibold text-ink"><Paperclip size={15} /> Attach Supplementary Files</div>
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                  className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${drag ? 'border-brand-400 bg-brand-50' : 'border-lav-200 bg-lav-100/70 hover:border-brand-300'}`}
                >
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand-600">{busy ? <Loader2 className="animate-spin" /> : <CloudUpload size={24} />}</span>
                  <div className="mt-3 text-[15px] font-semibold text-ink">Tap to upload contracts or details</div>
                  <div className="mt-1 text-[13px] text-slate-500">AI inspects attached docs for exact milestones &amp; rates</div>
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <span className="chip bg-white text-slate-700 shadow-sm"><FileType2 size={13} className="text-red-500" /> PDF or TXT Contracts / SOW</span>
                    <span className="chip bg-white text-slate-700 shadow-sm"><ImageIcon size={13} className="text-emerald-600" /> Receipts &amp; Mockups</span>
                  </div>
                  <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,text/plain,application/pdf,image/*" onChange={(e) => addFiles(e.target.files)} />
                </div>
                {p.files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {p.files.map((f) => (
                      <li key={f.id} className="flex items-center gap-3 rounded-xl border border-lav-200 bg-lav-50 px-3 py-2.5">
                        <span className={`grid h-9 w-9 place-items-center rounded-lg ${f.kind === 'image' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                          {f.kind === 'image' ? <ImageIcon size={18} /> : <FileText size={18} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold text-ink">{f.name}</div>
                          <div className={`text-[12px] ${f.error ? 'text-red-600' : 'text-slate-500'}`}>{formatSize(f.size)} • {f.error ? `Couldn't read: ${f.error}` : 'Attached'}</div>
                        </div>
                        <button aria-label={`Remove ${f.name}`} onClick={() => p.setFiles((x) => x.filter((y) => y.id !== f.id))} className="rounded p-1 text-slate-400 hover:bg-lav-200 hover:text-ink"><X size={18} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {!p.advOpen && <div className="px-4 pb-4 text-[13px] text-slate-500 sm:px-5">Add notes, contracts (PDF/TXT) or receipt images for better accuracy.</div>}
        </section>
      </div>

      {p.error && (
        <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Couldn&apos;t extract details</div>
            <div className="mt-0.5">{p.error}</div>
            <button onClick={p.manualEntry} className="mt-2 font-semibold text-brand-700 underline">Fill in the invoice manually instead</button>
          </div>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-xl">
        <button onClick={p.extract} disabled={p.loading} className="btn-primary px-5 py-4">
          <span className="flex items-center justify-center gap-2 text-[18px]">
            {p.loading ? <><Loader2 className="animate-spin" size={20} /> Extracting with local AI…</> : <>Extract Invoice Details <Sparkles size={18} /></>}
          </span>
          <span className="mt-1 block text-[12.5px] font-medium text-white/80">{p.loading ? 'This can take up to a minute on first run' : 'Extracts client, amount, dates & scope automatically'}</span>
        </button>
        <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-slate-600"><Lock size={14} className="mt-0.5 shrink-0 text-emerald-600" /> Your chat data is processed locally and never shared with anyone</p>
      </div>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */
function StepReview({ data, setData, missing, onGenerate, onBack }: {
  data: InvoiceData; setData: React.Dispatch<React.SetStateAction<InvoiceData>>; missing: RequiredField[]; onGenerate: () => Promise<void>; onBack: () => void;
}) {
  const [optOpen, setOptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (k: keyof InvoiceData) => (v: string) => setData((d) => ({ ...d, [k]: v }));
  const valid = REQUIRED_FIELDS.filter((k) => fieldValid(k, data[k]));
  const extracted = REQUIRED_FIELDS.length - missing.length;
  const pending = REQUIRED_FIELDS.filter((k) => !fieldValid(k, data[k]));
  const ready = Math.round((valid.length / REQUIRED_FIELDS.length) * 100);
  const isMissing = (k: RequiredField) => missing.includes(k);
  const optCount = (['discount_amount', 'due_now', 'payment_instructions', 'tax_note'] as const).filter((k) => data[k]).length;
  const dueNow = computeDueNow(data);
  const cur = data.currency || 'USD';

  async function go() {
    setTried(true);
    if (pending.length) { document.getElementById(`f-${pending[0]}`)?.focus(); return; }
    setBusy(true); await onGenerate(); setBusy(false);
  }

  const err = (k: RequiredField) => tried && !fieldValid(k, data[k]);

  const actionField = (k: RequiredField) => {
    if (k === 'project_deadline') {
      const quick = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); set('project_deadline')(isoDate(d)); };
      return (
        <div key={k} className="card p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-amber-800">Payment Due Date <span className="text-red-500">*</span></div>
              <div className="mt-0.5 text-[14px] text-slate-600">Not mentioned in your chat or files. Pick a timeline or manual date:</div>
            </div>
            <CalendarClock className="text-amber-700" size={22} />
          </div>
          <input id={`f-${k}`} type="date" value={data.project_deadline} onChange={(e) => set('project_deadline')(e.target.value)}
            className={`field mt-3 ${err(k) ? 'border-red-300 ring-4 ring-red-100' : ''}`} aria-label="Select or enter deadline" />
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-slate-600">Quick Select:</span>
            {[7, 14, 30].map((n) => (
              <button key={n} onClick={() => quick(n)} className="rounded-lg bg-brand-50 px-2.5 py-2 text-[12.5px] sm:px-3.5 sm:text-[13px] font-semibold text-brand-800 hover:bg-brand-100">+{n} Days</button>
            ))}
          </div>
        </div>
      );
    }
    const isAmount = k === 'amount'; const isDesc = k === 'project_description';
    return (
      <div key={k} className="card p-4">
        <label htmlFor={`f-${k}`} className="text-[14px] font-semibold text-amber-800">{FIELD_LABELS[k]} <span className="text-red-500">*</span></label>
        <div className="mt-0.5 text-[14px] text-slate-600">Not found in your chat or files. Please enter it:</div>
        {isDesc ? (
          <textarea id={`f-${k}`} value={data[k]} onChange={(e) => set(k)(e.target.value)} className={`field mt-3 min-h-[80px] ${err(k) ? 'border-red-300 ring-4 ring-red-100' : ''}`} placeholder="e.g. Brand identity refresh & UI design sprint" />
        ) : (
          <div className="relative mt-3">
            {isAmount && <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-600">{currencySymbol(cur)}</span>}
            <input id={`f-${k}`} value={data[k]} inputMode={isAmount ? 'decimal' : k.endsWith('email') ? 'email' : 'text'} type={k.endsWith('email') ? 'email' : 'text'}
              onChange={(e) => set(k)(e.target.value)} placeholder={isAmount ? '0.00' : k.endsWith('email') ? 'name@example.com' : 'Full name'}
              className={`field ${isAmount ? 'pl-10' : ''} ${err(k) ? 'border-red-300 ring-4 ring-red-100' : ''}`} />
          </div>
        )}
        {err(k) && <div className="mt-1.5 text-[12px] font-medium text-red-600">{k.endsWith('email') ? 'Enter a valid email address' : 'This field is required'}</div>}
      </div>
    );
  };

  const smallField = (k: RequiredField, label: string, type = 'text') =>
    isMissing(k) ? null : (
      <label className="block min-w-0 flex-1">
        <span className="mb-1 block text-[12.5px] font-semibold text-slate-700">{label}</span>
        <input id={`f-${k}`} type={type} value={data[k]} onChange={(e) => set(k)(e.target.value)} className={`field-white ${err(k) ? 'border-red-300' : ''}`} />
      </label>
    );

  return (
    <div className="pb-28 lg:pb-0">
      <div className="card flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-[14px] font-semibold">
        <Sparkles size={18} className="text-emerald-600" />
        <span className="text-ink">{extracted} Details Extracted</span>
        <span className="text-slate-400">•</span>
        <span className={pending.length ? 'text-amber-700' : 'text-emerald-700'}>{pending.length ? `${pending.length} Action${pending.length > 1 ? 's' : ''} Required` : 'All set'}</span>
        <span className="chip ml-auto bg-emerald-100 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{ready}% Ready</span>
      </div>
      <p className="mt-2 text-[14px] text-slate-600">Review the automatically detected invoice data below. Missing required fields are highlighted for quick entry.</p>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.35fr] lg:items-start">
        {/* left: action needed + optional */}
        <div className="space-y-4 lg:sticky lg:top-24">
          {missing.length > 0 ? (
            <section className="rounded-2xl bg-amber-50/60 p-3 ring-1 ring-amber-100">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="h-3 w-3 rounded-full bg-amber-700" />
                <h2 className="text-[18px] font-bold text-ink">Action Needed</h2>
                <span className="chip ml-auto bg-amber-200/80 text-amber-900">! {pending.length} Required Field{pending.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-3">{missing.map(actionField)}</div>
            </section>
          ) : (
            <section className="card flex items-center gap-3 p-4 text-[14px] text-emerald-800"><CheckCircle2 className="text-emerald-600" /> Every required detail was found. Just review and generate.</section>
          )}

          <section className="card">
            <button onClick={() => setOptOpen(!optOpen)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={optOpen}>
              <SlidersHorizontal size={20} />
              <div className="flex-1">
                <div className="text-[17px] font-bold text-ink">Optional Details</div>
                <div className="text-[12.5px] font-medium text-slate-500">Discounts, tax notes, wire transfer</div>
              </div>
              <span className="chip bg-lav-200 text-slate-600">{optCount} item{optCount === 1 ? '' : 's'}</span>
              <ChevronDown className={`transition ${optOpen ? 'rotate-180' : ''}`} size={20} />
            </button>
            {optOpen && (
              <div className="grid gap-3 border-t border-lav-200 p-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Discount Amount</span>
                  <input inputMode="decimal" value={data.discount_amount} onChange={(e) => set('discount_amount')(e.target.value)} placeholder="0.00" className="field-white" /></label>
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Due Now</span>
                  <input inputMode="decimal" value={data.due_now} onChange={(e) => set('due_now')(e.target.value)} placeholder={isFinite(dueNow) ? String(dueNow) : 'Same as total'} className="field-white" /></label>
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Tax Note</span>
                  <input value={data.tax_note} onChange={(e) => set('tax_note')(e.target.value)} placeholder="e.g. 0% Service" className="field-white" /></label>
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Currency</span>
                  <select value={cur} onChange={(e) => set('currency')(e.target.value)} className="field-white">
                    {['USD', 'CAD', 'AUD', 'GBP', 'EUR', 'NZD', 'INR', 'BDT', 'JPY'].map((c) => <option key={c}>{c}</option>)}
                  </select></label>
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Your Business Name</span>
                  <input value={data.freelancer_company} onChange={(e) => set('freelancer_company')(e.target.value)} placeholder="e.g. Morgan Creative Studio LLC" className="field-white" /></label>
                <label className="block"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Client Company</span>
                  <input value={data.client_company} onChange={(e) => set('client_company')(e.target.value)} placeholder="e.g. Acme Health Inc." className="field-white" /></label>
                <label className="block sm:col-span-2"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Line Item Detail</span>
                  <input value={data.project_details} onChange={(e) => set('project_details')(e.target.value)} placeholder="e.g. 40.0 hrs × $75.00/hr" className="field-white" /></label>
                <label className="block sm:col-span-2"><span className="mb-1 block text-[12.5px] font-semibold text-slate-700">Payment Instructions</span>
                  <textarea value={data.payment_instructions} onChange={(e) => set('payment_instructions')(e.target.value)} placeholder="e.g. Due within 14 days via Direct Wire / ACH Transfer" className="field-white min-h-[70px]" /></label>
              </div>
            )}
          </section>
        </div>

        {/* right: found details */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <CircleCheck className="text-emerald-600" size={22} />
            <h2 className="text-[18px] font-bold text-ink">Found Details</h2>
            <span className="chip ml-auto bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300"><ShieldCheck size={13} /> Verified by AI</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="Invoice ID" icon={<span className="h-1.5 w-1.5 rounded-full bg-brand-600" />} value={data.invoice_id} sub="Auto-gen" subClass="text-brand-700" />
            <Tile label="Issue Date" icon={<CalendarDays size={14} className="text-emerald-600" />} value={data.issue_date} sub="Today" subClass="text-emerald-700" />
            <Tile label="Due Now" icon={<Banknote size={14} className="text-brand-600" />} value={money(dueNow, cur)} valueClass="text-brand-700" sub={toNumber(data.discount_amount) > 0 || data.due_now ? 'Adjusted' : 'Full amount'} />
          </div>

          <div className="card mt-3 space-y-3 p-3 sm:p-4">
            {(!isMissing('freelancer_name') || !isMissing('freelancer_email')) && (
              <div className="rounded-xl bg-lav-100 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-slate-600"><User size={14} className="text-brand-600" /> FROM (YOUR PROFILE)<CircleCheck size={16} className="ml-auto text-emerald-600" /></div>
                <div className="flex flex-col gap-2 sm:flex-row">{smallField('freelancer_name', 'Your Name')}{smallField('freelancer_email', 'Your Email', 'email')}</div>
              </div>
            )}
            {(!isMissing('client_name') || !isMissing('client_email')) && (
              <div className="rounded-xl bg-lav-100 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-slate-600"><Building2 size={14} className="text-brand-600" /> BILL TO (CLIENT)<CircleCheck size={16} className="ml-auto text-emerald-600" /></div>
                <div className="flex flex-col gap-2 sm:flex-row">{smallField('client_name', 'Client Name')}{smallField('client_email', 'Client Email', 'email')}</div>
              </div>
            )}
            {!isMissing('project_description') && (
              <div>
                <div className="mb-1.5 flex items-center"><span className="label">Project Description &amp; Scope</span><span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Check size={13} /> Extracted</span></div>
                <textarea id="f-project_description" value={data.project_description} onChange={(e) => set('project_description')(e.target.value)} className="field min-h-[78px] resize-y" />
              </div>
            )}
            {!isMissing('project_deadline') && (
              <div>
                <div className="mb-1.5 flex items-center"><span className="label">Payment Due Date</span><span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Check size={13} /> Extracted</span></div>
                <input id="f-project_deadline" type="date" value={data.project_deadline} onChange={(e) => set('project_deadline')(e.target.value)} className="field" />
              </div>
            )}
            {!isMissing('amount') && (
              <div>
                <div className="mb-1.5 flex items-center"><span className="label">Invoice Subtotal Amount</span><span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Check size={13} /> Currency: {cur}</span></div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[17px] font-bold text-slate-700">{currencySymbol(cur)}</span>
                  <input id="f-amount" inputMode="decimal" value={data.amount} onChange={(e) => set('amount')(e.target.value)} className="field pl-10 text-[18px] font-bold" />
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* sticky CTA on mobile, inline on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-lav-200 bg-white/95 px-4 pb-3 pt-3 backdrop-blur lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto max-w-xl">
          {tried && pending.length > 0 && <div className="mb-2 text-center text-[13px] font-medium text-red-600">Complete {pending.map((k) => FIELD_LABELS[k]).join(', ')} to continue</div>}
          <button onClick={go} disabled={busy} className="btn-primary px-5 py-3.5 text-[17px]">
            <span className="flex items-center justify-center gap-2">{busy ? <Loader2 className="animate-spin" size={20} /> : null}Generate Invoice PDF <ArrowRight size={18} /></span>
          </button>
          <button onClick={onBack} className="mx-auto mt-2 flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-ink"><ArrowLeft size={14} /> Back to Chat</button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, icon, value, sub, subClass = 'text-slate-500', valueClass = 'text-ink' }: { label: string; icon: React.ReactNode; value: string; sub: string; subClass?: string; valueClass?: string }) {
  return (
    <div className="card min-w-0 p-2.5">
      <div className="flex items-center justify-between text-[12px] font-medium text-slate-600">{label}{icon}</div>
      <div className={`mt-0.5 truncate text-[14px] font-bold ${valueClass}`} title={value}>{value}</div>
      <div className={`mt-0.5 text-[11.5px] font-medium ${subClass}`}>{sub}</div>
    </div>
  );
}

/* ---------------- Step 3 ---------------- */
function defaultMessage(d: InvoiceData) {
  const first = (d.client_name || '').split(' ')[0] || 'there';
  const me = (d.freelancer_name || '').split(' ')[0];
  return `Hi ${first}, please find attached the invoice ${d.invoice_id} for the recent ${d.project_description || 'work'} (${money(computeDueNow(d), d.currency)}). Let me know if you have any questions! Best, ${me}`.trim();
}

function StepDone({ data, pdf, emailEnabled, onReset }: { data: InvoiceData; pdf: { blob: Blob; url: string }; emailEnabled: boolean; onReset: () => void }) {
  const [to, setTo] = useState(data.client_email);
  const [msg, setMsg] = useState(() => defaultMessage(data));
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const size = formatSize(pdf.blob.size);
  const filename = `${data.invoice_id}.pdf`;
  const cur = data.currency || 'USD';

  function download() {
    const a = document.createElement('a'); a.href = pdf.url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  }
  function print() { window.open(pdf.url, '_blank'); }
  async function share() {
    const file = new File([pdf.blob], filename, { type: 'application/pdf' });
    if ((navigator as any).canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: filename }); } catch { /* cancelled */ } }
    else download();
  }
  async function send() {
    setStatus(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) { setStatus({ ok: false, text: 'Enter a valid recipient email.' }); return; }
    setSending(true);
    try {
      const res = await fetch('/api/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), message: msg, subject: `Invoice ${data.invoice_id} from ${data.freelancer_name}`, filename, replyTo: data.freelancer_email, pdfBase64: await blobToBase64(pdf.blob) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `Send failed (${res.status})`);
      setStatus({ ok: true, text: `Invoice sent to ${to.trim()}` });
    } catch (e: any) { setStatus({ ok: false, text: e?.message || 'Send failed' }); }
    finally { setSending(false); }
  }

  return (
    <div>
      <div className="card flex items-start gap-3 bg-gradient-to-br from-emerald-50 to-white p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600"><PartyPopper size={20} /></span>
        <div>
          <div className="text-[17px] font-bold text-ink">Invoice Created Successfully</div>
          <span className="chip mt-1 bg-emerald-600 text-[10.5px] tracking-wider text-white">GENERATED</span>
          <div className="mt-1 text-[14px] text-slate-600">{data.invoice_id} is locked and ready for instant distribution.</div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
        {/* preview */}
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-slate-600"><FileText size={14} /> DOCUMENT PREVIEW</div>
          <div className="card p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div>
                <div className="flex items-center gap-2"><span className="text-[30px] font-extrabold leading-none tracking-tight text-ink sm:text-[36px]">INVOICE</span><span className="chip bg-orange-100 text-orange-700">Unpaid</span></div>
                <div className="mt-1.5 text-[13px] font-bold text-slate-600"># {data.invoice_id}</div>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700"><FileText size={20} /></span>
                <span className="text-[11px] font-semibold text-slate-600">Original Digital Copy</span>
              </div>
            </div>
            <hr className="my-4 border-lav-200" />
            <div className="flex justify-between rounded-xl bg-lav-100 p-3">
              <div><div className="text-[11.5px] text-slate-500">Issue Date</div><div className="text-[15px] font-bold">{data.issue_date}</div></div>
              <div className="text-right"><div className="text-[11.5px] text-slate-500">Due Date</div><div className="text-[15px] font-bold text-red-600">{formatIso(data.project_deadline)}</div></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-lav-200 p-3">
                <div className="text-[11px] font-bold tracking-wide text-slate-500">FROM</div>
                <div className="mt-1 text-[16px] font-bold">{data.freelancer_name}</div>
                <div className="break-all text-[12.5px] text-slate-600">{data.freelancer_email}</div>
                {data.freelancer_company && <div className="text-[12.5px] text-slate-600">{data.freelancer_company}</div>}
              </div>
              <div className="rounded-xl bg-brand-100/70 p-3">
                <div className="text-[11px] font-bold tracking-wide text-slate-500">BILLED TO</div>
                <div className="mt-1 text-[16px] font-bold">{data.client_name}</div>
                <div className="break-all text-[12.5px] text-slate-600">{data.client_email}</div>
                {data.client_company && <div className="text-[12.5px] font-semibold">{data.client_company}</div>}
              </div>
            </div>
            <div className="mt-4 flex border-b border-lav-200 pb-2 text-[11px] font-bold tracking-wide text-slate-500"><span>DESCRIPTION</span><span className="ml-auto">TOTAL</span></div>
            <div className="flex gap-4 border-b border-lav-200 py-3">
              <div className="min-w-0"><div className="text-[14px] font-bold">{data.project_description}</div>{data.project_details && <div className="text-[12px] text-slate-500">{data.project_details}</div>}</div>
              <div className="ml-auto shrink-0 text-[14px] font-bold">{money(data.amount, cur)}</div>
            </div>
            <div className="space-y-1.5 py-3 text-[13.5px]">
              <div className="flex"><span className="text-slate-600">Subtotal</span><span className="ml-auto font-bold">{money(data.amount, cur)}</span></div>
              {toNumber(data.discount_amount) > 0 && <div className="flex"><span className="text-slate-600">Discount</span><span className="ml-auto font-bold text-emerald-700">- {money(data.discount_amount, cur)}</span></div>}
              <div className="flex"><span className="text-slate-600">Tax ({data.tax_note || '0% Service'})</span><span className="ml-auto font-bold">{money(0, cur)}</span></div>
            </div>
            <div className="flex items-center rounded-xl bg-brand-100 p-3">
              <div><div className="text-[12px] font-bold text-brand-800">TOTAL BALANCE DUE</div><div className="text-[12px] text-slate-600">Due {formatIso(data.project_deadline)}</div></div>
              <div className="ml-auto text-[24px] font-extrabold text-brand-700 sm:text-[28px]">{money(computeDueNow(data), cur)}</div>
            </div>
            {data.payment_instructions && (
              <div className="mt-3 flex gap-2 rounded-xl border border-lav-200 p-3 text-[12.5px] text-slate-600"><Landmark size={16} className="shrink-0" /> Payment Terms: {data.payment_instructions}</div>
            )}
          </div>
        </section>

        {/* actions */}
        <section className="space-y-5 lg:sticky lg:top-24">
          <div>
            <div className="mb-2 text-[12.5px] font-bold tracking-wide text-slate-600">DOCUMENT ACTIONS</div>
            <div className="card flex items-center gap-3 p-3">
              <button onClick={download} className="flex flex-1 items-center gap-3 text-left">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700"><Download size={20} /></span>
                <span><span className="block text-[15px] font-bold">Download Invoice PDF</span><span className="block text-[12px] text-slate-500">Standard A4 Layout • {size}</span></span>
              </button>
              <button onClick={print} aria-label="Open / print" className="rounded-lg p-1.5 text-slate-600 hover:bg-lav-100"><Printer size={18} /></button>
              <button onClick={share} aria-label="Share" className="rounded-lg p-1.5 text-slate-600 hover:bg-lav-100"><Share size={18} /></button>
            </div>
          </div>

          {emailEnabled && (
            <div>
              <div className="mb-2 flex items-center text-[12.5px] font-bold tracking-wide text-slate-600">DIRECT DELIVERY<span className="ml-auto flex items-center gap-1 text-[12px] font-semibold tracking-normal text-emerald-700"><Sparkles size={13} /> Instant Delivery</span></div>
              <div className="card space-y-4 p-4">
                <div className="flex gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"><Mail size={20} /></span>
                  <div><div className="text-[16px] font-bold">Send Invoice via Email</div><div className="text-[12.5px] text-slate-500">Recipient will receive the invoice with the PDF attached</div></div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center"><span className="label">Recipient Client Email *</span>
                    {data.client_email && to === data.client_email && <span className="ml-auto flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><CircleCheck size={13} /> Verified from chat</span>}</div>
                  <div className="relative"><AtSign size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input type="email" value={to} onChange={(e) => setTo(e.target.value)} className="field pl-10" placeholder="client@example.com" /></div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center"><span className="label">Email Message *</span>
                    <button onClick={() => setMsg(defaultMessage(data))} className="ml-auto text-[12px] font-semibold text-brand-700 hover:underline">Reset default</button></div>
                  <textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="field min-h-[130px] resize-y leading-relaxed" />
                </div>
                <div className="rounded-xl bg-lav-100 p-3">
                  <div className="text-[13.5px] font-bold">Invoice pdf will be automatically sent.</div>
                  <div className="text-[12px] text-slate-500">Attached as {filename} ({size})</div>
                </div>
                {status && <div className={`flex items-center gap-2 rounded-xl p-3 text-[13.5px] font-medium ${status.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{status.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{status.text}</div>}
                <button onClick={send} disabled={sending || !msg.trim()} className="btn-primary px-5 py-3.5 text-[16px]">
                  <span className="flex items-center justify-center gap-2">{sending ? <Loader2 className="animate-spin" size={18} /> : <SendHorizontal size={18} />} {sending ? 'Sending…' : 'Send Invoice via Email 🚀'}</span>
                </button>
              </div>
            </div>
          )}
          {!emailEnabled && (
            <div className="flex gap-2 rounded-xl border border-lav-200 bg-white p-3 text-[12.5px] text-slate-500"><Info size={16} className="shrink-0" /> Download the PDF and attach it to your own email or chat.</div>
          )}

          <button onClick={onReset} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-lav-200 bg-lav-100 py-3.5 text-[15px] font-semibold text-ink hover:bg-lav-200">
            <PlusCircle size={18} /> Create Another
          </button>
        </section>
      </div>
    </div>
  );
}

/* ---------------- demo data (only used with ?demo=) ---------------- */
const DEMO_CHAT = `Sarah (Acme Health): Hey Alex, thanks for the brand guidelines! Can you invoice us for the 40 hrs design work at $75/hr?\n\nAlex: Sure thing Sarah! Sending it over to sarah.jenkins@acmehealth.io by Friday. Any purchase order number?`;
const DEMO: Partial<InvoiceData> = {
  freelancer_name: 'Alex Morgan', freelancer_email: 'alex@designstudio.co', freelancer_company: 'Morgan Creative Studio LLC',
  client_name: 'Sarah Jenkins', client_email: 'sarah.jenkins@acmehealth.io', client_company: 'Acme Health Inc.',
  project_description: 'Brand Identity Refresh & UI Design Sprint', project_details: '40.0 hrs × $75.00/hr',
  project_deadline: isoDate(new Date(Date.now() + 14 * 864e5)), amount: '3000', currency: 'USD',
  payment_instructions: 'Due within 14 days via Direct Wire / ACH Transfer',
};
