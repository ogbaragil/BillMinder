const STORE_KEY = "bill-minder:bills";
const SETTINGS_KEY = "bill-minder:settings";
const AUTH_KEY = "bill-minder:auth";
const DEFAULT_SETTINGS = {
  reminderLeadDays: 3,
  emailReminders: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Melbourne",
  appInstanceId: crypto.randomUUID(),
  syncSecret: crypto.randomUUID()
};

const state = {
  bills: readJson(STORE_KEY, []),
  settings: { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) },
  auth: readJson(AUTH_KEY, null),
  filter: "unpaid",
  deferredInstallPrompt: null,
  currentPdfFile: null,
  reschedulingBillId: null,
  recoveryToken: ""
};

const els = {
  authScreen: document.querySelector("#authScreen"),
  authSigninCard: document.querySelector("#authSigninCard"),
  authSignupCard: document.querySelector("#authSignupCard"),
  appShell: document.querySelector("#appShell"),
  authScreenStatus: document.querySelector("#authScreenStatus"),
  authScreenEmailInput: document.querySelector("#authScreenEmailInput"),
  authScreenPasswordInput: document.querySelector("#authScreenPasswordInput"),
  authScreenLoginButton: document.querySelector("#authScreenLoginButton"),
  authScreenSignupButton: document.querySelector("#authScreenSignupButton"),
  authScreenForgotButton: document.querySelector("#authScreenForgotButton"),
  authSignupStatus: document.querySelector("#authSignupStatus"),
  authSignupEmailInput: document.querySelector("#authSignupEmailInput"),
  authSignupPasswordInput: document.querySelector("#authSignupPasswordInput"),
  authSignupConfirmPasswordInput: document.querySelector("#authSignupConfirmPasswordInput"),
  authCreateAccountButton: document.querySelector("#authCreateAccountButton"),
  backToSigninButton: document.querySelector("#backToSigninButton"),
  signupModal: document.querySelector("#signupModal"),
  signupForm: document.querySelector("#signupForm"),
  signupStatus: document.querySelector("#signupStatus"),
  signupEmailInput: document.querySelector("#signupEmailInput"),
  signupPasswordInput: document.querySelector("#signupPasswordInput"),
  signupConfirmPasswordInput: document.querySelector("#signupConfirmPasswordInput"),
  closeSignupModalButton: document.querySelector("#closeSignupModalButton"),
  cancelSignupButton: document.querySelector("#cancelSignupButton"),
  createAccountButton: document.querySelector("#createAccountButton"),
  rescheduleModal: document.querySelector("#rescheduleModal"),
  rescheduleForm: document.querySelector("#rescheduleForm"),
  rescheduleStatus: document.querySelector("#rescheduleStatus"),
  rescheduleDateInput: document.querySelector("#rescheduleDateInput"),
  closeRescheduleButton: document.querySelector("#closeRescheduleButton"),
  cancelRescheduleButton: document.querySelector("#cancelRescheduleButton"),
  resetPasswordModal: document.querySelector("#resetPasswordModal"),
  resetPasswordForm: document.querySelector("#resetPasswordForm"),
  resetPasswordStatus: document.querySelector("#resetPasswordStatus"),
  newPasswordInput: document.querySelector("#newPasswordInput"),
  confirmNewPasswordInput: document.querySelector("#confirmNewPasswordInput"),
  closeResetPasswordButton: document.querySelector("#closeResetPasswordButton"),
  cancelResetPasswordButton: document.querySelector("#cancelResetPasswordButton"),
  saveNewPasswordButton: document.querySelector("#saveNewPasswordButton"),
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
  aiExtractButton: document.querySelector("#aiExtractButton"),
  dropZone: document.querySelector("#dropZone"),
  extractStatus: document.querySelector("#extractStatus"),
  extractPreview: document.querySelector("#extractPreview"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  authStatus: document.querySelector("#authStatus"),
  logoutButton: document.querySelector("#logoutButton"),
  reminderLeadSelect: document.querySelector("#reminderLeadSelect"),
  emailReminderToggle: document.querySelector("#emailReminderToggle"),
  emailReminderHint: document.querySelector("#emailReminderHint"),
  installButton: document.querySelector("#installButton"),
  importInput: document.querySelector("#importInput"),
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
  handleRecoveryRedirect();
  updateAuthGate();
  render();

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
  els.aiExtractButton.addEventListener("click", extractWithAi);

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
  state.currentPdfFile = file;
  els.aiExtractButton.disabled = false;
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

async function extractWithAi() {
  if (!state.currentPdfFile) return;

  if (!useCloudflareSync()) {
    els.extractStatus.textContent = "AI extraction is available on the hosted Cloudflare app.";
    return;
  }

  els.aiExtractButton.disabled = true;
  els.extractStatus.textContent = "AI is reading the PDF...";
  els.confidenceBadge.textContent = "AI";

  try {
    const formData = new FormData();
    formData.append("pdf", state.currentPdfFile, state.currentPdfFile.name);

    const response = await fetch("/api/extract-bill", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json();
    fillIfFound(els.billerInput, result.biller);
    fillIfFound(els.amountInput, result.amountDue);
    fillIfFound(els.dueDateInput, result.dueDate);
    fillIfFound(els.referenceInput, result.reference || result.invoiceNumber);
    if (result.notes) {
      els.notesInput.value = result.notes;
    }

    els.extractStatus.textContent = "AI found likely bill details. Please check them before saving.";
    els.confidenceBadge.textContent = `${Math.round(Number(result.confidence || 0) * 100)}%`;
    els.extractPreview.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    els.extractStatus.textContent = "AI extraction failed. You can still enter the details manually.";
    els.extractPreview.textContent = error.message || "AI extraction failed.";
  } finally {
    els.aiExtractButton.disabled = false;
  }
}

async function decodePdfText(buffer) {
  const rawText = new TextDecoder("latin1").decode(buffer);
  const streamText = await decodeCompressedPdfStreams(buffer, rawText);
  return streamText || decodePdfLikeText(rawText);
}

async function decodeCompressedPdfStreams(buffer, rawText) {
  if (!("DecompressionStream" in window)) return "";

  const fontMaps = await buildToUnicodeFontMaps(buffer, rawText);
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
          chunks.push(extractPdfTextFromContentStream(text, fontMaps));
        }
      } catch {
        // Some streams are images or use unsupported filters; ignore them.
      }
    }

    position = end + "endstream".length;
  }

  return normalizeExtractedText(chunks.join("\n"));
}

