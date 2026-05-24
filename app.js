const STORE_KEY = "bill-minder:bills";
const SETTINGS_KEY = "bill-minder:settings";
const DEFAULT_SUPABASE_URL = "https://yhjffaxtjrmiwdxramxz.supabase.co";
const DEFAULT_SETTINGS = {
  reminderLeadDays: 3,
  notifications: false,
  appInstanceId: crypto.randomUUID(),
  syncSecret: crypto.randomUUID(),
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseAnonKey: ""
};

const state = {
  bills: readJson(STORE_KEY, []),
  settings: { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) },
  filter: "unpaid",
  deferredInstallPrompt: null
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  totalUnpaid: document.querySelector("#totalUnpaid"),
  dueSoonCount: document.querySelector("#dueSoonCount"),
  overdueCount: document.querySelector("#overdueCount"),
  billList: document.querySelector("#billList"),
  emptyState: document.querySelector("#emptyState"),
  template: document.querySelector("#billItemTemplate"),
  form: document.querySelector("#billForm"),
  pdfInput: document.querySelector("#pdfInput"),
  billerInput: document.querySelector("#billerInput"),
  amountInput: document.querySelector("#amountInput"),
  dueDateInput: document.querySelector("#dueDateInput"),
  referenceInput: document.querySelector("#referenceInput"),
  notesInput: document.querySelector("#notesInput"),
  dropZone: document.querySelector("#dropZone"),
  extractStatus: document.querySelector("#extractStatus"),
  extractPreview: document.querySelector("#extractPreview"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  notificationToggle: document.querySelector("#notificationToggle"),
  reminderLeadSelect: document.querySelector("#reminderLeadSelect"),
  installButton: document.querySelector("#installButton"),
  supabaseUrlInput: document.querySelector("#supabaseUrlInput"),
  supabaseKeyInput: document.querySelector("#supabaseKeyInput"),
  saveSupabaseButton: document.querySelector("#saveSupabaseButton"),
  syncSupabaseButton: document.querySelector("#syncSupabaseButton"),
  restoreSupabaseButton: document.querySelector("#restoreSupabaseButton"),
  syncStatus: document.querySelector("#syncStatus")
};

const moneyFormat = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "AUD"
});

init();

function init() {
  els.todayLabel.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date());

  setupNavigation();
  setupUpload();
  setupSettings();
  setupInstall();
  render();
  checkDueNotifications();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
}

function setupNavigation() {
  document.querySelectorAll("[data-view], [data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view || button.dataset.viewJump;
      showView(view);
    });
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
      });
      renderBills();
    });
  });
}

function showView(view) {
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("is-visible", section.id === `${view}View`);
  });
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
}

function setupUpload() {
  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("is-dragging");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    const file = event.dataTransfer.files[0];
    if (file) {
      handlePdf(file);
    }
  });

  els.pdfInput.addEventListener("change", () => {
    const file = els.pdfInput.files[0];
    if (file) {
      handlePdf(file);
    }
  });

  document.querySelector("#clearFormButton").addEventListener("click", clearForm);

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const bill = {
      id: crypto.randomUUID(),
      biller: els.billerInput.value.trim(),
      amount: Number(els.amountInput.value),
      dueDate: els.dueDateInput.value,
      reference: els.referenceInput.value.trim(),
      notes: els.notesInput.value.trim(),
      fileName: els.pdfInput.files[0]?.name || "",
      status: "unpaid",
      createdAt: new Date().toISOString(),
      remindedFor: []
    };

    state.bills.push(bill);
    saveBills();
    clearForm();
    showView("dashboard");
    render();
  });
}

async function handlePdf(file) {
  els.extractStatus.textContent = `Reading ${file.name}...`;
  els.confidenceBadge.textContent = "Reading";
  els.extractPreview.textContent = "";

  const buffer = await file.arrayBuffer();
  const readable = await decodePdfText(buffer);
  const details = extractBillDetails(readable, file.name);

  fillIfFound(els.billerInput, details.biller);
  fillIfFound(els.amountInput, details.amount);
  fillIfFound(els.dueDateInput, details.dueDate);
  fillIfFound(els.referenceInput, details.reference);

  const foundCount = ["biller", "amount", "dueDate", "reference"].filter((key) => details[key]).length;
  els.confidenceBadge.textContent = foundCount >= 3 ? "Good" : foundCount >= 2 ? "Partial" : "Manual";
  els.extractStatus.textContent = foundCount
    ? "I found a few likely details. Please check them before saving."
    : "This PDF may be scanned or compressed. Add the details manually for now.";
  els.extractPreview.textContent = readable.slice(0, 4000) || "No readable text found in this PDF.";
}

