-- CreateEnum
CREATE TYPE "TagMergeJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TagMergeJob" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "newTagName" TEXT NOT NULL,
    "tagIds" INTEGER[],
    "status" "TagMergeJobStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagMergeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagMergeJob_userId_idx" ON "TagMergeJob"("userId");

-- CreateIndex
CREATE INDEX "TagMergeJob_status_idx" ON "TagMergeJob"("status");

-- AddForeignKey
ALTER TABLE "TagMergeJob" ADD CONSTRAINT "TagMergeJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
