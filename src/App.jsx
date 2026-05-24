import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Bell, CheckCircle2, FileText, Upload, Trash2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getDevice() {
  let saved = localStorage.getItem('bill_reminder_device');
  if (saved) return JSON.parse(saved);
  const device = { app_instance_id: crypto.randomUUID(), sync_secret: crypto.randomUUID() + crypto.randomUUID() };
  localStorage.setItem('bill_reminder_device', JSON.stringify(device));
  return device;
}

function makeSupabase(syncSecret) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { 'x-sync-secret': syncSecret } }
  });
}

function cleanPdfText(raw) {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getLines(raw) {
  return cleanPdfText(raw)
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function isoDateFromText(raw) {
  const text = cleanPdfText(raw);
  const flat = text.replace(/\s+/g, ' ');
  const candidates = findDateCandidates(text);
  if (!candidates.length) return '';

  const scored = candidates
    .map(c => ({ ...c, score: scoreDateCandidate(c, flat) }))
    .filter(c => c.score > -50)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.iso || '';
}

function findDateCandidates(text) {
  const datePattern = /([0-3]?\d[\/\-.][01]?\d[\/\-.](?:20)?\d{2}|[0-3]?\d\s+(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+20\d{2}|(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+[0-3]?\d,?\s+20\d{2})/gi;
  const out = [];
  for (const match of text.matchAll(datePattern)) {
    const rawDate = match[1];
    const iso = parseDate(rawDate);
    if (!iso) continue;
    const index = match.index || 0;
    const before = text.slice(Math.max(0, index - 140), index);
    const after = text.slice(index + rawDate.length, Math.min(text.length, index + rawDate.length + 140));
    out.push({ rawDate, iso, before, after, index });
  }
  return out;
}

function scoreDateCandidate(candidate, flatText) {
  const context = `${candidate.before} ${candidate.rawDate} ${candidate.after}`.replace(/\s+/g, ' ').toLowerCase();
  let score = 0;

  if (/(amount due|total due|due date|payment due|pay by|please pay|pay before|pay on or before|to avoid late|late payment|overdue)/i.test(context)) score += 80;
  if (/(due)/i.test(context)) score += 25;
  if (/(issue date|invoice date|bill date|statement date|period|from|to|direct debit date)/i.test(context)) score -= 70;

  // If the PDF text extraction splits columns, labels can be far from the date.
  // Optus-style bills often include “How to pay Please pay by the due date…” near the actual due date.
  const globalDueIndex = flatText.search(/(due date|payment due|pay by|please pay|to avoid late payment|late payment)/i);
  if (globalDueIndex >= 0) {
    const distance = Math.abs(candidate.index - globalDueIndex);
    score += Math.max(0, 40 - Math.floor(distance / 100));
  }

  const d = new Date(candidate.iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  if (days >= -30 && days <= 370) score += 15;
  if (days < -90) score -= 20;

  return score;
}
function parseDate(value) {
  if (!value) return '';
  const v = value.trim().replace(/,/g, '').replace(/\./g, '/').replace(/-/g, '/');
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    y = y.length === 2 ? '20' + y : y;
    // Australia-friendly default: DD/MM/YYYY.
    const dd = a.padStart(2, '0');
    const mm = b.padStart(2, '0');
    const iso = `${y}-${mm}-${dd}`;
    return isValidIsoDate(iso) ? iso : '';
  }
  const monthMap = { jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03', apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07', aug:'08', august:'08', sep:'09', sept:'09', september:'09', oct:'10', october:'10', nov:'11', november:'11', dec:'12', december:'12' };
  let m = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})$/);
  if (m) {
    const [, d, mon, y] = m;
    const iso = `${y}-${monthMap[mon.toLowerCase()]}-${d.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : '';
  }
  m = v.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(20\d{2})$/);
  if (m) {
    const [, mon, d, y] = m;
    const iso = `${y}-${monthMap[mon.toLowerCase()]}-${d.padStart(2, '0')}`;
    return isValidIsoDate(iso) ? iso : '';
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function isValidIsoDate(s) {
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function amountFromText(raw) {
  const text = cleanPdfText(raw).replace(/\s+/g, ' ');
  const money = '(?:A\\$|AUD|\\$)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.\\d{2})|[0-9]+(?:\\.\\d{2}))';
  const labelled = [
    `(?:total amount due|amount due|balance due|payment amount|amount payable|please pay|total due|new charges)[:\\s$AUD-]*${money}`,
    `${money}\\s*(?:amount due|total amount due|balance due|due)`
  ];
  for (const pat of labelled) {
    const m = text.match(new RegExp(pat, 'i'));
    if (m) return Number(m[m.length - 1].replace(/,/g, '')).toFixed(2);
  }

  // Fallback: choose the largest dollar amount, which often equals the bill total.
  const amounts = [...text.matchAll(/(?:A\$|AUD|\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2})|[0-9]+(?:\.\d{2}))/gi)]
    .map(m => Number(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n) && n > 0);
  if (amounts.length) return Math.max(...amounts).toFixed(2);
  return '';
}

function referenceFromText(raw) {
  const text = cleanPdfText(raw).replace(/\s+/g, ' ');
  const patterns = [
    /(?:reference number|payment reference|customer reference|ref(?:erence)?|account number|account no\.?|invoice number|invoice no\.?)[:\s#-]*([A-Z0-9][A-Z0-9\s-]{4,30})/i,
    /(?:BPAY|BPay).*?(?:ref(?:erence)?|crn)[:\s#-]*([0-9\s]{6,30})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s{2,}/g, ' ').trim();
  }
  // Filename fallback for bills where the account/reference is embedded in the PDF name.
  const longNumber = text.match(/\b\d{8,15}\b/);
  return longNumber ? longNumber[0] : '';
}

function notesFromText(raw) {
  const text = cleanPdfText(raw).replace(/\s+/g, ' ');
  const bpay = text.match(/(?:BPAY|BPay).{0,120}/i)?.[0];
  const payment = text.match(/(?:payment options|how to pay|pay your bill).{0,160}/i)?.[0];
  return [bpay, payment].filter(Boolean).join('\n');
}

function billerFromText(raw, fileName) {
  const lines = getLines(raw);
  const joined = cleanPdfText(raw).replace(/\s+/g, ' ');

  const companyPattern = /([A-Z][A-Za-z&.\s]{2,80}(?:Pty\.?\s*Ltd\.?|Limited|Ltd\.?|Inc\.?|Corporation|Services|Energy|Water|Telecom|Billing)[A-Za-z&.\s]{0,40})/i;
  const company = joined.match(companyPattern)?.[1]?.trim();
  if (company) return tidyBiller(company);

  const bad = /tax invoice|invoice|statement|bill|page \d|amount|due|date|account|reference|total|payment/i;
  const candidate = lines.find(l => /[A-Za-z]/.test(l) && l.length >= 3 && l.length <= 70 && !bad.test(l));
  return tidyBiller(candidate || fileName.replace(/\.pdf$/i, '') || 'Unknown biller');
}

function tidyBiller(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bABN\b.*$/i, '')
    .replace(/\bTax Invoice\b.*$/i, '')
    .replace(/[\s·|,-]+$/g, '')
    .trim();
}

function extractBillDetails(text, fileName) {
  return {
    biller: billerFromText(text, fileName),
    amount: amountFromText(text),
    due_date: isoDateFromText(text),
    reference: referenceFromText(text),
    notes: notesFromText(text),
    file_name: fileName
  };
}

async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += layoutTextItems(content.items) + '\n';
  }

  return fullText;
}

function layoutTextItems(items) {
  const positioned = items
    .filter(item => item.str && item.str.trim())
    .map(item => ({
      text: item.str.trim(),
      x: item.transform?.[4] || 0,
      y: Math.round(item.transform?.[5] || 0)
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const item of positioned) {
    let row = rows.find(r => Math.abs(r.y - item.y) <= 3);
    if (!row) {
      row = { y: item.y, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }

  return rows
    .map(row => row.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
    .join('\n');
}
function daysUntil(date) {
  const today = new Date();
  const d = new Date(date + 'T00:00:00');
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / 86400000);
}

function App() {
  const [device] = useState(getDevice);
  const supabase = useMemo(() => makeSupabase(device.sync_secret), [device.sync_secret]);
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState({ biller: '', amount: '', due_date: '', reference: '', notes: '', file_name: '' });
  const [message, setMessage] = useState('');
  const [rawText, setRawText] = useState('');

  async function loadBills() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('app_instance_id', device.app_instance_id)
      .order('due_date', { ascending: true });
    if (error) setMessage(error.message);
    else setBills(data || []);
  }

  useEffect(() => { loadBills(); }, []);

  useEffect(() => {
    const timer = setInterval(() => checkReminders(), 60000);
    checkReminders();
    return () => clearInterval(timer);
  }, [bills]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage('Reading PDF...');
    try {
      const text = await extractPdfText(file);
      setRawText(text.slice(0, 5000));
      setForm({
        ...extractBillDetails(text, file.name)
      });
      setMessage('PDF read. Please confirm the details before saving.');
    } catch (err) {
      setMessage('Could not read this PDF. It may be scanned; OCR would be the next upgrade.');
    }
  }

  async function saveBill(e) {
    e.preventDefault();
    if (!supabase) return setMessage('Add your Supabase URL and anon key to .env.local first.');
    const payload = {
      id: crypto.randomUUID(),
      app_instance_id: device.app_instance_id,
      sync_secret: device.sync_secret,
      biller: form.biller,
      amount: Number(form.amount),
      due_date: form.due_date,
      reference: form.reference || null,
      notes: form.notes || null,
      file_name: form.file_name || null,
      status: 'unpaid',
      reminded_for: []
    };
    const { error } = await supabase.from('bills').insert(payload);
    if (error) setMessage(error.message);
    else {
      setMessage('Bill saved.');
      setForm({ biller: '', amount: '', due_date: '', reference: '', notes: '', file_name: '' });
      setRawText('');
      loadBills();
    }
  }

  async function markPaid(bill) {
    const { error } = await supabase.from('bills').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', bill.id);
    if (error) setMessage(error.message); else loadBills();
  }

  async function deleteBill(bill) {
    const { error } = await supabase.from('bills').delete().eq('id', bill.id);
    if (error) setMessage(error.message); else loadBills();
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return setMessage('This browser does not support notifications.');
    const permission = await Notification.requestPermission();
    setMessage(permission === 'granted' ? 'Notifications enabled.' : 'Notifications not enabled.');
  }

  async function checkReminders() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !supabase) return;
    for (const bill of bills) {
      if (bill.status === 'paid') continue;
      const days = daysUntil(bill.due_date);
      const key = days === 3 ? '3-days-before' : days === 0 ? 'due-date' : null;
      if (!key || bill.reminded_for?.includes(key)) continue;
      new Notification(`Bill reminder: ${bill.biller}`, { body: `$${bill.amount} is due ${bill.due_date}` });
      await supabase.from('bills').update({ reminded_for: [...(bill.reminded_for || []), key] }).eq('id', bill.id);
      loadBills();
    }
  }

  return <main>
    <section className="hero">
      <div>
        <h1>Bill Reminder MVP</h1>
        <p>Upload a PDF, confirm the detected amount and due date, then save it to Supabase.</p>
      </div>
      <button onClick={requestNotifications}><Bell size={18}/> Enable reminders</button>
    </section>

    <section className="card">
      <label className="upload"><Upload size={20}/> Upload bill PDF<input type="file" accept="application/pdf" onChange={handleFile}/></label>
      <form onSubmit={saveBill} className="grid">
        <input required placeholder="Biller" value={form.biller} onChange={e => setForm({...form, biller:e.target.value})}/>
        <input required placeholder="Amount" type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})}/>
        <input required type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})}/>
        <input placeholder="Reference" value={form.reference} onChange={e => setForm({...form, reference:e.target.value})}/>
        <input placeholder="File name" value={form.file_name} onChange={e => setForm({...form, file_name:e.target.value})}/>
        <textarea placeholder="Notes" value={form.notes} onChange={e => setForm({...form, notes:e.target.value})}/>
        <button className="primary">Save bill</button>
      </form>
      {message && <p className="message">{message}</p>}
      {rawText && <details><summary>Preview extracted text</summary><pre>{rawText}</pre></details>}
    </section>

    <section className="card">
      <h2>Saved bills</h2>
      <div className="list">
        {bills.map(bill => <article key={bill.id} className={bill.status === 'paid' ? 'paid bill' : 'bill'}>
          <FileText size={20}/>
          <div className="grow">
            <strong>{bill.biller}</strong>
            <p>${bill.amount} due {bill.due_date} · {daysUntil(bill.due_date)} days</p>
            {bill.reference && <small>Ref: {bill.reference}</small>}
          </div>
          {bill.status === 'unpaid' && <button onClick={() => markPaid(bill)}><CheckCircle2 size={16}/> Paid</button>}
          <button className="danger" onClick={() => deleteBill(bill)}><Trash2 size={16}/></button>
        </article>)}
        {!bills.length && <p>No bills saved yet.</p>}
      </div>
    </section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
