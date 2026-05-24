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

function isoDateFromText(raw) {
  const text = raw.replace(/\s+/g, ' ');
  const patterns = [
    /(?:due date|payment due|pay by|due)[:\s-]*([0-3]?\d[\/\-.][01]?\d[\/\-.](?:20)?\d{2})/i,
    /(?:due date|payment due|pay by|due)[:\s-]*([A-Za-z]{3,9}\s+[0-3]?\d,?\s+20\d{2})/i,
    /([0-3]?\d[\/\-.][01]?\d[\/\-.]20\d{2})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const d = parseDate(m[1]);
      if (d) return d;
    }
  }
  return '';
}

function parseDate(value) {
  const v = value.trim().replace(/\./g, '/').replace(/-/g, '/');
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
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function isValidIsoDate(s) {
  const d = new Date(s + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function amountFromText(raw) {
  const text = raw.replace(/\s+/g, ' ');
  const patterns = [
    /(?:amount due|total due|balance due|payment amount|amount payable)[:\s$AUD]*([0-9,]+\.\d{2})/i,
    /(?:amount due|total due|balance due|payment amount|amount payable)[:\s$AUD]*([0-9,]+)/i,
    /\$\s*([0-9,]+\.\d{2})/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1].replace(/,/g, '')).toFixed(2);
  }
  return '';
}

function billerFromText(raw, fileName) {
  const lines = raw.split('\n').map(x => x.trim()).filter(Boolean);
  const candidates = lines.filter(l => /[A-Za-z]/.test(l) && l.length >= 3 && l.length <= 60);
  return candidates[0] || fileName.replace(/\.pdf$/i, '') || 'Unknown biller';
}

async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }
  return fullText;
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
        biller: billerFromText(text, file.name),
        amount: amountFromText(text),
        due_date: isoDateFromText(text),
        reference: '',
        notes: '',
        file_name: file.name
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