async function buildToUnicodeFontMaps(buffer, rawText) {
  const maps = new Map();
  const resourceFontPattern = /\/(F[A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g;
  let resourceMatch = resourceFontPattern.exec(rawText);

  while (resourceMatch) {
    const fontName = resourceMatch[1];
    const fontObject = readPdfObject(rawText, resourceMatch[2]);
    const unicodeMatch = fontObject.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (unicodeMatch && !maps.has(fontName)) {
      const cmap = await readPdfObjectStream(buffer, rawText, unicodeMatch[1]);
      const parsed = parseToUnicodeCMap(cmap);
      if (parsed.entries.size) {
        maps.set(fontName, parsed);
      }
    }
    resourceMatch = resourceFontPattern.exec(rawText);
  }

  const fontPattern = /\/Name\s*\/([A-Za-z0-9]+)[\s\S]{0,700}?\/ToUnicode\s+(\d+)\s+0\s+R/g;
  let match = fontPattern.exec(rawText);

  while (match) {
    const fontName = match[1];
    const objectNumber = match[2];
    const cmap = await readPdfObjectStream(buffer, rawText, objectNumber);
    const parsed = parseToUnicodeCMap(cmap);
    if (parsed.entries.size) {
      maps.set(fontName, parsed);
    }
    match = fontPattern.exec(rawText);
  }

  return maps;
}

function readPdfObject(rawText, objectNumber) {
  const marker = `${objectNumber} 0 obj`;
  const objectStart = rawText.indexOf(marker);
  if (objectStart === -1) return "";

  const objectEnd = rawText.indexOf("endobj", objectStart);
  if (objectEnd === -1) return "";

  return rawText.slice(objectStart, objectEnd);
}

async function readPdfObjectStream(buffer, rawText, objectNumber) {
  const marker = `${objectNumber} 0 obj`;
  const objectStart = rawText.indexOf(marker);
  if (objectStart === -1) return "";

  const streamStart = rawText.indexOf("stream", objectStart);
  const objectEnd = rawText.indexOf("endobj", objectStart);
  if (streamStart === -1 || streamStart > objectEnd) return "";

  let dataStart = streamStart + "stream".length;
  if (rawText[dataStart] === "\r" && rawText[dataStart + 1] === "\n") {
    dataStart += 2;
  } else if (rawText[dataStart] === "\n") {
    dataStart += 1;
  }

  const streamEnd = rawText.indexOf("endstream", dataStart);
  if (streamEnd === -1) return "";

  const dictionary = rawText.slice(objectStart, streamStart);
  let streamBytes = new Uint8Array(buffer.slice(dataStart, streamEnd));
  while (streamBytes.length && (streamBytes[streamBytes.length - 1] === 10 || streamBytes[streamBytes.length - 1] === 13)) {
    streamBytes = streamBytes.slice(0, -1);
  }

  if (/FlateDecode/.test(dictionary)) {
    streamBytes = await inflateDeflateStream(streamBytes);
  }

  return new TextDecoder("latin1").decode(streamBytes);
}

function parseToUnicodeCMap(cmap) {
  const entries = new Map();
  const pairPattern = /<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g;
  let match = pairPattern.exec(cmap);

  while (match) {
    entries.set(match[1].toUpperCase(), decodeUnicodeHex(match[2]));
    match = pairPattern.exec(cmap);
  }

  const lengths = Array.from(new Set(Array.from(entries.keys()).map((key) => key.length))).sort((a, b) => b - a);
  return { entries, lengths };
}

async function inflateDeflateStream(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractPdfTextFromContentStream(contentStream, fontMaps) {
  const strings = [];
  let activeFont = "";
  const tokenPattern = /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]+)>\s*Tj|(\((?:\\.|[^\\()])*\))\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
  let match = tokenPattern.exec(contentStream);

  while (match) {
    if (match[1]) {
      activeFont = match[1];
    } else if (match[2]) {
      strings.push(decodePdfHexString(match[2], fontMaps.get(activeFont)));
    } else if (match[3]) {
      strings.push(decodePdfLiteralString(match[3].slice(1, -1)));
    } else if (match[4]) {
      strings.push(decodePdfTextArray(match[4], fontMaps.get(activeFont)));
    }
    match = tokenPattern.exec(contentStream);
  }

  return strings.join("\n");
}

function decodePdfTextArray(value, fontMap) {
  const parts = [];
  const arrayPattern = /<([0-9A-Fa-f\s]+)>|\((?:\\.|[^\\()])*\)/g;
  let match = arrayPattern.exec(value);

  while (match) {
    if (match[1]) {
      parts.push(decodePdfHexString(match[1], fontMap));
    } else {
      parts.push(decodePdfLiteralString(match[0].slice(1, -1)));
    }
    match = arrayPattern.exec(value);
  }

  return parts.join("");
}

function decodePdfHexString(value, fontMap) {
  const hex = value.replace(/\s+/g, "").toUpperCase();
  if (!hex) return "";

  if (fontMap?.entries?.size) {
    let output = "";
    let index = 0;
    while (index < hex.length) {
      const length = fontMap.lengths.find((size) => fontMap.entries.has(hex.slice(index, index + size)));
      if (length) {
        output += fontMap.entries.get(hex.slice(index, index + length));
        index += length;
      } else {
        index += 2;
      }
    }
    return output;
  }

  if (/^(00[2-7][0-9A-F])/.test(hex) || hex.includes("00")) {
    return decodeUnicodeHex(hex);
  }

  let output = "";
  for (let index = 0; index < hex.length; index += 2) {
    output += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return output;
}

function decodePdfLiteralString(value) {
  const unescaped = unescapePdfString(value);
  if (!unescaped.includes("\u0000")) return unescaped;

  return unescaped
    .split("")
    .filter((char) => char !== "\u0000")
    .join("");
}

function decodeUnicodeHex(hex) {
  let output = "";
  const clean = hex.replace(/\s+/g, "");
  for (let index = 0; index < clean.length; index += 4) {
    const code = parseInt(clean.slice(index, index + 4), 16);
    if (Number.isFinite(code)) {
      output += String.fromCharCode(code);
    }
  }
  return output;
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
  state.currentPdfFile = null;
  els.form.reset();
  els.extractStatus.textContent = "Upload a PDF and I will look for amount, due date, biller, and reference details.";
  els.extractPreview.textContent = "";
  els.confidenceBadge.textContent = "Waiting";
  els.aiExtractButton.disabled = true;
}

function setupSettings() {
  els.reminderLeadSelect.value = String(state.settings.reminderLeadDays);
  els.emailReminderToggle.checked = Boolean(state.settings.emailReminders);
  updateEmailReminderHint();
  updateSyncStatus();
  updateAuthStatus();

  els.authScreenLoginButton.addEventListener("click", () => authenticate("login", "screen"));
  els.authScreenSignupButton.addEventListener("click", () => openSignupModal("screen"));
  els.authScreenForgotButton.addEventListener("click", () => recoverPassword("screen"));
  els.backToSigninButton.addEventListener("click", showSigninForm);
  els.authSignupCard.addEventListener("submit", (event) => {
    event.preventDefault();
    createAccount("screen");
  });
  els.logoutButton.addEventListener("click", logout);
  els.closeSignupModalButton.addEventListener("click", closeSignupModal);
  els.cancelSignupButton.addEventListener("click", closeSignupModal);
  els.signupModal.addEventListener("click", (event) => {
    if (event.target === els.signupModal) closeSignupModal();
  });
  els.signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createAccount("modal");
  });
  els.closeRescheduleButton.addEventListener("click", closeRescheduleModal);
  els.cancelRescheduleButton.addEventListener("click", closeRescheduleModal);
  els.rescheduleModal.addEventListener("click", (event) => {
    if (event.target === els.rescheduleModal) closeRescheduleModal();
  });
  els.rescheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRescheduledBill();
  });
  els.closeResetPasswordButton.addEventListener("click", closeResetPasswordModal);
  els.cancelResetPasswordButton.addEventListener("click", closeResetPasswordModal);
  els.resetPasswordModal.addEventListener("click", (event) => {
    if (event.target === els.resetPasswordModal) closeResetPasswordModal();
  });
  els.resetPasswordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updatePassword();
  });

  els.reminderLeadSelect.addEventListener("change", () => {
    state.settings.reminderLeadDays = Number(els.reminderLeadSelect.value);
    state.settings.timezone = getBrowserTimezone();
    saveSettings();
    syncReminderSettingsQuietly();
  });

  els.emailReminderToggle.addEventListener("change", () => {
    if (els.emailReminderToggle.checked && !state.auth?.email) {
      els.emailReminderToggle.checked = false;
      updateSyncStatus("Sign in before turning on email notifications.");
      return;
    }
    state.settings.emailReminders = els.emailReminderToggle.checked;
    state.settings.timezone = getBrowserTimezone();
    saveSettings();
    updateEmailReminderHint();
    syncReminderSettingsQuietly();
  });

  document.querySelector("#exportButton").addEventListener("click", exportBills);
  document.querySelector("#importButton").addEventListener("click", () => {
    els.importInput.click();
  });
  els.importInput.addEventListener("change", importBills);
  document.querySelector("#clearBillsButton").addEventListener("click", () => {
    if (confirm("Clear all saved bills from this browser?")) {
      state.bills = [];
      saveBills();
      render();
    }
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
    item.querySelector(".bill-date").textContent = formatDisplayDate(bill.dueDate);
    const referenceChip = item.querySelector(".reference-chip");
    referenceChip.textContent = bill.reference || "No ref";
    referenceChip.hidden = false;
    const notes = item.querySelector(".bill-notes");
    notes.textContent = buildBillDetails(bill);
    item.querySelector(".bill-amount").textContent = moneyFormat.format(Number(bill.amount || 0));

    const pill = item.querySelector(".status-pill");
    pill.textContent = status.label;
    pill.classList.add(status.kind);
    const markPaidButton = item.querySelector(".mark-paid");
    markPaidButton.textContent = bill.status === "paid" ? "Mark Unpaid" : "Mark Paid";
    markPaidButton.classList.toggle("secondary-button", bill.status === "paid");
    markPaidButton.classList.toggle("success-button", bill.status !== "paid");

    item.querySelector(".details-button").addEventListener("click", (event) => {
      notes.hidden = !notes.hidden;
      event.currentTarget.textContent = notes.hidden ? "Details +" : "Details -";
    });

    markPaidButton.addEventListener("click", () => {
      bill.status = bill.status === "paid" ? "unpaid" : "paid";
      bill.updatedAt = new Date().toISOString();
      saveBills();
      render();
    });

    item.querySelector(".reschedule-bill").addEventListener("click", () => {
      openRescheduleModal(bill);
    });

    item.querySelector(".delete-bill").addEventListener("click", () => {
      if (confirm(`Delete ${bill.biller}?`)) {
        state.bills = state.bills.filter((candidate) => candidate.id !== bill.id);
        saveBills();
        render();
      }
    });

    els.billList.append(item);
  });
}