async function decodePdfText(buffer) {
  const rawText = new TextDecoder("latin1").decode(buffer);
  const streamText = await decodeCompressedPdfStreams(buffer, rawText);
  return streamText || decodePdfLikeText(rawText);
}

async function decodeCompressedPdfStreams(buffer, rawText) {
  if (!("DecompressionStream" in window)) return "";

  const chunks = [];
  let position = 0;

  while ((position = rawText.indexOf("stream", position)) !== -1) {
    const dictionary = rawText.slice(Math.max(0, rawText.lastIndexOf("<<", position)), position);
    let start = position + "stream".length;
    if (rawText[start] === "\r" && rawText[start + 1] === "\n") {
      start += 2;
    } else if (rawText[start] === "\n") {
      start += 1;
    }

    const end = rawText.indexOf("endstream", start);
    if (end === -1) break;

    if (/FlateDecode/.test(dictionary)) {
      let streamBytes = new Uint8Array(buffer.slice(start, end));
      while (streamBytes.length && (streamBytes[streamBytes.length - 1] === 10 || streamBytes[streamBytes.length - 1] === 13)) {
        streamBytes = streamBytes.slice(0, -1);
      }

      try {
        const inflated = await inflateDeflateStream(streamBytes);
        const text = new TextDecoder("latin1").decode(inflated);
        if (/\bBT\b/.test(text)) {
          chunks.push(extractPdfLiteralStrings(text));
        }
      } catch {
        // Some streams are images or use unsupported filters; ignore them.
      }
    }

    position = end + "endstream".length;
  }

  return normalizeExtractedText(chunks.join("\n"));
}

async function inflateDeflateStream(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractPdfLiteralStrings(contentStream) {
  const strings = [];
  const pattern = /\((?:\\.|[^\\()])*\)\s*Tj/g;
  let match = pattern.exec(contentStream);

  while (match) {
    const raw = match[0].slice(1, match[0].lastIndexOf(")"));
    strings.push(unescapePdfString(raw));
    match = pattern.exec(contentStream);
  }

  return strings.join("\n");
}

function unescapePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, char) => {
      const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      return escapes[char] || char;
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function decodePdfLikeText(rawText) {
  const literalStrings = [];
  const stringPattern = /\(([^()]{2,})\)/g;
  let match = stringPattern.exec(rawText);

  while (match) {
    literalStrings.push(
      match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\t/g, " ")
        .replace(/\\([()\\])/g, "$1")
    );
    match = stringPattern.exec(rawText);
  }

  const fallback = rawText
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeExtractedText(literalStrings.join("\n") || fallback);
}

