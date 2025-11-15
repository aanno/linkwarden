import {
  MergeTagsSchema,
  MergeTagsSchemaType,
} from "@linkwarden/lib/schemaValidation";
import { prisma } from "@linkwarden/prisma";

type MergeTagsOptions = {
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

  // If no tags exist, they were already merged - return early
  if (existingTags.length === 0) {
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

  // Check if one of the tags being merged already has the target name
  const tagWithTargetName = existingTags.find((t) => t.name === newTagName);

  let affectedLinks: number[];

  affectedLinks = (
    await prisma.link.findMany({
      where: {
        tags: {
          some: {
            id: {
              in: tagIds,
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

/**
 * API endpoint wrapper with validation
 */
export default async function mergeTags(
  userId: number,
  body: MergeTagsSchemaType
) {
  const dataValidation = MergeTagsSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const { tagIds, newTagName } = dataValidation.data;

  try {
    const newTag = await performTagMerge({ userId, tagIds, newTagName });
    return { response: newTag, status: 200 };
  } catch (err) {
    return {
      response: `Error merging tags: ${err instanceof Error ? err.message : "Unknown error"}`,
      status: 500,
    };
  }
}