function buildBillDetails(bill) {
  const details = [];
  details.push(`Due ${formatDisplayDate(bill.dueDate)}`);
  if (bill.reference) details.push(`Reference: ${bill.reference}`);
  if (bill.notes) details.push(`Notes: ${bill.notes}`);
  if (bill.fileName) details.push(`File: ${bill.fileName}`);
  return details.join("\n");
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

async function importBills() {
  const file = els.importInput.files[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const importedBills = Array.isArray(payload) ? payload : payload.bills;
    if (!Array.isArray(importedBills)) {
      throw new Error("No bills found in this JSON file.");
    }

    const validBills = importedBills.map(normalizeImportedBill).filter(Boolean);
    if (!validBills.length) {
      throw new Error("No valid bills found in this JSON file.");
    }

    state.bills = mergeBills(state.bills, validBills);
    saveBills();

    if (payload.settings?.reminderLeadDays !== undefined) {
      state.settings.reminderLeadDays = Number(payload.settings.reminderLeadDays) || state.settings.reminderLeadDays;
      els.reminderLeadSelect.value = String(state.settings.reminderLeadDays);
      saveSettings();
    }

    render();
    updateSyncStatus(`Imported ${validBills.length} bill${validBills.length === 1 ? "" : "s"}.`);
  } catch (error) {
    updateSyncStatus(error.message || "Import failed.");
  } finally {
    els.importInput.value = "";
  }
}

function normalizeImportedBill(bill) {
  if (!bill || !bill.biller || !bill.amount || !bill.dueDate) return null;

  return {
    id: bill.id || crypto.randomUUID(),
    biller: String(bill.biller).trim(),
    amount: Number(bill.amount),
    dueDate: String(bill.dueDate).slice(0, 10),
    reference: bill.reference ? String(bill.reference) : "",
    notes: bill.notes ? String(bill.notes) : "",
    fileName: bill.fileName ? String(bill.fileName) : "",
    status: bill.status === "paid" ? "paid" : "unpaid",
    createdAt: bill.createdAt || new Date().toISOString(),
    remoteId: bill.remoteId || "",
    clientBillId: bill.clientBillId || bill.id || "",
    remindedFor: Array.isArray(bill.remindedFor) ? bill.remindedFor : []
  };
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
    updateSyncStatus("Cloud sync is available after deploying to Cloudflare Pages.");
    return;
  }

  els.syncSupabaseButton.disabled = true;
  updateSyncStatus("Syncing...");

  try {
    await syncReminderSettings();
    await upsertRemoteBills(state.bills);
    const remoteBills = await fetchRemoteBills();
    const remoteSettings = await fetchRemoteSettings();
    if (remoteSettings) applyRemoteSettings(remoteSettings);
    const merged = mergeBills(state.bills, remoteBills);
    state.bills = merged;
    saveBills();
    saveSettings();
    render();
    updateSyncStatus(`Synced ${merged.length} bill${merged.length === 1 ? "" : "s"} and reminder settings.`);
  } catch (error) {
    updateSyncStatus(error.message || "Sync failed.");
  } finally {
    els.syncSupabaseButton.disabled = false;
  }
}

