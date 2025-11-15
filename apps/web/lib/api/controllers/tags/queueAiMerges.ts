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
    // Validate that all tags belong to the user
    const allTagIds = merges.flatMap((m) => m.tagIds);
    const tagCount = await prisma.tag.count({
      where: {
        id: { in: allTagIds },
        ownerId: userId,
      },
    });

    if (tagCount !== allTagIds.length) {
      return {
        response: "Error: Some tags do not exist or do not belong to you",
        status: 403,
      };
    }

    // Create merge jobs
    const jobs = await prisma.tagMergeJob.createMany({
      data: merges.map((merge) => ({
        userId,
        newTagName: merge.newTagName,
        tagIds: merge.tagIds,
        status: "PENDING",
      })),
    });

    return {
      response: {
        message: `Successfully queued ${jobs.count} merge operations`,
        jobsCreated: jobs.count,
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
