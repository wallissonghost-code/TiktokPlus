function safeRate(value, views) {
  return views > 0 ? value / views : 0;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function analyzeVideos(videos, { collectionSucceeded = true } = {}) {
  const enriched = videos.map((video) => {
    const m = video.metrics;
    const engagementActions = m.likes + m.comments + m.shares + m.saves;

    return {
      ...video,
      derived: {
        likeRate: safeRate(m.likes, m.views),
        commentRate: safeRate(m.comments, m.views),
        shareRate: safeRate(m.shares, m.views),
        saveRate: safeRate(m.saves, m.views),
        engagementRate: safeRate(engagementActions, m.views),
        postingHourUtc: video.createdAt ? new Date(video.createdAt).getUTCHours() : null,
        postingWeekdayUtc: video.createdAt ? new Date(video.createdAt).getUTCDay() : null
      }
    };
  });

  return {
    videos: enriched,
    summary: collectionSucceeded ? {
      videoCount: enriched.length,
      totalViews: enriched.reduce((sum, v) => sum + v.metrics.views, 0),
      totalLikes: enriched.reduce((sum, v) => sum + v.metrics.likes, 0),
      totalComments: enriched.reduce((sum, v) => sum + v.metrics.comments, 0),
      totalShares: enriched.reduce((sum, v) => sum + v.metrics.shares, 0),
      averageViews: average(enriched.map((v) => v.metrics.views)),
      averageEngagementRate: average(enriched.map((v) => v.derived.engagementRate))
    } : {
      videoCount: null,
      totalViews: null,
      totalLikes: null,
      totalComments: null,
      totalShares: null,
      averageViews: null,
      averageEngagementRate: null,
      unavailableReason: "Video collection failed; zero would be misleading"
    },
    unavailableWithoutPrivateAnalytics: [
      "averageWatchTime",
      "retentionCurve",
      "completionRate",
      "viewerTrafficSources",
      "minuteByMinuteViewerBehavior"
    ]
  };
}
