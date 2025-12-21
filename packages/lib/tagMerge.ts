import { prisma } from "@linkwarden/prisma";

export type MergeTagsOptions = {
  userId: number;
  tagIds: number[];
  newTagName: string;
  aiSuggestionCount?: number;
};

/**
 * Core tag merge logic - used by both manual API and worker
 * @param options - Merge options including optional aiSuggestionCount
 * @returns The newly created tag
 */
export async function performTagMerge(options: MergeTagsOptions) {
  const { userId, tagIds, newTagName, aiSuggestionCount } = options;

  // Check if tags to merge still exist
  const existingTags = await prisma.tag.findMany({
    where: {
      id: { in: tagIds },
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  // Extract IDs of tags that actually exist
  const existingTagIds = existingTags.map((t) => t.id);

  // If no tags exist, they were already merged - return early
  if (existingTagIds.length === 0) {
    // Check if the target tag already exists and return it
    const existingTargetTag = await prisma.tag.findUnique({
      where: {
        name_ownerId: {
          name: newTagName,
          ownerId: userId,
        },
      },
    });
    if (existingTargetTag) {
      return existingTargetTag;
    }
    throw new Error("Tags to merge no longer exist and target tag not found");
  }

  // If only 1 tag exists and it has the target name, nothing to do - just return it
  if (existingTagIds.length === 1) {
    const singleTag = existingTags[0];
    if (singleTag.name === newTagName) {
      return await prisma.tag.findUniqueOrThrow({
        where: { id: singleTag.id },
      });
    }
    // Single tag but different name - proceed with rename
  }

  // Check if one of the tags being merged already has the target name
  const tagWithTargetName = existingTags.find((t) => t.name === newTagName);

  // Find all links that have ANY of the existing tags (not the original tagIds)
  let affectedLinks: number[];

  affectedLinks = (
    await prisma.link.findMany({
      where: {
        tags: {
          some: {
            id: {
              in: existingTagIds, // ✅ Use only existing tag IDs
            },
            ownerId: userId,
          },
        },
      },
      select: {
        id: true,
      },
    })
  ).map((link) => link.id);

  const { newTag } = await prisma.$transaction(async (tx) => {
    // Delete tags that don't have the target name
    const tagsToDelete = tagWithTargetName
      ? existingTags.filter((t) => t.id !== tagWithTargetName.id).map((t) => t.id)
      : existingTags.map((t) => t.id);

    if (tagsToDelete.length > 0) {
      await tx.tag.deleteMany({
        where: {
          ownerId: userId,
          id: {
            in: tagsToDelete,
          },
        },
      });
    }

    let newTag;
    if (tagWithTargetName) {
      // Update existing tag with merged links and aiSuggestionCount
      newTag = await tx.tag.update({
        where: {
          id: tagWithTargetName.id,
        },
        data: {
          ...(aiSuggestionCount !== undefined && { aiSuggestionCount }),
          links: {
            connect: affectedLinks.map((id) => ({ id })),
          },
        },
      });
    } else {
      // Create new tag or update if exists (upsert)
      newTag = await tx.tag.upsert({
        where: {
          name_ownerId: {
            name: newTagName,
            ownerId: userId,
          },
        },
        create: {
          name: newTagName,
          ownerId: userId,
          ...(aiSuggestionCount !== undefined && { aiSuggestionCount }),
          links: {
            connect: affectedLinks.map((id) => ({ id })),
          },
        },
        update: {
          ...(aiSuggestionCount !== undefined && { aiSuggestionCount }),
          links: {
            connect: affectedLinks.map((id) => ({ id })),
          },
        },
      });
    }

    await tx.link.updateMany({
      where: {
        id: {
          in: affectedLinks,
        },
      },
      data: {
        indexVersion: null,
      },
    });

    return { newTag };
  });

  return newTag;
}

export type AdditionalTagOptions = {
  userId: number;
  tagIds: number[];
  newTagName: string;
  aiSuggestionCount?: number;
};

/**
 * FEATURE #4: Add a tag to all links that have the selected tags (without removing the original tags)
 * @param options - Addition options including optional aiSuggestionCount
 * @returns The newly created/updated tag and stats about the operation
 */
export async function performAdditionalTag(options: AdditionalTagOptions) {
  const { userId, tagIds, newTagName, aiSuggestionCount } = options;

  // Check if tags still exist
  const existingTags = await prisma.tag.findMany({
    where: {
      id: { in: tagIds },
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  // Extract IDs of tags that actually exist
  const existingTagIds = existingTags.map((t) => t.id);

  // If no tags exist, nothing to do
  if (existingTagIds.length === 0) {
    throw new Error("Tags to reference no longer exist");
  }

  // Find all links that have ANY of the existing tags
  const linksWithTags = await prisma.link.findMany({
    where: {
      tags: {
        some: {
          id: {
            in: existingTagIds,
          },
          ownerId: userId,
        },
      },
    },
    select: {
      id: true,
      tags: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const affectedLinkIds = linksWithTags.map((link) => link.id);

  // Filter out links that already have the new tag (to avoid duplicates)
  const linksNeedingTag = linksWithTags.filter(
    (link) => !link.tags.some((tag) => tag.name === newTagName)
  );
  const linksToConnect = linksNeedingTag.map((link) => link.id);

  const { newTag, linksUpdated, linksSkipped } = await prisma.$transaction(async (tx) => {
    // Create or find the new tag
    const newTag = await tx.tag.upsert({
      where: {
        name_ownerId: {
          name: newTagName,
          ownerId: userId,
        },
      },
      create: {
        name: newTagName,
        ownerId: userId,
        ...(aiSuggestionCount !== undefined && { aiSuggestionCount }),
        links: {
          connect: linksToConnect.map((id) => ({ id })),
        },
      },
      update: {
        ...(aiSuggestionCount !== undefined && { aiSuggestionCount }),
        links: {
          connect: linksToConnect.map((id) => ({ id })),
        },
      },
    });

    // Update indexVersion for affected links
    if (linksToConnect.length > 0) {
      await tx.link.updateMany({
        where: {
          id: {
            in: linksToConnect,
          },
        },
        data: {
          indexVersion: null,
        },
      });
    }

    return {
      newTag,
      linksUpdated: linksToConnect.length,
      linksSkipped: affectedLinkIds.length - linksToConnect.length, // Links that already had the tag
    };
  });

  console.log(
    `Added tag "${newTagName}" to ${linksUpdated} links (${linksSkipped} already had it)`
  );

  return { newTag, linksUpdated, linksSkipped };
}
