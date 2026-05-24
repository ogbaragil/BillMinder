const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const DEFAULT_SUPABASE_URL = "https://yhjffaxtjrmiwdxramxz.supabase.co";

export async function onRequestGet({ request, env }) {
  const configError = validateConfig(env);
  if (configError) return configError;

  const syncSecret = request.headers.get("x-sync-secret");
  const appInstanceId = new URL(request.url).searchParams.get("appInstanceId");
  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;

  if (!user) {
    const identityError = validateIdentity(appInstanceId, syncSecret);
    if (identityError) return identityError;
  }

  const query = user
    ? `/rest/v1/bills?user_id=eq.${encodeURIComponent(user.id)}&select=*`
    : `/rest/v1/bills?app_instance_id=eq.${encodeURIComponent(appInstanceId)}&select=*`;
  const response = await supabaseFetch(env, query, {
    headers: {
      "x-sync-secret": syncSecret || "",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
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
  const authToken = getBearerToken(request);
  const user = authToken ? await getSupabaseUser(env, authToken) : null;

  if (!user) {
    const identityError = validateIdentity(appInstanceId, syncSecret);
    if (identityError) return identityError;
  }

  const bills = Array.isArray(payload?.bills) ? payload.bills : [];
  const rows = bills.map((bill) => toSupabaseRow(bill, appInstanceId, syncSecret, user?.id || null));

  if (user) {
    const result = await syncUserBills(env, rows, user.id, authToken, syncSecret || "");
    if (result.error) return result.error;
    return jsonResponse({ ok: true, synced: result.synced });
  }

  if (rows.length) {
    const response = await supabaseFetch(env, "/rest/v1/bills", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates",
        "x-sync-secret": syncSecret || "",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
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
  if (!getSupabaseAnonKey(env)) {
    return errorResponse("Cloud sync is not configured. Add VITE_SUPABASE_ANON_KEY as a Cloudflare Pages secret.", 500);
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

async function syncUserBills(env, rows, userId, authToken, syncSecret) {
  let synced = 0;

  for (const row of rows) {
    const existing = await findUserBill(env, userId, row.client_bill_id, authToken, syncSecret);
    if (existing.error) return existing;

    const remoteId = existing.id || crypto.randomUUID();
    const response = await supabaseFetch(env, existing.id ? `/rest/v1/bills?id=eq.${encodeURIComponent(remoteId)}` : "/rest/v1/bills", {
      method: existing.id ? "PATCH" : "POST",
      headers: {
        "x-sync-secret": syncSecret,
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ ...row, id: remoteId })
    });

    if (!response.ok) {
      return { error: errorResponse(await response.text(), response.status) };
    }

    synced += 1;
  }

  return { synced };
}

async function findUserBill(env, userId, clientBillId, authToken, syncSecret) {
  const query = `/rest/v1/bills?user_id=eq.${encodeURIComponent(userId)}&client_bill_id=eq.${encodeURIComponent(clientBillId)}&select=id&limit=1`;
  const response = await supabaseFetch(env, query, {
    headers: {
      "x-sync-secret": syncSecret,
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    return { error: errorResponse(await response.text(), response.status) };
  }

  const rows = await response.json();
  return { id: rows[0]?.id || null };
}

function toSupabaseRow(bill, appInstanceId, syncSecret, userId) {
  const clientBillId = String(bill.clientBillId || bill.id || crypto.randomUUID());
  return {
    id: userId ? (isUuid(bill.remoteId) ? bill.remoteId : crypto.randomUUID()) : bill.id,
    client_bill_id: clientBillId,
    app_instance_id: appInstanceId,
    sync_secret: syncSecret || crypto.randomUUID(),
    user_id: userId,
    biller: bill.biller,
    amount: bill.amount,
    due_date: bill.dueDate,
    reference: bill.reference || null,
    notes: bill.notes || null,
    file_name: bill.fileName || null,
    status: bill.status || "unpaid",
    paid_at: bill.paidAt || null,
    payment_notes: bill.paymentNotes || null,
    reschedule_notes: bill.rescheduleNotes || null,
    reminded_for: bill.remindedFor || [],
    created_at: bill.createdAt,
    updated_at: new Date().toISOString()
  };
}

function fromSupabaseRow(row) {
  return {
    id: row.client_bill_id || row.id,
    remoteId: row.id,
    clientBillId: row.client_bill_id || row.id,
    biller: row.biller,
    amount: Number(row.amount),
    dueDate: row.due_date,
    reference: row.reference || "",
    notes: row.notes || "",
    fileName: row.file_name || "",
    status: row.status || "unpaid",
    paidAt: row.paid_at || "",
    paymentNotes: row.payment_notes || "",
    rescheduleNotes: row.reschedule_notes || "",
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
