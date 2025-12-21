import { prisma } from "@linkwarden/prisma";
import { delay, performTagMerge, performAdditionalTag } from "@linkwarden/lib";

const TAG_MERGE_BATCH_SIZE = Number(process.env.TAG_MERGE_BATCH_SIZE || "") || 5;

export async function tagMergeProcessing(interval = 10) {
  console.log("\x1b[34m%s\x1b[0m", "Starting tag merge processing...");

  while (true) {
    try {
      // Fetch pending merge jobs
      const pendingJobs = await prisma.tagMergeJob.findMany({
        where: {
          status: "PENDING",
        },
        orderBy: {
          createdAt: "asc", // Process oldest first
        },
        take: TAG_MERGE_BATCH_SIZE,
      });

      if (pendingJobs.length === 0) {
        await delay(interval);
        continue;
      }

      console.log(
        "\x1b[34m%s\x1b[0m",
        `Processing ${pendingJobs.length} tag merge job(s)...`
      );

      // Process each job
      for (const job of pendingJobs) {
        try {
          const isAdditionalMode = job.mode === 'additional';
          const operationType = isAdditionalMode ? 'addition' : 'merge';

          console.log(
            "\x1b[34m%s\x1b[0m",
            `- Processing ${operationType} job ${job.id}: "${job.newTagName}" (${job.tagIds.length} tags)`
          );

          // Mark as processing
          await prisma.tagMergeJob.update({
            where: { id: job.id },
            data: { status: "PROCESSING" },
          });

          // Fetch aiSuggestionCount values from tags to be merged/referenced
          const tagsToMerge = await prisma.tag.findMany({
            where: {
              ownerId: job.userId,
              id: {
                in: job.tagIds,
              },
            },
            select: {
              aiSuggestionCount: true,
            },
          });

          // Sum up the aiSuggestionCount values
          const totalSuggestionCount = tagsToMerge.reduce(
            (sum, tag) => sum + tag.aiSuggestionCount,
            0
          );

          // FEATURE #4: Perform merge or addition based on mode
          if (isAdditionalMode) {
            // Add tag to links without removing original tags
            await performAdditionalTag({
              userId: job.userId,
              tagIds: job.tagIds,
              newTagName: job.newTagName,
              aiSuggestionCount: totalSuggestionCount,
            });
          } else {
            // Merge tags (default behavior)
            await performTagMerge({
              userId: job.userId,
              tagIds: job.tagIds,
              newTagName: job.newTagName,
              aiSuggestionCount: totalSuggestionCount,
            });
          }

          // Mark job as completed
          const result = { status: 200 };

          if (result.status === 200) {
            // Success
            await prisma.tagMergeJob.update({
              where: { id: job.id },
              data: {
                status: "COMPLETED",
                completedAt: new Date(),
              },
            });

            console.log(
              "\x1b[34m%s\x1b[0m",
              `✓ Completed ${operationType} job ${job.id}: "${job.newTagName}"`
            );
          } else {
            // Error
            await prisma.tagMergeJob.update({
              where: { id: job.id },
              data: {
                status: "FAILED",
                error: typeof result.response === "string" ? result.response : "Unknown error",
                completedAt: new Date(),
              },
            });

            console.error(
              "\x1b[31m%s\x1b[0m",
              `✗ Failed ${operationType} job ${job.id}: ${result.response}`
            );
          }
        } catch (error: any) {
          // Unexpected error
          console.error(
            "\x1b[31m%s\x1b[0m",
            `Error processing tag job ${job.id}:`,
            error
          );

          await prisma.tagMergeJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              error: error?.message || "Unknown error",
              completedAt: new Date(),
            },
          });
        }
      }

      // Check remaining jobs
      const remainingJobs = await prisma.tagMergeJob.count({
        where: { status: "PENDING" },
      });

      console.log(
        "\x1b[34m%s\x1b[0m",
        `Processed ${pendingJobs.length} job(s), ${remainingJobs} remaining.`
      );

      await delay(interval);
    } catch (error) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        "Error in tag merge processing loop:",
        error
      );
      await delay(interval * 2); // Wait longer on error
    }
  }
}
