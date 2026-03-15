import { prisma } from "@linkwarden/prisma";
import { QueueAiMergesSchema, QueueAiMergesSchemaType } from "@linkwarden/lib/schemaValidation";

export default async function queueAiMerges(
  userId: number,
  body: QueueAiMergesSchemaType
) {
  const dataValidation = QueueAiMergesSchema.safeParse(body);

  if (!dataValidation.success) {
    return {
      response: `Error: ${dataValidation.error.issues[0].message} [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const { merges } = dataValidation.data;

  try {
    // Validate tags and filter out any that don't exist or don't belong to user
    // This handles stale references gracefully (tags merged/deleted since suggestion generation)
    const allTagIds = merges.flatMap((m) => m.tagIds);
    const existingTags = await prisma.tag.findMany({
      where: {
        id: { in: allTagIds },
        ownerId: userId,
      },
      select: { id: true },
    });

    const existingTagIds = new Set(existingTags.map((t) => t.id));

    // Filter merges to only include those with valid tags
    // 1 existing tag = rename; 2+ existing tags = merge
    const validMerges = merges.filter((merge) => {
      const validTagIds = merge.tagIds.filter((id) => existingTagIds.has(id));
      return validTagIds.length >= 1;
    }).map((merge) => ({
      userId,
      newTagName: merge.newTagName,
      tagIds: merge.tagIds.filter((id) => existingTagIds.has(id)),
      mode: merge.mode || 'merge', // FEATURE #4: Default to 'merge' for backward compatibility
      status: "PENDING" as const,
    }));

    if (validMerges.length === 0) {
      return {
        response: "Error: No valid merges found. All referenced tags have been deleted or merged already.",
        status: 400,
      };
    }

    // Create merge jobs for valid merges only
    const jobs = await prisma.tagMergeJob.createMany({
      data: validMerges,
    });

    const skippedCount = merges.length - jobs.count;
    const message = skippedCount > 0
      ? `Successfully queued ${jobs.count} merge operations (${skippedCount} skipped due to missing tags)`
      : `Successfully queued ${jobs.count} merge operations`;

    return {
      response: {
        message,
        jobsCreated: jobs.count,
        skipped: skippedCount,
      },
      status: 200,
    };
  } catch (err) {
    console.error("Error queueing AI merge jobs:", err);
    return {
      response: `Error queueing merge jobs: ${err instanceof Error ? err.message : "Unknown error"}`,
      status: 500,
    };
  }
}
