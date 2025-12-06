# Tag Merge Candidate Selection

## Overview

The tag merge system uses AI to suggest intelligent tag merges. The candidate selection logic has been refactored to support **pluggable providers**, making it easy to experiment with different strategies for selecting which tags to analyze.

## Architecture

### Files

- **`getAiMergeCandidates.ts`**: Contains the pluggable provider interface and implementations
- **`getAiMergeSuggestions.ts`**: Main controller that uses providers to get candidates and calls AI for suggestions

### Core Types

```typescript
// Tag data returned by providers
export type TagCandidate = {
  id: number;
  name: string;
  linkCount: number;
};

// Provider function signature
export type TagCandidateProvider = (userId: number) => Promise<TagCandidate[]>;
```

## Available Providers

### 1. `topTagsByLinkCount` (Default)

Returns the top N tags sorted by usage (link count, descending).

**Rationale**: Focus on the most-used tags since they have the most impact when merged.

**Usage**:
```typescript
const candidates = await topTagsByLinkCount(userId, 300); // Returns top 300 tags
```

**Default limit**: 300 tags (to avoid overwhelming the AI)

### 2. `similarNameTags` (Not Yet Implemented)

Returns tags with similar names that are likely duplicates.

**Rationale**: Focus on obvious duplicates based on fuzzy matching.

**Planned features**:
- Levenshtein distance matching
- Soundex algorithm
- Case/pluralization variations

### 3. `lowUsageTags` (Not Yet Implemented)

Returns tags with very low usage (1-2 links).

**Rationale**: These are often too specific and good candidates for merging into broader categories.

## Using the Provider System

### Basic Usage (Default Provider)

The default provider is automatically used:

```typescript
import { getTagMergeCandidates } from './getAiMergeCandidates';

// Uses topTagsByLinkCount with limit=300 by default
const candidates = await getTagMergeCandidates(userId);
```

### Using a Different Provider

Pass a custom provider function:

```typescript
import { getTagMergeCandidates, topTagsByLinkCount } from './getAiMergeCandidates';

// Use top 500 instead of 300
const candidates = await getTagMergeCandidates(
  userId,
  (uid) => topTagsByLinkCount(uid, 500)
);
```

### Creating a Custom Provider

Implement the `TagCandidateProvider` type:

```typescript
import { TagCandidateProvider, TagCandidate } from './getAiMergeCandidates';
import { prisma } from '@linkwarden/prisma';

// Example: Get random sample of tags
export const randomTags: TagCandidateProvider = async (userId: number) => {
  const allTags = await prisma.tag.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      _count: { select: { links: true } }
    }
  });

  // Shuffle and take first 300
  const shuffled = allTags.sort(() => 0.5 - Math.random());

  return shuffled.slice(0, 300).map(tag => ({
    id: tag.id,
    name: tag.name,
    linkCount: tag._count.links
  }));
};

// Use it
const candidates = await getTagMergeCandidates(userId, randomTags);
```

### Combining Multiple Providers

You can create a provider that combines results from multiple strategies:

```typescript
export const combinedProvider: TagCandidateProvider = async (userId: number) => {
  // Get top 200 by usage
  const topTags = await topTagsByLinkCount(userId, 200);

  // Get low usage tags (when implemented)
  // const lowTags = await lowUsageTags(userId);

  // Combine and deduplicate by ID
  const combined = [...topTags /* , ...lowTags */];
  const unique = Array.from(
    new Map(combined.map(tag => [tag.id, tag])).values()
  );

  return unique.slice(0, 300); // Limit total
};
```

## Integration with AI Suggestions

The `getAiMergeSuggestions.ts` controller:

1. **Gets candidates** using the provider
2. **Validates** minimum tag count (≥10)
3. **Transforms** to AI-friendly format
4. **Calls AI** to generate merge suggestions
5. **Maps back** to tag IDs and URLs
6. **Updates** AI suggestion counts

```typescript
// In getAiMergeSuggestions.ts
const userTags: TagCandidate[] = await getTagMergeCandidates(userId);

// Rest of the AI logic...
```

## Future Enhancements

### Similarity-Based Provider

```typescript
export const similarNameTags = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get all tags
  // 2. Group by similarity (Levenshtein distance, soundex, etc.)
  // 3. Return tags that have similar names
  // 4. Focus on likely duplicates
};
```

### Smart Hybrid Provider

```typescript
export const smartHybridProvider = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get top 150 by usage (high impact)
  // 2. Get 100 similar name clusters (likely duplicates)
  // 3. Get 50 low-usage tags (cleanup candidates)
  // 4. Combine intelligently
};
```

### AI-Powered Pre-filtering

```typescript
export const aiFilteredProvider = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get broader set (e.g., 1000 tags)
  // 2. Use lightweight AI to pre-filter to most promising candidates
  // 3. Return top 300 most likely to benefit from merging
};
```

## Testing Different Providers

To test a new provider:

1. Implement it in `getAiMergeCandidates.ts`
2. Temporarily modify `getAiMergeSuggestions.ts`:
   ```typescript
   const userTags = await getTagMergeCandidates(userId, yourNewProvider);
   ```
3. Test via the API endpoint
4. Compare results with the default provider
5. If better, make it the default or add configuration

## Configuration

Future: Add environment variable to select provider:

```env
TAG_MERGE_PROVIDER=topByUsage     # Default
TAG_MERGE_PROVIDER=similarNames   # Focus on duplicates
TAG_MERGE_PROVIDER=lowUsage       # Focus on cleanup
TAG_MERGE_PROVIDER=smart          # Hybrid approach
```

Then in code:
```typescript
const getConfiguredProvider = (): TagCandidateProvider => {
  switch (process.env.TAG_MERGE_PROVIDER) {
    case 'similarNames': return similarNameTags;
    case 'lowUsage': return lowUsageTags;
    default: return (uid) => topTagsByLinkCount(uid, 300);
  }
};

const candidates = await getTagMergeCandidates(userId, getConfiguredProvider());
```
