import { randomUUID } from "node:crypto";
import { isAdminPassword } from "../lib/admin-auth.mjs";
import { getStore } from "@netlify/blobs";

const store = getStore("newlifejems-announcements");
const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function authorized(request) {
  return isAdminPassword(request.headers.get("x-admin-password") || "");
}

async function publicItems() {
  const { blobs } = await store.list({ prefix: "posts/" });
  const items = await Promise.all(blobs.map(({ key }) => store.get(key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export default async (request) => {
  if (request.method === "GET") {
    if (request.headers.has("x-admin-password")) {
      if (!authorized(request)) return respond({ error: "Admin password is incorrect." }, 401);
    }
    try { return respond({ announcements: await publicItems() }); }
    catch { return respond({ error: "Announcements are temporarily unavailable." }, 503); }
  }
  if (request.method !== "POST" && request.method !== "DELETE") {
    return respond({ error: "Method not allowed." }, 405);
  }
  if (!authorized(request)) return respond({ error: "Admin password is incorrect." }, 401);


  try {
    if (request.method === "DELETE") {
      const { id } = await request.json();
      if (!/^[0-9a-f-]{36}$/i.test(id || "")) return respond({ error: "Invalid announcement." }, 400);
      const key = `posts/${id}.json`;
      const item = await store.get(key, { type: "json" });
      if (!item) return respond({ error: "Announcement not found." }, 404);
      if (item.imageKey) await store.delete(item.imageKey);
      await store.delete(key);
      return respond({ ok: true });
    }

    const form = await request.formData();
    const title = String(form.get("title") || "").trim().slice(0, 120);
    const category = String(form.get("category") || "Announcement");
    const eventDate = String(form.get("eventDate") || "").trim().slice(0, 30);
    const content = String(form.get("content") || "").trim().slice(0, 2400);
    if (title.length < 3 || content.length < 5) return respond({ error: "Add a title and message before publishing." }, 400);
    const validCategories = new Set(["Announcement", "Upcoming event", "Church news", "Service update"]);
    if (!validCategories.has(category)) return respond({ error: "Choose a valid announcement type." }, 400);

    const id = randomUUID();
    const image = form.get("image");
    let imageKey = "";
    let imageType = "";
    if (image && typeof image.arrayBuffer === "function" && image.size > 0) {
      const ext = allowedTypes.get(image.type);
      if (!ext) return respond({ error: "Images must be JPG, PNG, or WebP." }, 400);
      if (image.size > 3 * 1024 * 1024) return respond({ error: "Choose an image smaller than 3 MB." }, 400);
      imageKey = `uploads/${id}.${ext}`;
      imageType = image.type;
      await store.set(imageKey, await image.arrayBuffer());
    }

    const announcement = {
      id,
      title,
      category,
      eventDate,
      content,
      imageKey,
      imageType,
      publishedAt: new Date().toISOString(),
    };
    await store.setJSON(`posts/${id}.json`, announcement);
    return respond({ ok: true, announcement }, 201);
  } catch {
    return respond({ error: "Could not save this announcement. Please try again." }, 500);
  }
};