async function authenticate(mode, source) {
  if (!useCloudflareSync()) {
    updateAuthStatus("Login is available on the hosted Cloudflare app.");
    return;
  }

  const emailInput = els.authScreenEmailInput;
  const passwordInput = els.authScreenPasswordInput;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    updateAuthStatus("Enter email and password.");
    return;
  }

  const button = els.authScreenLoginButton;
  button.disabled = true;
  updateAuthStatus(mode === "signup" ? "Creating account..." : "Logging in...");

  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Authentication failed.");
    }

    if (!payload?.accessToken) {
      updateAuthStatus(payload?.message || payload?.error || "Check your email to confirm your account, then log in.");
      return;
    }

    state.auth = payload;
    saveAuth();
    els.authScreenEmailInput.value = payload.email || email;
    passwordInput.value = "";
    els.authScreenPasswordInput.value = "";
    updateAuthStatus();
    updateAuthGate();
    await restoreReminderSettings();
  } catch (error) {
    updateAuthStatus(error.message || "Authentication failed.");
  } finally {
    button.disabled = false;
  }
}

function openSignupModal(source) {
  const email = els.authScreenEmailInput.value.trim();
  if (source === "screen") {
    els.authSignupEmailInput.value = email;
    els.authSignupPasswordInput.value = "";
    els.authSignupConfirmPasswordInput.value = "";
    els.authSignupStatus.textContent = "Use this form only when making a new account.";
    els.authSigninCard.hidden = true;
    els.authSignupCard.hidden = false;
    els.authSignupEmailInput.focus();
    return;
  }

  els.signupEmailInput.value = email;
  els.signupPasswordInput.value = "";
  els.signupConfirmPasswordInput.value = "";
  els.signupStatus.textContent = "Create an account to sync bills across devices.";
  els.signupModal.hidden = false;
  els.signupEmailInput.focus();
}

