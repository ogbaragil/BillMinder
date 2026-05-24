export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  const accessToken = String(payload?.accessToken || "").trim();
  const password = String(payload?.password || "");

  if (!accessToken) {
    return jsonResponse({ error: "Password reset link is missing or expired." }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ error: "Enter a password with at least 6 characters." }, 400);
  }

  const response = await supabaseAuthFetch(env, "/auth/v1/user", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ password })
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    return jsonResponse({ error: result?.error_description || result?.msg || result?.message || "Password update failed." }, response.status);
  }

  return jsonResponse({ message: "Password updated. Please log in." });
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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
