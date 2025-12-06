import { prisma } from "@linkwarden/prisma";

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
 * Alternative provider: Returns tags with low usage (1-2 links)
 * These are good candidates for merging into more general tags
 * (Not yet implemented - placeholder for future enhancement)
 */
export const lowUsageTags = async (
  userId: number
): Promise<TagCandidate[]> => {
  // TODO: Implement low-usage candidate selection
  // Could focus on tags with 1-2 links that might be too specific
  throw new Error("lowUsageTags provider not yet implemented");
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