function showSigninForm() {
  els.authSignupCard.hidden = true;
  els.authSigninCard.hidden = false;
  els.authScreenStatus.textContent = state.auth?.email && hasActiveSession()
    ? `Signed in as ${state.auth.email}.`
    : "Use your Bill Minder account to continue.";
  els.authScreenEmailInput.focus();
}

function closeSignupModal() {
  els.signupModal.hidden = true;
}

async function createAccount(source = "modal") {
  if (!useCloudflareSync()) {
    getSignupStatus(source).textContent = "Sign up is available on the hosted Cloudflare app.";
    return;
  }

  const fields = getSignupFields(source);
  const email = fields.email.value.trim();
  const password = fields.password.value;
  const confirmPassword = fields.confirm.value;
  const status = getSignupStatus(source);
  const button = source === "screen" ? els.authCreateAccountButton : els.createAccountButton;
  if (!email || password.length < 6) {
    status.textContent = "Enter an email and a password with at least 6 characters.";
    return;
  }
  if (password !== confirmPassword) {
    status.textContent = "Passwords do not match.";
    return;
  }

  button.disabled = true;
  status.textContent = "Creating account...";

  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Signup failed.");
    }

    if (!payload?.accessToken) {
      status.textContent = payload?.message || "Check your email to confirm your account, then log in.";
      els.authScreenEmailInput.value = email;
      return;
    }

    state.auth = payload;
    saveAuth();
    els.authScreenEmailInput.value = payload.email || email;
    await syncReminderSettings();
    if (source === "screen") {
      showSigninForm();
    } else {
      closeSignupModal();
    }
    updateAuthStatus();
    updateAuthGate();
  } catch (error) {
    status.textContent = error.message || "Signup failed.";
  } finally {
    button.disabled = false;
  }
}

