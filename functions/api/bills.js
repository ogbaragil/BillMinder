const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export async function onRequestGet({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const syncSecret = request.headers.get("x-sync-secret");
  const appInstanceId = new URL(request.url).searchParams.get("appInstanceId");
  const identityError = validateIdentity(appInstanceId, syncSecret);
  if (identityError) return identityError;

  const response = await supabaseFetch(env, `/rest/v1/bills?app_instance_id=eq.${encodeURIComponent(appInstanceId)}&select=*`, {
    headers: {
      "x-sync-secret": syncSecret
    }
  });

  if (!response.ok) {
    return errorResponse(await response.text(), response.status);
  }

  const rows = await response.json();
  return jsonResponse({
    bills: rows.map(fromSupabaseRow)
  });
}

export async function onRequestPost({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const syncSecret = request.headers.get("x-sync-secret");
  const payload = await request.json().catch(() => null);
  const appInstanceId = payload?.appInstanceId;
  const identityError = validateIdentity(appInstanceId, syncSecret);
  if (identityError) return identityError;

  const bills = Array.isArray(payload?.bills) ? payload.bills : [];
  const rows = bills.map((bill) => toSupabaseRow(bill, appInstanceId, syncSecret));

  if (rows.length) {
    const response = await supabaseFetch(env, "/rest/v1/bills", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates",
        "x-sync-secret": syncSecret
      },
      body: JSON.stringify(rows)
    });

    if (!response.ok) {
      return errorResponse(await response.text(), response.status);
    }
  }

  return jsonResponse({ ok: true, synced: rows.length });
}

function validateConfig(env) {
  if (!getSupabaseUrl(env) || !getSupabaseAnonKey(env)) {
    return errorResponse("Cloud sync is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Cloudflare Pages.", 500);
  }
  return null;
}

function validateIdentity(appInstanceId, syncSecret) {
  if (!isUuid(appInstanceId) || !isUuid(syncSecret)) {
    return errorResponse("Missing or invalid sync identity.", 400);
  }
  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
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
  return env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
}

function getSupabaseAnonKey(env) {
  return env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
}

function toSupabaseRow(bill, appInstanceId, syncSecret) {
  return {
    id: bill.id,
    app_instance_id: appInstanceId,
    sync_secret: syncSecret,
    biller: bill.biller,
    amount: bill.amount,
    due_date: bill.dueDate,
    reference: bill.reference || null,
    notes: bill.notes || null,
    file_name: bill.fileName || null,
    status: bill.status || "unpaid",
    reminded_for: bill.remindedFor || [],
    created_at: bill.createdAt,
    updated_at: new Date().toISOString()
  };
}

function fromSupabaseRow(row) {
  return {
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
  };
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
