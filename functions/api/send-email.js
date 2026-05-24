const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};
const DEFAULT_FROM = "Bill Minder <onboarding@resend.dev>";

export async function onRequestPost({ request, env }) {
  if (!env.RESEND_API_KEY) {
    return jsonResponse({ error: "Email is not configured. Add RESEND_API_KEY as a Cloudflare Pages secret." }, 500);
  }

  const payload = await request.json().catch(() => null);
  const to = String(payload?.to || "").trim();
  const subject = String(payload?.subject || "").trim();
  const html = String(payload?.html || "").trim();
  const text = String(payload?.text || "").trim();

  if (!isEmail(to)) {
    return jsonResponse({ error: "Enter a valid email address." }, 400);
  }

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

  return jsonResponse({ ok: true, id: result?.id || "" });
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