function getSignupFields(source) {
  if (source === "screen") {
    return {
      email: els.authSignupEmailInput,
      password: els.authSignupPasswordInput,
      confirm: els.authSignupConfirmPasswordInput
    };
  }

  return {
    email: els.signupEmailInput,
    password: els.signupPasswordInput,
    confirm: els.signupConfirmPasswordInput
  };
}

function getSignupStatus(source) {
  return source === "screen" ? els.authSignupStatus : els.signupStatus;
}

async function recoverPassword(source) {
  if (!useCloudflareSync()) {
    updateAuthStatus("Password reset is available on the hosted Cloudflare app.");
    return;
  }

  const emailInput = els.authScreenEmailInput;
  const email = emailInput.value.trim();
  if (!email) {
    updateAuthStatus("Enter your email, then tap Forgot password.");
    emailInput.focus();
    return;
  }

  const button = els.authScreenForgotButton;
  button.disabled = true;
  updateAuthStatus("Sending password reset email...");

  try {
    const response = await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Password reset failed.");
    }

    updateAuthStatus(payload?.message || "Password reset email sent.");
  } catch (error) {
    updateAuthStatus(error.message || "Password reset failed.");
  } finally {
    button.disabled = false;
  }
}

function handleRecoveryRedirect() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(location.search);
  const token = hash.get("access_token") || query.get("access_token") || "";
  const type = hash.get("type") || query.get("type") || "";

  if (token && type === "recovery") {
    state.recoveryToken = token;
    els.resetPasswordModal.hidden = false;
    els.newPasswordInput.focus();
    history.replaceState({}, document.title, location.pathname);
  }
}

