import { isAdminPassword } from "../lib/admin-auth.mjs";
import { getStore } from "@netlify/blobs";

const store = getStore("newlifejems-prayer-inbox");
const COUNTER_KEY = "metadata/request-counter.json";
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store" },
});

async function nextRequestReference() {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = await store.getWithMetadata(COUNTER_KEY, { type: "json" });
    const nextNumber = Math.max(0, Number(current?.data?.lastNumber) || 0) + 1;
    const result = await store.setJSON(COUNTER_KEY, { lastNumber: nextNumber }, current?.etag
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true });
    if (result.modified) return `NLJ${String(nextNumber).padStart(3, "0")}`;
  }
  throw new Error("Could not allocate a prayer request reference.");
}

export default async (request) => {
  if (request.method === "GET") {
    if (!isAdminPassword(request.headers.get("x-admin-password") || "")) return json({ error: "Admin password is incorrect." }, 401);
    try {
      const { blobs } = await store.list({ prefix: "requests/" });
      const prayerRequests = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })));
      prayerRequests.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      return json({ prayerRequests: prayerRequests.filter(Boolean) });
    } catch (error) {
      console.error("[prayer-inbox] admin list failed", {
        requestId: request.headers.get("x-nf-request-id") || "unknown",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return json({ error: "The prayer inbox is temporarily unavailable." }, 503);
    }
  }

  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let stage = "parse-form";
  try {
    const form = await request.formData();
    if (String(form.get("bot-field") || "").trim()) return json({ ok: true }, 202);
    stage = "validate-request";
    const requestText = String(form.get("request") || "").trim().slice(0, 1200);
    if (requestText.length < 2) return json({ error: "Prayer request is required." }, 400);

    const submissionToken = String(form.get("submissionToken") || "");
    if (!/^[0-9a-f-]{36}$/i.test(submissionToken)) return json({ error: "Please refresh the page and try again." }, 400);

    stage = "load-submission";
    const submissionKey = `submissions/${submissionToken}.json`;
    let submission = await store.get(submissionKey, { type: "json" });
    if (!submission?.requestId) {
      stage = "allocate-reference";
      const candidateReference = await nextRequestReference();
      stage = "save-submission-token";
      const created = await store.setJSON(submissionKey, { requestId: candidateReference }, { onlyIfNew: true });
      submission = created.modified
        ? { requestId: candidateReference }
        : await store.get(submissionKey, { type: "json" });
    }

    const requestId = submission?.requestId;
    if (!/^NLJ\d{3,}$/.test(requestId || "")) throw new Error("Could not confirm the prayer request reference.");
    const record = {
      id: requestId,
      requestId,
      name: String(form.get("name") || "").trim().slice(0, 120),
      email: String(form.get("email") || "").trim().slice(0, 254),
      phone: String(form.get("phone") || "").trim().slice(0, 30),
      topic: String(form.get("topic") || "").trim().slice(0, 80),
      request: requestText,
      visibility: String(form.get("visibility") || "prayer-team").slice(0, 40),
      anonymous: form.get("anonymous") === "on",
      submittedAt: new Date().toISOString(),
    };
    stage = "save-prayer-request";
    const requestKey = `requests/${requestId}.json`;
    const created = await store.setJSON(requestKey, record, { onlyIfNew: true });
    if (!created.modified) {
      const existing = await store.get(requestKey, { type: "json" });
      if (!existing) throw new Error("Could not save the prayer request.");
    }
    return json({ ok: true, requestId }, 201);
  } catch (error) {
    console.error("[prayer-inbox] submission failed", {
      requestId: request.headers.get("x-nf-request-id") || "unknown",
      stage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Could not save this request to the admin inbox." }, 500);
  }
};
