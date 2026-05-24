const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const DEFAULT_FROM = "Bill Minder <onboarding@resend.dev>";
const DEFAULT_SUPABASE_URL = "https://yhjffaxtjrmiwdxramxz.supabase.co";

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) {
    return jsonResponse({ error: "Email is not configured. Add RESEND_API_KEY as a Cloudflare Pages secret." }, 500);
  }

  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;
  const to = String(user?.email || "").trim();

  if (!user || !isEmail(to)) {
    return jsonResponse({ error: "Please sign in again before sending reminder emails." }, 401);
  }

  const payload = await request.json().catch(() => null);
  const subject = String(payload?.subject || "").trim();
  const html = String(payload?.html || "").trim();
  const text = String(payload?.text || "").trim();

  if (env.RESEND_ALLOWED_TO && to.toLowerCase() !== env.RESEND_ALLOWED_TO.toLowerCase()) {
    return jsonResponse({ error: "This recipient is not allowed for this Bill Minder deployment." }, 403);
  }

  if (!subject || (!html && !text)) {
    return jsonResponse({ error: "Email subject and content are required." }, 400);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to,
      subject,
      html: html || `<p>${escapeHtml(text)}</p>`,
      text: text || stripHtml(html)
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    return jsonResponse({ error: result?.message || result?.error || "Resend email failed." }, response.status);
  }

  return jsonResponse({ ok: true, id: result?.id || "", to });
}

function supabaseFetch(env, path, options = {}) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
    headers: jsonHeaders
  });
}