function closeResetPasswordModal() {
  state.recoveryToken = "";
  els.resetPasswordModal.hidden = true;
  els.newPasswordInput.value = "";
  els.confirmNewPasswordInput.value = "";
}

async function updatePassword() {
  if (!state.recoveryToken) {
    els.resetPasswordStatus.textContent = "Use the password reset link from your email first.";
    return;
  }

  const password = els.newPasswordInput.value;
  const confirmPassword = els.confirmNewPasswordInput.value;
  if (password.length < 6) {
    els.resetPasswordStatus.textContent = "Enter a password with at least 6 characters.";
    return;
  }
  if (password !== confirmPassword) {
    els.resetPasswordStatus.textContent = "Passwords do not match.";
    return;
  }

  els.saveNewPasswordButton.disabled = true;
  els.resetPasswordStatus.textContent = "Saving password...";

  try {
    const response = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: state.recoveryToken, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Password update failed.");
    }

    closeResetPasswordModal();
    updateAuthStatus("Password updated. Please log in.");
  } catch (error) {
    els.resetPasswordStatus.textContent = error.message || "Password update failed.";
  } finally {
    els.saveNewPasswordButton.disabled = false;
  }
}

function logout() {
  state.auth = null;
  localStorage.removeItem(AUTH_KEY);
  updateAuthStatus();
  updateAuthGate();
}

function saveAuth() {
  localStorage.setItem(AUTH_KEY, JSON.stringify(state.auth));
}

function updateAuthStatus(message) {
  if (message) {
    els.authStatus.textContent = message;
    els.authScreenStatus.textContent = message;
    return;
  }

  const messageText = state.auth?.email && hasActiveSession()
    ? `Signed in as ${state.auth.email}.`
    : state.auth?.email
      ? "Your session expired. Please log in again."
    : "Not signed in.";
  els.authStatus.textContent = messageText;
  els.authScreenStatus.textContent = useCloudflareSync()
    ? messageText
    : "Sign in is available on the hosted Cloudflare app.";
  updateEmailReminderHint();
}

function updateEmailReminderHint() {
  if (!els.emailReminderHint) return;
  els.emailReminderHint.textContent = state.auth?.email
    ? `Sent to ${state.auth.email}.`
    : "Sign in to use email notifications.";
}

function updateAuthGate() {
  const requiresLogin = useCloudflareSync();
  const signedIn = hasActiveSession();
  els.authScreen.hidden = !requiresLogin || signedIn;
  els.appShell.hidden = requiresLogin && !signedIn;
  if (requiresLogin && !signedIn) {
    els.authSignupCard.hidden = true;
    els.authSigninCard.hidden = false;
    if (state.auth?.email) {
      els.authScreenEmailInput.value = state.auth.email;
    }
    updateAuthStatus();
  }
}

function openRescheduleModal(bill) {
  state.reschedulingBillId = bill.id;
  els.rescheduleDateInput.value = bill.dueDate;
  els.rescheduleStatus.textContent = `Choose a new due date for ${bill.biller}.`;
  els.rescheduleModal.hidden = false;
  els.rescheduleDateInput.focus();
}

function closeRescheduleModal() {
  state.reschedulingBillId = null;
  els.rescheduleModal.hidden = true;
}

