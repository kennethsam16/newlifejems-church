const CHANNEL = "https://www.youtube.com/@newlifejemschurchofficial";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=1800" },
});
function findInitialData(html) {
  const markers = /(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=/g;
  let marker;
  while ((marker = markers.exec(html))) {
    const start = html.indexOf("{", marker.index + marker[0].length);
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < html.length; index += 1) {
      const character = html[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try { return JSON.parse(html.slice(start, index + 1)); } catch { break; }
      }
    }
  }
  return null;
}function text(value) {
  if (typeof value === "string") return value;
  if (value?.simpleText) return value.simpleText;
  if (Array.isArray(value?.runs)) return value.runs.map((run) => run.text || "").join("");
  return "";
}
function videosFrom(data) {
  const output = [];
  const seen = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    const renderer = node.videoRenderer || node.gridVideoRenderer || node.playlistVideoRenderer;
    if (renderer?.videoId && !seen.has(renderer.videoId)) {
      seen.add(renderer.videoId);
      const thumbnails = renderer.thumbnail?.thumbnails || renderer.richThumbnail?.movingThumbnailRenderer?.movingThumbnailDetails?.thumbnails || [];
      output.push({
        id: renderer.videoId,
        title: text(renderer.title),
        publishedText: text(renderer.publishedTimeText || renderer.upcomingEventData?.startTimeText),
        thumbnail: thumbnails.at(-1)?.url || `https://i.ytimg.com/vi/${renderer.videoId}/hqdefault.jpg`,
      });
    }
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    for (const value of Object.values(node)) visit(value);
  }
  visit(data);
  return output.filter((video) => /^[\w-]{11}$/.test(video.id) && video.title);
}
async function fetchVideos(path) {
  const response = await fetch(`${CHANNEL}${path}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; NewLifeJemsWebsite/1.0)", accept: "text/html" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("YouTube channel unavailable");
  const initialData = findInitialData(await response.text());
  if (!initialData) throw new Error("YouTube video list unavailable");
  return videosFrom(initialData);
}
async function fetchRecentUploads() {
  const response = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=UCRSUtlW95kyxN_Jx6mFi-SA", { headers: { "user-agent": "Mozilla/5.0 (compatible; NewLifeJemsWebsite/1.0)", accept: "application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("YouTube uploads unavailable");
  const xml = await response.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => {
    const field = (tag) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`))?.[1] || "";
    const id = field("yt:videoId").trim();
    const title = field("title").replace(/&amp;/g, "&").trim();
    return { id, title, publishedText: field("published").slice(0, 10), thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }).filter((video) => /^[\w-]{11}$/.test(video.id) && video.title).slice(0, 5);
}
export default async () => {
  const results = await Promise.allSettled([
    fetchVideos("/streams?hl=en&gl=IN"),
    fetchVideos("/videos?view=0&sort=p&flow=grid&hl=en&gl=IN"),
    fetchRecentUploads(),
  ]);
  let latestStreams = results[0].status === "fulfilled" ? results[0].value.slice(0, 5) : [];
  const popularVideos = results[1].status === "fulfilled" ? results[1].value.slice(0, 5) : [];
  if (!latestStreams.length && results[2].status === "fulfilled") latestStreams = results[2].value;
  const hasError = !latestStreams.length || !popularVideos.length;
  if (!latestStreams.length && !popularVideos.length) {
    return json({ latestStreams, popularVideos, error: "The channel video lists are temporarily unavailable." }, 502);
  }
  return json({ latestStreams, popularVideos, error: hasError ? "Some channel videos are temporarily unavailable." : null });
};
