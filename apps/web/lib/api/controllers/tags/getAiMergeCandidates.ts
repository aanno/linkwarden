import { prisma } from "@linkwarden/prisma";
import { Prisma } from "@prisma/client";

/**
 * Tag candidate data returned by provider
 */
export type TagCandidate = {
  id: number;
  name: string;
  linkCount: number;
};

/**
 * Function signature for a tag merge candidate provider
 * @param userId - The user ID to fetch tags for
 * @returns Array of tag candidates
 */
export type TagCandidateProvider = (userId: number) => Promise<TagCandidate[]>;

/**
 * Default provider: Returns top N tags sorted by link count (descending)
 * This is the simplest approach - take the most used tags
 */
export const topTagsByLinkCount = async (
  userId: number,
  limit: number = 300
): Promise<TagCandidate[]> => {
  const userTags = await prisma.tag.findMany({
    where: {
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
      _count: {
        select: { links: true },
      },
    },
    orderBy: {
      links: {
        _count: "desc",
      },
    },
    take: limit,
  });

  return userTags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    linkCount: tag._count.links,
  }));
};

/**
 * Reset aiSuggestionCount to 0 for all tags whose count has reached or exceeded
 * resetSuggestionCount. Called at the start of the weighted providers so that
 * over-suggested tags re-enter the "fresh" pool and don't dominate forever.
 */
const resetOversuggested = async (
  userId: number,
  resetSuggestionCount: number
): Promise<void> => {
  await prisma.tag.updateMany({
    where: {
      ownerId: userId,
      aiSuggestionCount: { gte: resetSuggestionCount },
    },
    data: { aiSuggestionCount: 0 },
  });
};

/**
 * Provider 1: Select n tags weighted by aiSuggestionCount
 * Tags with higher aiSuggestionCount have higher probability of being selected
 * Uses weighted random sampling: ORDER BY -LN(RANDOM()) / weight
 *
 * Before sampling, resets aiSuggestionCount to 0 for any tag that has reached
 * resetSuggestionCount. This prevents the same tags from dominating every run.
 *
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @param resetSuggestionCount - Count at which a tag's counter is reset to 0 (default: 30)
 * @returns Array of tag candidates selected by weighted sampling
 */
export const byAiSuggestionCount = async (
  userId: number,
  limit: number = 300,
  resetSuggestionCount: number = 30
): Promise<TagCandidate[]> => {
  await resetOversuggested(userId, resetSuggestionCount);

  type QueryResult = {
    id: number;
    name: string;
    linkCount: bigint;
  };

  const results = await prisma.$queryRaw<QueryResult[]>(
    Prisma.sql`
      SELECT
        t.id,
        t.name,
        COUNT(ltj."A") as "linkCount"
      FROM "Tag" t
      LEFT JOIN "_LinkToTag" ltj ON t.id = ltj."B"
      WHERE t."ownerId" = ${userId}
        AND t."aiSuggestionCount" > 0
      GROUP BY t.id, t.name, t."aiSuggestionCount"
      ORDER BY -LN(RANDOM()) / t."aiSuggestionCount"
      LIMIT ${limit}
    `
  );

  return results.map((tag) => ({
    id: tag.id,
    name: tag.name,
    linkCount: Number(tag.linkCount),
  }));
};

/**
 * Provider 2: Select n tags weighted by aiSuggestionCount with capped weight
 * Similar to Provider 1, but caps the weight at maxWeight
 * This prevents tags with very high counts from dominating the selection
 *
 * Before sampling, resets aiSuggestionCount to 0 for any tag that has reached
 * resetSuggestionCount. resetSuggestionCount is enforced to be > maxWeight so
 * that every tag reaches the cap at least once before being reset.
 *
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @param maxWeight - Maximum weight cap (default: 20)
 * @param resetSuggestionCount - Count at which a tag's counter is reset to 0 (default: 30, always > maxWeight)
 * @returns Array of tag candidates selected by capped weighted sampling
 */
export const byAiSuggestionCountCapped = async (
  userId: number,
  limit: number = 300,
  maxWeight: number = 20,
  resetSuggestionCount: number = 30
): Promise<TagCandidate[]> => {
  // Guarantee the reset threshold is always strictly above the cap, so a tag
  // must reach the cap (and thus be treated as equally weighted) for at least
  // one round before being reset.
  const effectiveReset = Math.max(resetSuggestionCount, maxWeight + 1);

  await resetOversuggested(userId, effectiveReset);

  type QueryResult = {
    id: number;
    name: string;
    linkCount: bigint;
  };

  const results = await prisma.$queryRaw<QueryResult[]>(
    Prisma.sql`
      SELECT
        t.id,
        t.name,
        COUNT(ltj."A") as "linkCount"
      FROM "Tag" t
      LEFT JOIN "_LinkToTag" ltj ON t.id = ltj."B"
      WHERE t."ownerId" = ${userId}
        AND t."aiSuggestionCount" > 0
      GROUP BY t.id, t.name, t."aiSuggestionCount"
      ORDER BY -LN(RANDOM()) / LEAST(t."aiSuggestionCount", ${maxWeight})
      LIMIT ${limit}
    `
  );

  return results.map((tag) => ({
    id: tag.id,
    name: tag.name,
    linkCount: Number(tag.linkCount),
  }));
};

