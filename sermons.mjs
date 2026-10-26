const CHANNEL_URL = "https://www.youtube.com/@newlifejemschurchofficial/streams";
const CHANNEL_HANDLE_URL = "https://youtube.com/@newlifejemschurchofficial";
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=1800, s-maxage=1800" },
});
function decodeXml(value = "") {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function tag(xml, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`));
  return decodeXml(match?.[1] || "");
}
export default async () => {
  try {
    const channelResponse = await fetch(CHANNEL_URL, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; NewLifeJemsWebsite/1.0)", accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (!channelResponse.ok) return json({ error: "The YouTube channel is temporarily unavailable." }, 502);
    const channelHtml = await channelResponse.text();
    const channelId = channelHtml.match(/(?:"channelId"|"externalId")\s*:\s*"(UC[\w-]{20,})"/)?.[1]
      || channelHtml.match(/<meta\s+itemprop="channelId"\s+content="(UC[\w-]+)"/i)?.[1];
    if (!channelId) return json({ error: "Could not resolve the church YouTube channel." }, 502);

    const feedResponse = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; NewLifeJemsWebsite/1.0)", accept: "application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(10000),
    });
    if (!feedResponse.ok) return json({ error: "The latest church videos are temporarily unavailable." }, 502);
    const xml = await feedResponse.text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => ({
      id: tag(entry, "yt:videoId"),
      title: tag(entry, "title"),
      publishedAt: tag(entry, "published"),
    })).filter(video => /^[\w-]{11}$/.test(video.id) && video.title && !Number.isNaN(Date.parse(video.publishedAt)))
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return json({ videos, channelUrl: CHANNEL_HANDLE_URL });
  } catch {
    return json({ error: "The latest church videos are temporarily unavailable." }, 502);
  }
};