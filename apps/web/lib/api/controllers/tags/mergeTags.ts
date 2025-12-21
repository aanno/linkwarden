import {
  MergeTagsSchema,
  MergeTagsSchemaType,
} from "@linkwarden/lib/schemaValidation";
import { performTagMerge } from "@linkwarden/lib";

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
