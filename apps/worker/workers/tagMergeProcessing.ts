import { prisma } from "@linkwarden/prisma";
import { delay } from "@linkwarden/lib";

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
          console.log(
            "\x1b[34m%s\x1b[0m",
            `- Processing merge job ${job.id}: "${job.newTagName}" (${job.tagIds.length} tags)`
          );

          // Mark as processing
          await prisma.tagMergeJob.update({
            where: { id: job.id },
            data: { status: "PROCESSING" },
          });

          // Execute the merge operation
          // Find all links associated with tags to be merged
          const affectedLinks = (
            await prisma.link.findMany({
              where: {
                tags: {
                  some: {
                    id: {
                      in: job.tagIds,
                    },
                    ownerId: job.userId,
                  },
                },
              },
              select: {
                id: true,
              },
            })
          ).map((link) => link.id);

          // Perform atomic merge operation
          await prisma.$transaction(async (tx) => {
            // Delete old tags
            await tx.tag.deleteMany({
              where: {
                ownerId: job.userId,
                id: {
                  in: job.tagIds,
                },
              },
            });

            // Create new tag with all affected links
            await tx.tag.create({
              data: {
                name: job.newTagName,
                ownerId: job.userId,
                links: {
                  connect: affectedLinks.map((id) => ({ id })),
                },
              },
            });

            // Invalidate search index for affected links
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
          });

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
              `✓ Completed merge job ${job.id}: "${job.newTagName}"`
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
              `✗ Failed merge job ${job.id}: ${result.response}`
            );
          }
        } catch (error: any) {
          // Unexpected error
          console.error(
            "\x1b[31m%s\x1b[0m",
            `Error processing merge job ${job.id}:`,
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
