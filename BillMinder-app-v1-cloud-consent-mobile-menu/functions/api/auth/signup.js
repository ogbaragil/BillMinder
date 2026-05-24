export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  const email = String(payload?.email || "").trim();
  const password = String(payload?.password || "");

  if (!email || password.length < 6) {
    return jsonResponse({ error: "Enter an email and a password with at least 6 characters." }, 400);
  }

  const response = await supabaseAuthFetch(env, "/auth/v1/signup", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return jsonResponse({ error: result?.error_description || result?.msg || result?.message || "Signup failed." }, response.status);
  }

  if (!result.access_token) {
    return jsonResponse({ message: "Account created. Check your email to confirm it, then log in." });
  }

  return jsonResponse(toSession(result));
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

function toSession(result) {
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || "",
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
    email: result.user?.email || "",
    userId: result.user?.id || ""
  };
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
