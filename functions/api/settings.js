const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const DEFAULT_SUPABASE_URL = "https://yhjffaxtjrmiwdxramxz.supabase.co";

export async function onRequestGet({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;
  if (!user) return errorResponse("Sign in to sync reminder settings.", 401);

  const response = await supabaseFetch(env, `/rest/v1/user_settings?user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`, {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    return errorResponse(await response.text(), response.status);
  }

  const rows = await response.json();
  return jsonResponse({ settings: rows[0] ? fromSupabaseRow(rows[0]) : null });
}

export async function onRequestPost({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;
  if (!user) return errorResponse("Sign in to sync reminder settings.", 401);

  const payload = await request.json().catch(() => null);
  const row = {
    user_id: user.id,
    email: user.email || String(payload?.email || "").trim(),
    reminder_lead_days: normalizeLeadDays(payload?.reminderLeadDays),
    email_reminders: Boolean(payload?.emailReminders),
    timezone: normalizeTimezone(payload?.timezone),
    updated_at: new Date().toISOString()
  };

  const response = await supabaseFetch(env, "/rest/v1/user_settings?on_conflict=user_id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(row)
  });

  if (!response.ok) {
    return errorResponse(await response.text(), response.status);
  }

  return jsonResponse({ ok: true, settings: fromSupabaseRow(row) });
}

function validateConfig(env) {
  if (!getSupabaseAnonKey(env)) {
    return errorResponse("Cloud sync is not configured. Add VITE_SUPABASE_ANON_KEY as a Cloudflare Pages secret.", 500);
  }
  return null;
}

function normalizeLeadDays(value) {
  const number = Number(value);
  return [0, 1, 3, 7].includes(number) ? number : 3;
}

function normalizeTimezone(value) {
  const timezone = String(value || "").trim();
  return timezone || "Australia/Melbourne";
}

function fromSupabaseRow(row) {
  return {
    reminderLeadDays: Number(row.reminder_lead_days ?? 3),
    emailReminders: Boolean(row.email_reminders),
    timezone: row.timezone || "Australia/Melbourne",
    email: row.email || ""
  };
}

function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = getSupabaseUrl(env).replace(/\/+$/, "");
  const supabaseAnonKey = getSupabaseAnonKey(env);

  return fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function getSupabaseUrl(env) {
  return env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

function getSupabaseAnonKey(env) {
  return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
}

async function getSupabaseUser(env, authToken) {
  const response = await supabaseFetch(env, "/auth/v1/user", {
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) return null;
  return response.json();
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  });
}

function errorResponse(message, status) {
  return jsonResponse({ error: message }, status);
}
