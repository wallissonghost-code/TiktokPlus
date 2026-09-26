import { inspectPublicTikTokVideo } from "../providers/tiktok-public.js";
import { analyzeVideos } from "../core/analyze.js";
import { ENGINE_VERSION } from "../version.js";

const MAX_BATCH_VIDEOS = 20;

function compareVideos(videos) {
  const row = (video) => ({
    id: video.id,
    url: video.url,
    createdAt: video.createdAt,
    views: video.metrics.views,
    likes: video.metrics.likes,
    comments: video.metrics.comments,
    shares: video.metrics.shares,
    saves: video.metrics.saves,
    engagementRate: video.derived.engagementRate
  });

  return {
    byViews: [...videos].sort((a, b) => b.metrics.views - a.metrics.views).map(row),
    byEngagementRate: [...videos].sort((a, b) => b.derived.engagementRate - a.derived.engagementRate).map(row)
  };
}

export async function analyzeVideoBatch(urls, { signal } = {}) {
  const inputUrls = [...new Set(
    (Array.isArray(urls) ? urls : [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  )];

  if (!inputUrls.length) throw new Error("At least one TikTok video URL is required");
  if (inputUrls.length > MAX_BATCH_VIDEOS) throw new Error(`Maximum ${MAX_BATCH_VIDEOS} TikTok video URLs per batch`);

  const settled = await Promise.allSettled(
    inputUrls.map((url) => inspectPublicTikTokVideo(url, { signal }))
  );

  const collected = [];
  const results = settled.map((result, index) => {
    const inputUrl = inputUrls[index];
    if (result.status === "rejected") {
      return {
        inputUrl,
        ok: false,
        error: result.reason instanceof Error ? result.reason.message : "Video collection failed"
      };
    }

    const inspected = result.value;
    if (!inspected.video) {
      return {
        inputUrl,
        ok: false,
        resolvedUrl: inspected.input?.resolvedUrl ?? null,
        videoId: inspected.input?.videoId ?? null,
        diagnostic: inspected.diagnostic
      };
    }

    collected.push(inspected.video);
    return {
      inputUrl,
      ok: true,
      resolvedUrl: inspected.input.resolvedUrl,
      shortLinkResolved: inspected.input.shortLinkResolved,
      videoId: inspected.input.videoId
    };
  });

  const analysis = analyzeVideos(collected, { collectionSucceeded: collected.length > 0 });

  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    source: "tiktok-public-video-batch",
    collectedAt: new Date().toISOString(),
    input: {
      requested: inputUrls.length,
      collected: collected.length,
      failed: inputUrls.length - collected.length
    },
    resolution: results,
    ...analysis,
    comparison: compareVideos(analysis.videos)
  };
}
