export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  const email = String(payload?.email || "").trim();

  if (!isEmail(email)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }

  const redirectTo = new URL("/", request.url).toString();
  const response = await supabaseAuthFetch(env, `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: JSON.stringify({ email })
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return jsonResponse({ error: result?.error_description || result?.msg || result?.message || "Password reset failed." }, response.status);
  }

  return jsonResponse({ message: "Password reset email sent. Check your inbox." });
}

function supabaseAuthFetch(env, path, options = {}) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "https://yhjffaxtjrmiwdxramxz.supabase.co").replace(/\/+$/, "");
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  return fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