function saveRescheduledBill() {
  const bill = state.bills.find((candidate) => candidate.id === state.reschedulingBillId);
  if (!bill) {
    closeRescheduleModal();
    return;
  }

  if (!els.rescheduleDateInput.value) {
    els.rescheduleStatus.textContent = "Choose a due date.";
    return;
  }

  bill.dueDate = els.rescheduleDateInput.value;
  bill.updatedAt = new Date().toISOString();
  bill.remindedFor = [];
  saveBills();
  closeRescheduleModal();
  render();
}

async function restoreSupabase() {
  if (!hasSyncConnection()) {
    updateSyncStatus("Cloud sync is available after deploying to Cloudflare Pages.");
    return;
  }

  els.restoreSupabaseButton.disabled = true;
  updateSyncStatus("Restoring from cloud...");

  try {
    const remoteBills = await fetchRemoteBills();
    const remoteSettings = await fetchRemoteSettings();
    if (remoteSettings) applyRemoteSettings(remoteSettings);
    state.bills = mergeBills(state.bills, remoteBills);
    saveBills();
    saveSettings();
    render();
    updateSyncStatus(`Restored ${remoteBills.length} cloud bill${remoteBills.length === 1 ? "" : "s"} and reminder settings.`);
  } catch (error) {
    updateSyncStatus(error.message || "Restore failed.");
  } finally {
    els.restoreSupabaseButton.disabled = false;
  }
}

async function upsertRemoteBills(bills) {
  if (!bills.length) return;

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
}

async function fetchRemoteBills() {
  const appId = encodeURIComponent(state.settings.appInstanceId);
  const response = await cloudflareSyncRequest(`/api/bills?appInstanceId=${appId}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  return payload.bills || [];
}

async function syncReminderSettings() {
  if (!hasSyncConnection()) return;

  state.settings.timezone = getBrowserTimezone();
  const response = await cloudflareSyncRequest("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      email: state.auth?.email || "",
      reminderLeadDays: state.settings.reminderLeadDays,
      emailReminders: state.settings.emailReminders,
      timezone: state.settings.timezone
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function syncReminderSettingsQuietly() {
  try {
    await syncReminderSettings();
    updateSyncStatus("Reminder settings saved.");
  } catch (error) {
    updateSyncStatus(error.message || "Reminder settings will sync later.");
  }
}

async function fetchRemoteSettings() {
  if (!hasSyncConnection()) return null;

  const response = await cloudflareSyncRequest("/api/settings");
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  return payload.settings || null;
}

async function restoreReminderSettings() {
  try {
    const remoteSettings = await fetchRemoteSettings();
    if (remoteSettings) {
      applyRemoteSettings(remoteSettings);
      saveSettings();
      updateEmailReminderHint();
      updateSyncStatus("Reminder settings restored.");
      return;
    }
    await syncReminderSettings();
  } catch (error) {
    updateSyncStatus(error.message || "Reminder settings will sync later.");
  }
}

function applyRemoteSettings(settings) {
  if (!settings) return;
  state.settings.reminderLeadDays = Number(settings.reminderLeadDays ?? state.settings.reminderLeadDays);
  state.settings.emailReminders = Boolean(settings.emailReminders);
  state.settings.timezone = settings.timezone || state.settings.timezone || getBrowserTimezone();
  els.reminderLeadSelect.value = String(state.settings.reminderLeadDays);
  els.emailReminderToggle.checked = state.settings.emailReminders;
  updateEmailReminderHint();
}

function hasSyncConnection() {
  return useCloudflareSync() && hasActiveSession();
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
      ...(state.auth?.accessToken ? { Authorization: `Bearer ${state.auth.accessToken}` } : {}),
      ...(options.headers || {})
    }
  });
}

function hasActiveSession() {
  if (!state.auth?.accessToken) return false;
  if (!state.auth.expiresAt) return true;
  return Number(state.auth.expiresAt) > Date.now() + 30000;
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
    els.syncStatus.textContent = hasActiveSession()
      ? `Cloud sync ready. Device ID: ${state.settings.appInstanceId}`
      : "Sign in to use cloud sync.";
    return;
  }

  els.syncStatus.textContent = "Cloud sync activates on the hosted Cloudflare app.";
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

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Melbourne";
}

function formatDisplayDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(dateFromInput(value));
}
