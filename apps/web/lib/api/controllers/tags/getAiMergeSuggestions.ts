import { prisma } from "@linkwarden/prisma";
import { generateObject, LanguageModel } from "ai";
import {
  createOpenAICompatible,
  OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { perplexity } from "@ai-sdk/perplexity";
import { azure } from "@ai-sdk/azure";
import { z } from "zod";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ai-sdk-ollama";
import { getTagMergeCandidates, TagCandidate, combinedProvider } from "./getAiMergeCandidates";

// Function to concat /api with the base URL properly
const ensureValidURL = (base: string, path: string) =>
  `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

const getAIModel = (): LanguageModel => {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    let config: OpenAICompatibleProviderSettings = {
      baseURL:
        process.env.CUSTOM_OPENAI_BASE_URL || "https://api.openai.com/v1",
      name: process.env.CUSTOM_OPENAI_NAME || "openai",
      apiKey: process.env.OPENAI_API_KEY,
    };

    const openaiCompatibleModel = createOpenAICompatible(config);

    return openaiCompatibleModel(process.env.OPENAI_MODEL);
  }
  if (
    process.env.AZURE_API_KEY &&
    process.env.AZURE_RESOURCE_NAME &&
    process.env.AZURE_MODEL
  )
    return azure(process.env.AZURE_MODEL);
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL)
    return anthropic(process.env.ANTHROPIC_MODEL);
  if (process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL && process.env.OLLAMA_MODEL) {
    const ollamaChat = createOllama({
        baseURL: process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL,
    });
    return ollamaChat(process.env.OLLAMA_MODEL, {
        structuredOutputs: true,
    });
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL) {
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    return openrouter(process.env.OPENROUTER_MODEL) as LanguageModel;
  }
  if (process.env.PERPLEXITY_API_KEY) {
    return perplexity(process.env.PERPLEXITY_MODEL || "sonar-pro");
  }
  throw new Error("No AI provider configured");
};

type TagData = { name: string; linkCount: number };

const tagMergeSuggestionsPrompt = (tags: TagData[]) => `
You are analyzing a bookmark manager's tags to suggest intelligent merge operations.

Current tags (sorted by usage, showing top tags):
${tags.map((t) => `- "${t.name}" (${t.linkCount} links)`).join("\n")}

Quality Rules for Tags:
1. English Only: Translate non-English tags (German, Chinese, etc.) to English
2. Single-Link Limit: Tags with only 1 link should be rare (≤5% of total)
3. Use Decades: Convert specific years (2025, 1995) to decades (2020s, 1990s)
4. Avoid Redundancy: Merge obvious duplicates and variations
5. Subcategories OK: Specific + general tags together are acceptable (e.g., "Programming" + "JavaScript")
6. Context Clarity: Tags should explain what domain a link belongs to

Merge Suggestions to Make:
- Case variations: "AI" and "ai" → "AI"
- Plurals: "Course" and "Courses" → "Courses"
- Abbreviations: "AI" and "Artificial Intelligence" → "AI"
- Common suffixes: "Network" and "Networking" → "Networking"
- Language variations: "Übersetzung" → "Translation"
- Low-value single-link tags: Consider removing if too specific

Return 5-50 merge suggestions wrapped in a JSON object with key "suggestions". Each suggestion should merge 2-8 tags. NEVER put more than 8 tags in a single suggestion — make multiple focused suggestions instead of one large catch-all.

IMPORTANT: Return ONLY valid JSON, no markdown, no code blocks, no explanation.

Format:
{
  "suggestions": [
    {
      "newName": "AI",
      "tags": ["ai", "Artificial Intelligence"],
      "reason": "Case variation and abbreviation merge"
    },
    {
      "newName": "Courses",
      "tags": ["Course", "course"],
      "reason": "Plural and case variation merge"
    }
  ]
}

Merge suggestions:`;

const MergeSuggestionSchema = z.object({
  newName: z.string(),
  tags: z.array(z.string()).min(2).max(10),
  reason: z.string(),
});

const MergeSuggestionsResponseSchema = z.object({
  suggestions: z.array(MergeSuggestionSchema),
});

export default async function getAiMergeSuggestions(userId: number) {
  try {
    // Check if AI is configured
    try {
      getAIModel();
    } catch (err) {
      return {
        response: "AI provider not configured. Please configure an AI provider in environment variables.",
        status: 503,
      };
    }

    // Fetch tag merge candidates using the combined provider
    // This uses: 150 byAiSuggestionCountCapped + 150 byMedianDifference + 150 uniformLowUsage
    // Deduplicates by tag ID for unique results
    const userTags: TagCandidate[] = await getTagMergeCandidates(userId, combinedProvider);

    if (userTags.length < 10) {
      return {
        response: "Not enough tags to generate merge suggestions. You need at least 10 tags.",
        status: 400,
      };
    }

    // Transform to TagData format for the AI prompt
    const tagData: TagData[] = userTags.map((tag) => ({
      name: tag.name,
      linkCount: tag.linkCount,
    }));

    // Call AI with the prompt
    const { object } = await generateObject({
      model: getAIModel(),
      prompt: tagMergeSuggestionsPrompt(tagData),
      schema: MergeSuggestionsResponseSchema,
      maxTokens: 4000,
    });

    // Map tag names back to IDs and add URLs
    const suggestions = object.suggestions
      .filter((suggestion) => {
        // Filter out suggestions with invalid schema (e.g., newNameName instead of newName)
        // This prevents one bad suggestion from breaking the entire response
        if (!suggestion.newName || typeof suggestion.newName !== 'string') {
          console.warn('Skipping suggestion with invalid newName:', suggestion);
          return false;
        }
        if (!suggestion.tags || !Array.isArray(suggestion.tags)) {
          console.warn('Skipping suggestion with invalid tags:', suggestion);
          return false;
        }
        if (!suggestion.reason || typeof suggestion.reason !== 'string') {
          console.warn('Skipping suggestion with invalid reason:', suggestion);
          return false;
        }
        return true;
      })
      .map((suggestion) => {
        const tagDetails = suggestion.tags.map((tagName) => {
          const tag = userTags.find((t) => t.name === tagName);
          if (!tag) {
            return null;
          }
          return {
            id: tag.id,
            name: tag.name,
            linkCount: tag.linkCount,
            url: `/tags/${tag.id}`,
          };
        }).filter(Boolean); // Remove nulls (tags that weren't found)

        // Only include suggestions where we found at least 2 tags
        if (tagDetails.length < 2) {
          return null;
        }

        // Generate stable ID based on sorted tag IDs
        // This ensures the same suggestion always has the same ID, even if array order changes
        const suggestionId = tagDetails
          .map(t => t?.id ?? 0)
          .sort((a, b) => a - b)
          .join('-');

        return {
          id: suggestionId,
          newName: suggestion.newName,
          tags: tagDetails,
          reason: suggestion.reason,
        };
      })
      .filter(Boolean); // Remove null suggestions

    // Increment ai_suggestion_count for all tags that appear in suggestions
    // Note: Some tags may have been merged/deleted since candidate selection
    // We handle this gracefully in the merge operation itself
    const tagIdsInSuggestions = new Set<number>();
    (suggestions as Array<NonNullable<typeof suggestions[number]>>).forEach((suggestion) => {
      suggestion.tags.forEach((tag) => {
        if (tag) {
          tagIdsInSuggestions.add(tag.id);
        }
      });
    });

    if (tagIdsInSuggestions.size > 0) {
      // Increment counts - tags that don't exist anymore will be silently skipped by the WHERE clause
      await prisma.$executeRaw`
        UPDATE "Tag"
        SET "aiSuggestionCount" = "aiSuggestionCount" + 1
        WHERE "id" = ANY(${Array.from(tagIdsInSuggestions)}::int[])
          AND "ownerId" = ${userId}
      `;
    }

    return {
      response: { suggestions },
      status: 200,
    };
  } catch (err) {
    console.error("Error generating AI merge suggestions:", err);
    return {
      response: `Error generating merge suggestions: ${err instanceof Error ? err.message : "Unknown error"}`,
      status: 500,
    };
  }
}
