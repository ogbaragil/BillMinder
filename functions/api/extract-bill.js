const DEFAULT_MODEL = "gpt-4.1-mini";
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "AI extraction is not configured. Add OPENAI_API_KEY as a Cloudflare Pages secret." }, 500);
  }

  const formData = await request.formData();
  const file = formData.get("pdf");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Upload a PDF file." }, 400);
  }

  if (file.size > 50 * 1024 * 1024) {
    return jsonResponse({ error: "PDF is larger than the 50 MB OpenAI file input limit." }, 400);
  }

  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: file.name || "bill.pdf",
              file_data: `data:application/pdf;base64,${base64}`
            },
            {
              type: "input_text",
              text: "Extract bill payment details from this PDF. Return JSON only. Use an empty string for missing text fields, amount_due 0 if missing, due_date as YYYY-MM-DD if present, and confidence from 0 to 1."
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bill_details",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "biller",
              "amount_due",
              "due_date",
              "invoice_number",
              "reference",
              "notes",
              "confidence"
            ],
            properties: {
              biller: { type: "string" },
              amount_due: { type: "number" },
              due_date: { type: "string" },
              invoice_number: { type: "string" },
              reference: { type: "string" },
              notes: { type: "string" },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            }
          }
        }
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return jsonResponse({ error: payload?.error?.message || "OpenAI extraction failed." }, response.status);
  }

  const parsed = parseOutputJson(payload);
  if (!parsed) {
    return jsonResponse({ error: "OpenAI did not return valid bill JSON." }, 502);
  }

  return jsonResponse({
    biller: parsed.biller || "",
    amountDue: Number(parsed.amount_due || 0),
    dueDate: parsed.due_date || "",
    invoiceNumber: parsed.invoice_number || "",
    reference: parsed.reference || "",
    notes: parsed.notes || "",
    confidence: Number(parsed.confidence || 0)
  });
}

function parseOutputJson(payload) {
  if (payload?.output_text) {
    return safeJson(payload.output_text);
  }

  const text = payload?.output
    ?.flatMap((item) => item.content || [])
    ?.find((content) => content.type === "output_text")?.text;

  return text ? safeJson(text) : null;
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  });
}
