const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function findObject(root, predicate, seen = new Set()) {
  if (!root || typeof root !== "object" || seen.has(root)) return null;
  seen.add(root);
  if (predicate(root)) return root;
  for (const value of Object.values(root)) {
    const found = findObject(value, predicate, seen);
    if (found) return found;
  }
  return null;
}

function parseEmbeddedJson(html) {
  const patterns = [
    /<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]+id=["']SIGI_STATE["'][^>]*>([\s\S]*?)<\/script>/i
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    try { return JSON.parse(match[1]); } catch {}
  }
  throw new Error("TikTok page did not expose a supported public data payload");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractProfile(payload, username) {
  const user = findObject(payload, (obj) =>
    (obj.uniqueId || obj.unique_id) &&
    String(obj.uniqueId ?? obj.unique_id).toLowerCase() === username.toLowerCase()
  );
  return user ? {
    id: String(user.id ?? user.uid ?? ""),
    username: user.uniqueId ?? user.unique_id ?? username,
    nickname: user.nickname ?? null,
    avatarUrl: user.avatarLarger ?? user.avatarMedium ?? user.avatarThumb ?? null,
    bio: user.signature ?? null,
    verified: Boolean(user.verified)
  } : { id: null, username, nickname: null, avatarUrl: null, bio: null, verified: false };
}

function extractItems(payload) {
  const found = new Map();
  const visit = (value, seen = new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value) && (value.id || value.itemId) && (value.video || value.stats || value.statsV2)) {
      found.set(String(value.id ?? value.itemId), value);
    }
    for (const child of Object.values(value)) visit(child, seen);
  };
  visit(payload);
  return [...found.values()];
}

function mapItem(item, username) {
  const stats = item.statsV2 ?? item.stats ?? {};
  const video = item.video ?? {};
  const id = String(item.id ?? item.itemId);
  const text = item.desc ?? item.description ?? "";
  return {
    id,
    url: `https://www.tiktok.com/@${username}/video/${id}`,
    description: text,
    hashtags: [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]),
    createdAt: item.createTime ? new Date(number(item.createTime) * 1000).toISOString() : null,
    durationSeconds: number(video.duration),
    coverUrl: video.cover ?? video.dynamicCover ?? video.originCover ?? null,
    metrics: {
      views: number(stats.playCount ?? stats.play_count),
      likes: number(stats.diggCount ?? stats.digg_count),
      comments: number(stats.commentCount ?? stats.comment_count),
      shares: number(stats.shareCount ?? stats.share_count),
      saves: number(stats.collectCount ?? stats.collect_count)
    }
  };
}

async function fetchPage(url, signal) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    signal,
    headers: {
      "user-agent": USER_AGENT,
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
    }
  });
  const html = await response.text();
  return {
    response,
    html,
    diagnostic: {
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      responseBytes: Buffer.byteLength(html)
    }
  };
}

export async function fetchPublicTikTokProfile(username, { signal } = {}) {
  const page = await fetchPage(`https://www.tiktok.com/@${encodeURIComponent(username)}`, signal);
  if (!page.response.ok) throw new Error(`TikTok profile responded with HTTP ${page.response.status}`);
  const payload = parseEmbeddedJson(page.html);
  const profile = extractProfile(payload, username);
  return {
    source: "tiktok-public-profile",
    collectedAt: new Date().toISOString(),
    profile,
    diagnostic: {
      step: "profile-page",
      ...page.diagnostic,
      profileFound: Boolean(profile.id)
    }
  };
}

async function fetchVideoPageItem(username, id, signal) {
  const requestedUrl = `https://www.tiktok.com/@${username}/video/${id}`;
  const page = await fetchPage(requestedUrl, signal);
  const diagnostic = {
    step: "video-page",
    id: String(id),
    requestedUrl,
    finalUrl: page.response.url,
    redirected: page.response.redirected,
    ...page.diagnostic,
    embeddedPayloadParsed: false,
    extractedItemCount: 0,
    matchedRequestedId: false
  };
  if (!page.response.ok) return { item: null, diagnostic };
  try {
    const payload = parseEmbeddedJson(page.html);
    diagnostic.embeddedPayloadParsed = true;
    const items = extractItems(payload);
    diagnostic.extractedItemCount = items.length;
    const matched = items.find((item) => String(item.id ?? item.itemId) === String(id)) ?? null;
    diagnostic.matchedRequestedId = Boolean(matched);
    return { item: matched, diagnostic };
  } catch {
    return { item: null, diagnostic };
  }
}

export async function inspectPublicTikTokVideo(videoUrl, { signal } = {}) {
  let parsed;
  try { parsed = new URL(String(videoUrl ?? "").trim()); } catch { throw new Error("Invalid TikTok video URL"); }
  if (parsed.protocol !== "https:" || !/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
    throw new Error("Invalid TikTok video URL");
  }

  const originalUrl = parsed.toString();
  let resolvedUrl = originalUrl;
  let shortLinkResolved = false;
  const isShortLink = /^(?:v|vm|vt)\.tiktok\.com$/i.test(parsed.hostname);
  let redirectDiagnostic = null;

  if (isShortLink) {
    const startedAt = Date.now();
    const response = await fetch(originalUrl, {
      signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.8"
      }
    });
    resolvedUrl = response.url;
    shortLinkResolved = resolvedUrl !== originalUrl;
    try { parsed = new URL(resolvedUrl); } catch { throw new Error("TikTok short URL did not resolve to a valid URL"); }
    if (!/(^|\.)tiktok\.com$/i.test(parsed.hostname)) throw new Error("TikTok short URL redirected outside TikTok");
    redirectDiagnostic = {
      step: "short-link-resolve",
      httpStatus: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      originalUrl,
      finalUrl: resolvedUrl,
      redirected: response.redirected,
      resolved: shortLinkResolved
    };
  }

  const match = parsed.pathname.match(/^\/@([^/]+)\/video\/(\d{10,})/i);
  if (!match) throw new Error("TikTok URL did not resolve to @username/video/videoId");
  const username = decodeURIComponent(match[1]);
  const id = match[2];
  const result = await fetchVideoPageItem(username, id, signal);
  return {
    source: "tiktok-public-video-page",
    input: { url: originalUrl, resolvedUrl, shortLinkResolved, username, videoId: id },
    collectedAt: new Date().toISOString(),
    redirectDiagnostic,
    diagnostic: result.diagnostic,
    video: result.item ? mapItem(result.item, username) : null
  };
}