function normalizeExtractedText(text) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractBillDetails(text, fileName) {
  const normalized = text.replace(/\s+/g, " ");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const amountMatch = normalized.match(/(?:amount due|total due|balance due|payable|total)\D{0,20}([$]?\s?\d{1,4}(?:,\d{3})*(?:\.\d{2})?)/i);
  const dateMatch = normalized.match(/(?:due date|payment due|pay by|due)\D{0,24}(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4})/i);
  const referenceMatch = normalized.match(/(?:account|reference|invoice|bill)\s*(?:number|no|#)?\D{0,12}([A-Z0-9][A-Z0-9 -]{4,24})/i);

  return {
    biller: findBiller(lines) || cleanupBiller(fileName.replace(/\.pdf$/i, "")),
    amount: findAmount(lines) || (amountMatch ? amountMatch[1].replace(/[$,\s]/g, "") : ""),
    dueDate: findDueDate(lines) || (dateMatch ? toDateInputValue(dateMatch[1]) : ""),
    reference: findReference(lines) || (referenceMatch ? referenceMatch[1].trim() : "")
  };
}

function findBiller(lines) {
  const companyLine = lines.find((line) => /\b(Pty\.?\s*Ltd|Limited|Ltd|Inc|LLC|Services)\b/i.test(line));
  if (companyLine) return cleanupBiller(companyLine);

  const skip = /^(page|tax invoice|invoice no|issue date|account number|total|amount|date)$/i;
  const candidate = lines.find((line) => /[a-z]/i.test(line) && !skip.test(line) && !/\d{4,}/.test(line));
  return cleanupBiller(candidate);
}

function findAmount(lines) {
  const amountLineIndex = lines.findIndex((line) => /total amount due|amount due|balance due/i.test(line));
  if (amountLineIndex !== -1) {
    const nearby = [
      lines[amountLineIndex - 2],
      lines[amountLineIndex - 1],
      lines[amountLineIndex + 1],
      lines[amountLineIndex + 2]
    ].filter(Boolean);
    const amount = nearby.map(extractMoney).find(Boolean);
    if (amount) return amount;
  }

  const totalLine = lines.find((line) => /total.*\$\d/i.test(line));
  return extractMoney(totalLine || "");
}

function findDueDate(lines) {
  const dueLineIndex = lines.findIndex((line) => /bill due date|due date|pay by|payment due/i.test(line));
  if (dueLineIndex !== -1) {
    const nearby = [
      lines[dueLineIndex - 2],
      lines[dueLineIndex - 1],
      lines[dueLineIndex + 1],
      lines[dueLineIndex + 2]
    ].filter(Boolean);
    const date = nearby.map(extractDate).find(Boolean);
    if (date) return date;
  }

  const dueText = lines.find((line) => /due/i.test(line)) || "";
  return extractDate(dueText);
}

function findReference(lines) {
  return valueNearLabel(lines, /account number/i) || valueNearLabel(lines, /cust ref/i) || valueNearLabel(lines, /invoice number/i);
}

function valueNearLabel(lines, labelPattern) {
  const index = lines.findIndex((line) => labelPattern.test(line));
  if (index === -1) return "";

  const inline = lines[index].replace(labelPattern, "").replace(/[:#]/g, "").trim();
  if (/^[A-Z0-9][A-Z0-9 -]{4,24}$/i.test(inline)) return inline;

  return (lines[index + 1] || "").trim();
}

function extractMoney(value) {
  const match = value.match(/\$?\s?(\d{1,4}(?:,\d{3})*\.\d{2})/);
  return match ? match[1].replace(/,/g, "") : "";
}

function extractDate(value) {
  const match = value.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{2,4})/i);
  return match ? toDateInputValue(match[1]) : "";
}

function cleanupBiller(value) {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b(invoice|bill|statement|pdf)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 60);
}

function toDateInputValue(value) {
  const clean = value.replace(/(\d)(st|nd|rd|th)\b/i, "$1");
  const namedDateMatch = clean.match(/^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})$/i);
  if (namedDateMatch) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(namedDateMatch[2].toLowerCase().slice(0, 3)) + 1;
    return formatDateParts(normalizeYear(namedDateMatch[3]), month, Number(namedDateMatch[1]));
  }

  const slashMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = normalizeYear(slashMatch[3]);
    const dayFirst = first > 12 || navigator.language.toLowerCase().includes("au");
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    return formatDateParts(year, month, day);
  }

  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function normalizeYear(year) {
  const number = Number(year);
  return number < 100 ? 2000 + number : number;
}

function formatDateParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fillIfFound(input, value) {
  if (value) {
    input.value = value;
  }
}

function clearForm() {
  els.form.reset();
  els.extractStatus.textContent = "Upload a PDF and I will look for amount, due date, biller, and reference details.";
  els.extractPreview.textContent = "";
  els.confidenceBadge.textContent = "Waiting";
}

function setupSettings() {
  const notificationsSupported = "Notification" in window;
  els.notificationToggle.disabled = !notificationsSupported;
  els.notificationToggle.checked = notificationsSupported && state.settings.notifications && Notification.permission === "granted";
  els.reminderLeadSelect.value = String(state.settings.reminderLeadDays);
  if (!state.settings.supabaseUrl) {
    state.settings.supabaseUrl = DEFAULT_SUPABASE_URL;
    saveSettings();
  }
  els.supabaseUrlInput.value = state.settings.supabaseUrl;
  els.supabaseKeyInput.value = state.settings.supabaseAnonKey || "";
  updateSyncStatus();

  els.notificationToggle.addEventListener("change", async () => {
    if (!notificationsSupported) {
      els.notificationToggle.checked = false;
      state.settings.notifications = false;
      saveSettings();
      return;
    }

    if (els.notificationToggle.checked) {
      const permission = await Notification.requestPermission();
      state.settings.notifications = permission === "granted";
      els.notificationToggle.checked = state.settings.notifications;
    } else {
      state.settings.notifications = false;
    }
    saveSettings();
  });

  els.reminderLeadSelect.addEventListener("change", () => {
    state.settings.reminderLeadDays = Number(els.reminderLeadSelect.value);
    saveSettings();
  });

  document.querySelector("#exportButton").addEventListener("click", exportBills);
  document.querySelector("#clearBillsButton").addEventListener("click", () => {
    if (confirm("Clear all saved bills from this browser?")) {
      state.bills = [];
      saveBills();
      render();
    }
  });

  els.saveSupabaseButton.addEventListener("click", () => {
    state.settings.supabaseUrl = els.supabaseUrlInput.value.trim().replace(/\/+$/, "");
    state.settings.supabaseAnonKey = els.supabaseKeyInput.value.trim();
    saveSettings();
    updateSyncStatus("Connection saved.");
  });

  els.syncSupabaseButton.addEventListener("click", syncSupabase);
  els.restoreSupabaseButton.addEventListener("click", restoreSupabase);
}

function setupInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

function render() {
  renderStats();
  renderBills();
}

function renderStats() {
  const unpaid = state.bills.filter((bill) => bill.status !== "paid");
  const today = startOfDay(new Date());
  const soonLimit = addDays(today, 7);

  const total = unpaid.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const dueSoon = unpaid.filter((bill) => {
    const due = dateFromInput(bill.dueDate);
    return due >= today && due <= soonLimit;
  });
  const overdue = unpaid.filter((bill) => dateFromInput(bill.dueDate) < today);

  els.totalUnpaid.textContent = moneyFormat.format(total);
  els.dueSoonCount.textContent = String(dueSoon.length);
  els.overdueCount.textContent = String(overdue.length);
}

function renderBills() {
  els.billList.innerHTML = "";
  const bills = filteredBills().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  els.emptyState.hidden = bills.length > 0;

  bills.forEach((bill) => {
    const item = els.template.content.firstElementChild.cloneNode(true);
    const status = getBillStatus(bill);
    item.querySelector("h4").textContent = bill.biller;
    item.querySelector(".bill-meta").textContent = `${formatDisplayDate(bill.dueDate)}${bill.reference ? ` - Ref ${bill.reference}` : ""}`;
    item.querySelector(".bill-notes").textContent = bill.notes || bill.fileName || "";
    item.querySelector(".bill-amount").textContent = moneyFormat.format(Number(bill.amount || 0));

    const pill = item.querySelector(".status-pill");
    pill.textContent = status.label;
    pill.classList.add(status.kind);

    item.querySelector(".mark-paid").addEventListener("click", () => {
      bill.status = bill.status === "paid" ? "unpaid" : "paid";
      saveBills();
      render();
    });

    item.querySelector(".delete-bill").addEventListener("click", () => {
      state.bills = state.bills.filter((candidate) => candidate.id !== bill.id);
      saveBills();
      render();
    });

    els.billList.append(item);
  });
}

function filteredBills() {
  if (state.filter === "paid") {
    return state.bills.filter((bill) => bill.status === "paid");
  }
  if (state.filter === "unpaid") {
    return state.bills.filter((bill) => bill.status !== "paid");
  }
  return state.bills;
}

function getBillStatus(bill) {
  if (bill.status === "paid") return { label: "Paid", kind: "paid" };
  const today = startOfDay(new Date());
  const due = dateFromInput(bill.dueDate);
  if (due < today) return { label: "Overdue", kind: "overdue" };
  if (due <= addDays(today, 7)) return { label: "Due soon", kind: "soon" };
  return { label: "Upcoming", kind: "upcoming" };
}

function checkDueNotifications() {
  if (!("Notification" in window) || !state.settings.notifications || Notification.permission !== "granted") return;

  const targetDate = formatDatePartsFromDate(addDays(new Date(), state.settings.reminderLeadDays));
  state.bills
    .filter((bill) => bill.status !== "paid" && bill.dueDate === targetDate)
    .forEach((bill) => {
      const reminderKey = `${bill.dueDate}:${state.settings.reminderLeadDays}`;
      if (bill.remindedFor?.includes(reminderKey)) return;

      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(`${bill.biller} is due ${state.settings.reminderLeadDays ? "soon" : "today"}`, {
          body: `${moneyFormat.format(Number(bill.amount || 0))} due on ${formatDisplayDate(bill.dueDate)}`,
          tag: `bill-${bill.id}-${reminderKey}`,
          icon: "icons/icon.svg"
        });
      });

      bill.remindedFor = [...(bill.remindedFor || []), reminderKey];
      saveBills();
    });
}

