import { normalizeUsername } from "../core/username.js";
import { fetchPublicTikTokProfile } from "../providers/tiktok-public.js";
import { ENGINE_VERSION } from "../version.js";

export async function analyzeProfile(input, options = {}) {
  const username = normalizeUsername(input);
  const collected = await fetchPublicTikTokProfile(username, options);

  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    source: collected.source,
    collectedAt: collected.collectedAt,
    profile: collected.profile,
    diagnostic: collected.diagnostic
  };
}
