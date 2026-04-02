type OsintTweet = {
  id: string;
  text?: string;
  isAlert?: boolean;
  hasMatch?: boolean;
  matchQuality?: number;
  timestamp?: string;
};

type DoomsdayMarket = {
  slug?: string;
  label?: string;
  price?: number;
  volume_24h?: number;
};

const OSINT_URL = "https://www.pizzint.watch/api/osint-feed?includeMedia=1&limit=12";
const OSINT_HEAD_URL = "https://www.pizzint.watch/api/osint-feed/head";
const DOOMSDAY_URL = "https://www.pizzint.watch/api/neh-index/doomsday";

const SEVERE_KEYWORDS = [
  "strike",
  "missile",
  "attack",
  "invade",
  "invasion",
  "regime change",
  "blockade",
  "hormuz",
  "military clash",
  "article 5",
  "nato",
  "iran",
  "taiwan",
];

function scoreTweet(text: string) {
  const lower = text.toLowerCase();
  return SEVERE_KEYWORDS.reduce((score, keyword) => score + (lower.includes(keyword) ? 1 : 0), 0);
}

export const onRequestGet = async () => {
  try {
    const [headRes, osintRes, doomsdayRes] = await Promise.all([
      fetch(OSINT_HEAD_URL, { headers: { "user-agent": "Yang-RotBot/1.0" } }),
      fetch(OSINT_URL, { headers: { "user-agent": "Yang-RotBot/1.0" } }),
      fetch(DOOMSDAY_URL, { headers: { "user-agent": "Yang-RotBot/1.0" } }),
    ]);

    if (!headRes.ok || !osintRes.ok || !doomsdayRes.ok) {
      throw new Error(`polyglobe upstream failed: ${headRes.status}/${osintRes.status}/${doomsdayRes.status}`);
    }

    const headData = await headRes.json();
    const osintData = await osintRes.json();
    const doomsdayData = await doomsdayRes.json();

    const tweets: OsintTweet[] = Array.isArray(osintData?.tweets) ? osintData.tweets : [];
    const markets: DoomsdayMarket[] = Array.isArray(doomsdayData?.markets) ? doomsdayData.markets : [];

    const alertTweets = tweets.filter((tweet) => tweet.isAlert);
    const matchedTweets = tweets.filter((tweet) => tweet.hasMatch && Number(tweet.matchQuality ?? 0) >= 0.5);
    const severeTweetHits = tweets.reduce((sum, tweet) => sum + scoreTweet(tweet.text ?? ""), 0);
    const topConflictProbability = markets.reduce((max, market) => Math.max(max, Number(market.price ?? 0)), 0);
    const averageTopConflictProbability =
      markets.slice(0, 5).reduce((sum, market) => sum + Number(market.price ?? 0), 0) / Math.max(Math.min(markets.length, 5), 1);
    const hotConflictMarkets = markets.filter((market) => Number(market.price ?? 0) >= 0.15).length;
    const elevatedVolumeMarkets = markets.filter((market) => Number(market.volume_24h ?? 0) >= 10000).length;

    let riskScore = 0;
    riskScore += Math.min(30, alertTweets.length * 12);
    riskScore += Math.min(20, matchedTweets.length * 5);
    riskScore += Math.min(15, severeTweetHits * 2);
    riskScore += Math.min(20, topConflictProbability * 100);
    riskScore += Math.min(10, averageTopConflictProbability * 40);
    riskScore += Math.min(5, hotConflictMarkets * 2);
    riskScore += Math.min(5, elevatedVolumeMarkets);
    riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

    const reasons: string[] = [];
    if (alertTweets.length > 0) reasons.push(`${alertTweets.length} OSINT alert tweets`);
    if (matchedTweets.length > 0) reasons.push(`${matchedTweets.length} matched geopolitical tweets`);
    if (topConflictProbability >= 0.2) reasons.push(`top conflict market at ${(topConflictProbability * 100).toFixed(1)}%`);
    if (averageTopConflictProbability >= 0.1) reasons.push(`top-5 conflict average at ${(averageTopConflictProbability * 100).toFixed(1)}%`);
    if (elevatedVolumeMarkets >= 2) reasons.push(`${elevatedVolumeMarkets} high-volume conflict markets`);
    if (reasons.length === 0) reasons.push("external geopolitical risk is currently muted");

    const preferShortEntries =
      riskScore >= 45 &&
      (topConflictProbability >= 0.15 || averageTopConflictProbability >= 0.1 || severeTweetHits >= 4);
    const blockNewEntries = false;
    const forceExit = false;

    return Response.json(
      {
        source: "https://www.pizzint.watch/polyglobe",
        fetchedAt: new Date().toISOString(),
        latestTimestamp: headData?.latestTimestamp ?? null,
        riskScore,
        preferShortEntries,
        blockNewEntries,
        forceExit,
        reasons,
        metrics: {
          alertTweets: alertTweets.length,
          matchedTweets: matchedTweets.length,
          severeTweetHits,
          topConflictProbability,
          averageTopConflictProbability,
          hotConflictMarkets,
          elevatedVolumeMarkets,
        },
      },
      {
        headers: {
          "cache-control": "public, max-age=20",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch polyglobe risk data.", error);
    return Response.json(
      {
        source: "https://www.pizzint.watch/polyglobe",
        fetchedAt: new Date().toISOString(),
        riskScore: 0,
        preferShortEntries: false,
        blockNewEntries: false,
        forceExit: false,
        reasons: ["polyglobe risk feed unavailable"],
      },
      { status: 200 },
    );
  }
};
