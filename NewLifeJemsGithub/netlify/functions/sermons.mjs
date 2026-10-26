const CHANNEL = "https://www.youtube.com/@newlifejemschurchofficial";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=1800" },
});
function findInitialData(html) {
  const match = html.match(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}
function text(value) {
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
export default async () => {
  const results = await Promise.allSettled([
    fetchVideos("/streams?hl=en&gl=IN"),
    fetchVideos("/videos?view=0&sort=p&flow=grid&hl=en&gl=IN"),
  ]);
  const latestStreams = results[0].status === "fulfilled" ? results[0].value.slice(0, 5) : [];
  const popularVideos = results[1].status === "fulfilled" ? results[1].value.slice(0, 5) : [];
  const hasError = results.some((result) => result.status === "rejected");
  if (!latestStreams.length && !popularVideos.length) {
    return json({ latestStreams, popularVideos, error: "The channel video lists are temporarily unavailable." }, 502);
  }
  return json({ latestStreams, popularVideos, error: hasError ? "Some channel videos are temporarily unavailable." : null });
};