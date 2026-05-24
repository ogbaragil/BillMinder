const DEFAULT_SUPABASE_URL = "https://yhjffaxtjrmiwdxramxz.supabase.co";
const DEFAULT_FROM = "Bill Minder <onboarding@resend.dev>";

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminders(env, new Date(controller.scheduledTime || Date.now())));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/run-reminders") {
      return jsonResponse({ ok: true, service: "Bill Minder reminder worker" });
    }

    if (env.REMINDER_CRON_SECRET) {
      const expected = `Bearer ${env.REMINDER_CRON_SECRET}`;
      if (request.headers.get("Authorization") !== expected) {
        return jsonResponse({ error: "Unauthorized." }, 401);
      }
    }

    const result = await runReminders(env, new Date());
    return jsonResponse(result);
  }
};

async function runReminders(env, runDate) {
  validateConfig(env);

  const settings = await supabaseFetch(env, "/rest/v1/user_settings?email_reminders=eq.true&select=*", {
    headers: { Authorization: `Bearer ${getServiceRoleKey(env)}` }
  }).then(readJsonResponse);

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const setting of settings) {
    try {
      const leadDays = Number(setting.reminder_lead_days || 0);
      const targetDate = addDaysToDateString(localDateString(runDate, setting.timezone), leadDays);
      const bills = await fetchDueBills(env, setting.user_id, targetDate);

      for (const bill of bills) {
        const reminderKey = `email:${bill.due_date}:${leadDays}`;
        if ((bill.reminded_for || []).includes(reminderKey)) {
          skipped += 1;
          continue;
        }

        await sendReminderEmail(env, setting.email, bill, leadDays);
        await markBillReminded(env, bill, reminderKey);
        sent += 1;
      }
    } catch (error) {
      errors.push({
        userId: setting.user_id,
        message: error.message || "Reminder failed."
      });
    }
  }

  return {
    ok: errors.length === 0,
    usersChecked: settings.length,
    sent,
    skipped,
    errors
  };
}

async function fetchDueBills(env, userId, dueDate) {
  const query = `/rest/v1/bills?user_id=eq.${encodeURIComponent(userId)}&status=eq.unpaid&due_date=eq.${encodeURIComponent(dueDate)}&select=*`;
  return supabaseFetch(env, query, {
    headers: { Authorization: `Bearer ${getServiceRoleKey(env)}` }
  }).then(readJsonResponse);
}

async function sendReminderEmail(env, to, bill, leadDays) {
  if (!isEmail(to)) {
    throw new Error("User settings email is invalid.");
  }

  if (env.RESEND_ALLOWED_TO && to.toLowerCase() !== env.RESEND_ALLOWED_TO.toLowerCase()) {
    throw new Error("Recipient is not allowed for this deployment.");
  }

  const dueText = leadDays ? `due in ${leadDays} day${leadDays === 1 ? "" : "s"}` : "due today";
  const amount = formatMoney(Number(bill.amount || 0));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to,
      subject: `${bill.biller} bill ${dueText}`,
      text: `${bill.biller} has ${amount} due on ${bill.due_date}.${bill.reference ? ` Reference: ${bill.reference}.` : ""}`,
      html: `
        <h2>${escapeHtml(bill.biller)} bill ${escapeHtml(dueText)}</h2>
        <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
        <p><strong>Due date:</strong> ${escapeHtml(bill.due_date)}</p>
        ${bill.reference ? `<p><strong>Reference:</strong> ${escapeHtml(bill.reference)}</p>` : ""}
      `
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.message || result?.error || "Resend email failed.");
  }
}

async function markBillReminded(env, bill, reminderKey) {
  const remindedFor = Array.from(new Set([...(bill.reminded_for || []), reminderKey]));
  const response = await supabaseFetch(env, `/rest/v1/bills?id=eq.${encodeURIComponent(bill.id)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${getServiceRoleKey(env)}`,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      reminded_for: remindedFor,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function validateConfig(env) {
  if (!getServiceRoleKey(env)) {
    throw new Error("Add SUPABASE_SERVICE_ROLE_KEY as a Worker secret.");
  }
  if (!env.RESEND_API_KEY) {
    throw new Error("Add RESEND_API_KEY as a Worker secret.");
  }
}

function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = getServiceRoleKey(env);

  return fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function readJsonResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || JSON.stringify(payload) || "Supabase request failed.");
  }
  return payload || [];
}

function getServiceRoleKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function localDateString(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateString(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD"
  }).format(value);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
