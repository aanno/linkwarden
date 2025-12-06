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
 * Provider 1: Select n tags weighted by aiSuggestionCount
 * Tags with higher aiSuggestionCount have higher probability of being selected
 * Uses weighted random sampling: ORDER BY -LN(RANDOM()) / weight
 *
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @returns Array of tag candidates selected by weighted sampling
 */
export const byAiSuggestionCount = async (
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
        COUNT(ltj.id) as "linkCount"
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
 * @param userId - The user ID to fetch tags for
 * @param limit - Number of tags to select (default: 300)
 * @param maxWeight - Maximum weight cap (default: 10)
 * @returns Array of tag candidates selected by capped weighted sampling
 */
export const byAiSuggestionCountCapped = async (
  userId: number,
  limit: number = 300,
  maxWeight: number = 10
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
        COUNT(ltj.id) as "linkCount"
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
        COUNT(ltj.id) as "linkCount"
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
        COUNT(ltj.id) as "linkCount"
      FROM "Tag" t
      LEFT JOIN "_LinkToTag" ltj ON t.id = ltj."B"
      WHERE t."ownerId" = ${userId}
      GROUP BY t.id, t.name
      HAVING COUNT(ltj.id) = 1
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