/**
 * Provider 3: Select n tags weighted by absolute difference from median aiSuggestionCount
 * Tags closer to the median have higher probability of being selected
 * Calculates median in a separate query first (no transaction for performance)
 *
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @returns Array of tag candidates selected by proximity to median
 */
export const byMedianDifference = async (
  userId: number,
  limit: number = 300
): Promise<TagCandidate[]> => {
  // First, calculate the median aiSuggestionCount for this user's tags
  type MedianResult = { median: number | null };

  const medianResult = await prisma.$queryRaw<MedianResult[]>(
    Prisma.sql`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "aiSuggestionCount") as median
      FROM "Tag"
      WHERE "ownerId" = ${userId}
        AND "aiSuggestionCount" > 0
    `
  );

  const median = medianResult[0]?.median ?? 0;

  // Now select tags weighted by their distance from the median
  type QueryResult = {
    id: number;
    name: string;
    linkCount: bigint;
  };

  const results = await prisma.$queryRaw<QueryResult[]>(
    Prisma.sql`
      SELECT
        t.id,
        t.name,
        COUNT(ltj."A") as "linkCount"
      FROM "Tag" t
      LEFT JOIN "_LinkToTag" ltj ON t.id = ltj."B"
      WHERE t."ownerId" = ${userId}
        AND t."aiSuggestionCount" > 0
      GROUP BY t.id, t.name, t."aiSuggestionCount"
      ORDER BY -LN(RANDOM()) / (1.0 / (1.0 + ABS(t."aiSuggestionCount" - ${median})))
      LIMIT ${limit}
    `
  );

  return results.map((tag) => ({
    id: tag.id,
    name: tag.name,
    linkCount: Number(tag.linkCount),
  }));
};

/**
 * Provider 4: Uniformly select n tags that have exactly 1 link
 * These single-link tags are often too specific and good candidates for cleanup
 * Uses simple RANDOM() for uniform distribution
 *
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @returns Array of tag candidates with exactly 1 link
 */
export const uniformLowUsage = async (
  userId: number,
  limit: number = 300
): Promise<TagCandidate[]> => {
  type QueryResult = {
    id: number;
    name: string;
    linkCount: bigint;
  };

  const results = await prisma.$queryRaw<QueryResult[]>(
    Prisma.sql`
      SELECT
        t.id,
        t.name,
        COUNT(ltj."A") as "linkCount"
      FROM "Tag" t
      LEFT JOIN "_LinkToTag" ltj ON t.id = ltj."B"
      WHERE t."ownerId" = ${userId}
      GROUP BY t.id, t.name
      HAVING COUNT(ltj."A") = 1
      ORDER BY RANDOM()
      LIMIT ${limit}
    `
  );

  return results.map((tag) => ({
    id: tag.id,
    name: tag.name,
    linkCount: Number(tag.linkCount),
  }));
};

/**
 * Combined provider: Mix of three strategies for comprehensive coverage
 * - 150 tags from byAiSuggestionCountCapped (variety + continuity)
 * - 150 tags from byMedianDifference (quality sweet spot)
 * - 150 tags from uniformLowUsage (cleanup overly specific tags)
 *
 * Deduplicates by tag ID to avoid suggesting the same tag multiple times
 *
 * @param userId - The user ID to fetch tags for
 * @returns Array of unique tag candidates (up to 450 tags, less after deduplication)
 */
export const combinedProvider = async (
  userId: number
): Promise<TagCandidate[]> => {
  // Fetch from all three providers in parallel
  const [cappedTags, medianTags, lowUsageTags] = await Promise.all([
    byAiSuggestionCountCapped(userId, 150), // maxWeight=20, resetSuggestionCount=30 (defaults)
    byMedianDifference(userId, 150),
    uniformLowUsage(userId, 150),
  ]);

  // Use Map for deduplication by tag ID (keeps first occurrence)
  const uniqueTagsMap = new Map<number, TagCandidate>();

  // Add tags from each provider (order determines priority for duplicates)
  [...cappedTags, ...medianTags, ...lowUsageTags].forEach((tag) => {
    if (!uniqueTagsMap.has(tag.id)) {
      uniqueTagsMap.set(tag.id, tag);
    }
  });

  return Array.from(uniqueTagsMap.values());
};

/**
 * Alternative provider: Returns tags with similar names
 * This focuses on tags that are likely duplicates based on fuzzy matching
 * (Not yet implemented - placeholder for future enhancement)
 */
export const similarNameTags = async (
  userId: number
): Promise<TagCandidate[]> => {
  // TODO: Implement similarity-based candidate selection
  // Could use Levenshtein distance, soundex, or other fuzzy matching
  throw new Error("similarNameTags provider not yet implemented");
};

/**
 * Get tag merge candidates using the specified provider
 * @param userId - The user ID to fetch tags for
 * @param provider - The candidate provider function to use (defaults to topTagsByLinkCount)
 * @returns Array of tag candidates
 */
export const getTagMergeCandidates = async (
  userId: number,
  provider: TagCandidateProvider = (uid) => topTagsByLinkCount(uid, 300)
): Promise<TagCandidate[]> => {
  return await provider(userId);
};