function exportBills() {
  const blob = new Blob([JSON.stringify({ bills: state.bills, settings: state.settings }, null, 2)], {
    type: "application/json"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `bill-minder-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveBills() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state.bills));
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

async function syncSupabase() {
  if (!hasSyncConnection()) {
    updateSyncStatus("Add Supabase details for local testing, or use the hosted Cloudflare app.");
    return;
  }

  els.syncSupabaseButton.disabled = true;
  updateSyncStatus("Syncing...");

  try {
    await upsertRemoteBills(state.bills);
    const remoteBills = await fetchRemoteBills();
    const merged = mergeBills(state.bills, remoteBills);
    state.bills = merged;
    saveBills();
    render();
    updateSyncStatus(`Synced ${merged.length} bill${merged.length === 1 ? "" : "s"}.`);
  } catch (error) {
    updateSyncStatus(error.message || "Sync failed.");
  } finally {
    els.syncSupabaseButton.disabled = false;
  }
}

async function restoreSupabase() {
  if (!hasSyncConnection()) {
    updateSyncStatus("Add Supabase details for local testing, or use the hosted Cloudflare app.");
    return;
  }

  els.restoreSupabaseButton.disabled = true;
  updateSyncStatus("Restoring from cloud...");

  try {
    const remoteBills = await fetchRemoteBills();
    state.bills = mergeBills(state.bills, remoteBills);
    saveBills();
    render();
    updateSyncStatus(`Restored ${remoteBills.length} cloud bill${remoteBills.length === 1 ? "" : "s"}.`);
  } catch (error) {
    updateSyncStatus(error.message || "Restore failed.");
  } finally {
    els.restoreSupabaseButton.disabled = false;
  }
}

async function upsertRemoteBills(bills) {
  if (!bills.length) return;

  if (useCloudflareSync()) {
    const response = await cloudflareSyncRequest("/api/bills", {
      method: "POST",
      body: JSON.stringify({
        appInstanceId: state.settings.appInstanceId,
        bills
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
    return;
  }

  const rows = bills.map((bill) => ({
    id: bill.id,
    app_instance_id: state.settings.appInstanceId,
    sync_secret: state.settings.syncSecret,
    biller: bill.biller,
    amount: bill.amount,
    due_date: bill.dueDate,
    reference: bill.reference || null,
    notes: bill.notes || null,
    file_name: bill.fileName || null,
    status: bill.status,
    reminded_for: bill.remindedFor || [],
    created_at: bill.createdAt,
    updated_at: new Date().toISOString()
  }));

  const response = await supabaseRequest("/rest/v1/bills", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function fetchRemoteBills() {
  if (useCloudflareSync()) {
    const appId = encodeURIComponent(state.settings.appInstanceId);
    const response = await cloudflareSyncRequest(`/api/bills?appInstanceId=${appId}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const payload = await response.json();
    return payload.bills || [];
  }

  const appId = encodeURIComponent(state.settings.appInstanceId);
  const response = await supabaseRequest(`/rest/v1/bills?app_instance_id=eq.${appId}&select=*`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const rows = await response.json();
  return rows.map((row) => ({
    id: row.id,
    biller: row.biller,
    amount: Number(row.amount),
    dueDate: row.due_date,
    reference: row.reference || "",
    notes: row.notes || "",
    fileName: row.file_name || "",
    status: row.status || "unpaid",
    createdAt: row.created_at,
    remindedFor: row.reminded_for || []
  }));
}

function hasSyncConnection() {
  return useCloudflareSync() || Boolean(state.settings.supabaseUrl && state.settings.supabaseAnonKey);
}

function useCloudflareSync() {
  return location.protocol.startsWith("http") && !["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function cloudflareSyncRequest(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": state.settings.syncSecret,
      ...(options.headers || {})
    }
  });
}

function supabaseRequest(path, options = {}) {
  return fetch(`${state.settings.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: state.settings.supabaseAnonKey,
      Authorization: `Bearer ${state.settings.supabaseAnonKey}`,
      "Content-Type": "application/json",
      "x-sync-secret": state.settings.syncSecret,
      ...(options.headers || {})
    }
  });
}

function mergeBills(localBills, remoteBills) {
  const billsById = new Map();
  [...remoteBills, ...localBills].forEach((bill) => {
    billsById.set(bill.id, bill);
  });
  return Array.from(billsById.values());
}

function updateSyncStatus(message) {
  if (message) {
    els.syncStatus.textContent = message;
    return;
  }

  if (useCloudflareSync()) {
    els.syncStatus.textContent = `Cloud sync ready. Device ID: ${state.settings.appInstanceId}`;
    return;
  }

  els.syncStatus.textContent = state.settings.supabaseUrl
    ? `Connected. Device ID: ${state.settings.appInstanceId}`
    : "Not connected.";
}

function dateFromInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return startOfDay(new Date(year, month - 1, day));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function formatDatePartsFromDate(date) {
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(dateFromInput(value));
}
