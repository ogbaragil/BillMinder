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
  if (!user) {
    return errorResponse("Please sign in again before restoring preferences.", 401);
  }

  const query = `/rest/v1/user_preferences?user_id=eq.${encodeURIComponent(user.id)}&select=email_reminders_enabled,reminder_lead_days&limit=1`;
  const response = await supabaseFetch(env, query, {
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!response.ok) {
    return errorResponse(await response.text(), response.status);
  }

  const rows = await response.json();
  const row = rows[0] || null;
  return jsonResponse({
    preferences: row
      ? {
          emailReminders: Boolean(row.email_reminders_enabled),
          reminderLeadDays: Number(row.reminder_lead_days ?? 3)
        }
      : {
          emailReminders: false,
          reminderLeadDays: 3
        }
  });
}

export async function onRequestPost({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;
  if (!user) {
    return errorResponse("Please sign in again before syncing preferences.", 401);
  }

  const payload = await request.json().catch(() => null);
  const preferences = payload?.preferences || {};
  const row = {
    user_id: user.id,
    email_reminders_enabled: Boolean(preferences.emailReminders),
    reminder_lead_days: normalizeLeadDays(preferences.reminderLeadDays),
    updated_at: new Date().toISOString()
  };

  const response = await supabaseFetch(env, "/rest/v1/user_preferences?on_conflict=user_id", {
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

  return jsonResponse({ ok: true });
}

function normalizeLeadDays(value) {
  const number = Number(value);
  return [0, 1, 3, 7].includes(number) ? number : 3;
}

function validateConfig(env) {
  if (!getSupabaseAnonKey(env)) {
    return errorResponse("Cloud sync is not configured. Add VITE_SUPABASE_ANON_KEY as a Cloudflare Pages secret.", 500);
  }
  return null;
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
    headers: { Authorization: `Bearer ${authToken}` }
  });

  if (!response.ok) return null;
  return response.json();
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

function errorResponse(message, status) {
  return jsonResponse({ error: message }, status);
}
