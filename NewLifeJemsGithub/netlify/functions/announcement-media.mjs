import { getStore } from "@netlify/blobs";

const allowed = new Map([
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

export default async (request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!/^uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(key)) return new Response("Not found", { status: 404 });
  try {
    const extension = key.split(".").at(-1).toLowerCase();
    const image = await getStore("newlifejems-announcements").get(key, { type: "arrayBuffer" });
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(image, {
      headers: { "content-type": allowed.get(extension), "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Image unavailable", { status: 503 });
  }
};
