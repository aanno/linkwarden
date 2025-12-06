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

### 1. `combinedProvider` ✅ **Default (Currently Active)**

Combines three strategies for comprehensive coverage with automatic deduplication.

**Mix**:
- 150 tags from `byAiSuggestionCountCapped` (variety + continuity)
- 150 tags from `byMedianDifference` (quality sweet spot)
- 150 tags from `uniformLowUsage` (cleanup overly specific tags)

**Rationale**: Provides diverse suggestions covering continuity, quality, and cleanup in a single run. Deduplicates by tag ID to avoid repetition.

**Usage**:
```typescript
const candidates = await combinedProvider(userId); // Returns up to 450 unique tags
```

**Returns**: Up to 450 tags (less after deduplication)

### 2. `topTagsByLinkCount`

Returns the top N tags sorted by usage (link count, descending).

**Rationale**: Focus on the most-used tags since they have the most impact when merged.

**Usage**:
```typescript
const candidates = await topTagsByLinkCount(userId, 300); // Returns top 300 tags
```

**Default limit**: 300 tags (to avoid overwhelming the AI)

### 3. `byAiSuggestionCount` ✅ **Implemented**

Selects tags weighted by `aiSuggestionCount` using probabilistic sampling.

**Rationale**: This basically resuggests tags that have been suggested before. It serves as memory and provides a 'continuation' that will ease the mind of humans - you can progressively work through tags you've already seen suggested, creating a consistent workflow.

**Algorithm**: Uses weighted random sampling formula: `ORDER BY -LN(RANDOM()) / aiSuggestionCount`

**Usage**:
```typescript
const candidates = await byAiSuggestionCount(userId, 300);
```

**Notes**: Only selects tags where `aiSuggestionCount > 0`

### 4. `byAiSuggestionCountCapped` ✅ **Implemented**

Same as `byAiSuggestionCount` but with a maximum weight cap.

**Rationale**: Same as Provider 2, but avoids over-preferring tags we have suggested many times before. Without this cap, humans might become bored seeing the same suggestions repeatedly. This adds variety while maintaining continuity.

**Algorithm**: Uses capped weight: `LEAST(aiSuggestionCount, maxWeight)`

**Usage**:
```typescript
// Cap weight at 10 (default)
const candidates = await byAiSuggestionCountCapped(userId, 300, 10);
```

**Parameters**:
- `userId`: User ID
- `limit`: Number of tags to select (default: 300)
- `maxWeight`: Maximum weight cap (default: 10)

### 5. `byMedianDifference` ✅ **Implemented**

Selects tags weighted by their distance from the median `aiSuggestionCount`.

**Rationale**: A good tag is one that doesn't fit all your links (which would be too general), but isn't only used for a few links either (which would be too specific). We prefer tags more toward the 'middle' - the goldilocks zone of tag utility.

**Algorithm**:
1. Calculates median `aiSuggestionCount` in separate query
2. Weights by inverse distance: `1.0 / (1.0 + ABS(aiSuggestionCount - median))`
3. No transaction used for performance

**Usage**:
```typescript
const candidates = await byMedianDifference(userId, 300);
```

**Notes**: Good for finding tags in the quality sweet spot

### 6. `uniformLowUsage` ✅ **Implemented**

Uniformly selects random tags that have exactly 1 link.

**Rationale**: Suggests tags that are too specific now. The hope is these tags will fit into one of the more general tags, reducing clutter and improving tag consistency.

**Algorithm**: Simple uniform random sampling: `ORDER BY RANDOM()`

**Usage**:
```typescript
const candidates = await uniformLowUsage(userId, 300);
```

**Notes**: Only returns tags with exactly 1 link (linkCount = 1)

### 7. `similarNameTags` (Not Yet Implemented)

Returns tags with similar names that are likely duplicates.

**Rationale**: Focus on obvious duplicates based on fuzzy matching.

**Planned features**:
- Levenshtein distance matching
- Soundex algorithm
- Case/pluralization variations

## Using the Provider System

### Basic Usage (Default Provider)

The default provider is now `combinedProvider`:

```typescript
import { getTagMergeCandidates, combinedProvider } from './getAiMergeCandidates';

// Uses combinedProvider by default (150 capped + 150 median + 150 low usage)
const candidates = await getTagMergeCandidates(userId, combinedProvider);
```

### Using a Different Provider

Pass a custom provider function:

```typescript
import {
  getTagMergeCandidates,
  topTagsByLinkCount,
  byAiSuggestionCount,
  byAiSuggestionCountCapped,
  byMedianDifference,
  uniformLowUsage
} from './getAiMergeCandidates';

// Use top 500 instead of 300
const candidates = await getTagMergeCandidates(
  userId,
  (uid) => topTagsByLinkCount(uid, 500)
);

// Use AI suggestion count weighted sampling
const candidates = await getTagMergeCandidates(
  userId,
  byAiSuggestionCount
);

// Use capped AI suggestion count (max weight = 15)
const candidates = await getTagMergeCandidates(
  userId,
  (uid) => byAiSuggestionCountCapped(uid, 300, 15)
);

// Use median-based selection
const candidates = await getTagMergeCandidates(
  userId,
  byMedianDifference
);

// Focus on single-link tags for cleanup
const candidates = await getTagMergeCandidates(
  userId,
  uniformLowUsage
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

### Combining Multiple Providers ✅ **Now Active**

The `combinedProvider` is now implemented and active by default:

```typescript
export const combinedProvider: TagCandidateProvider = async (userId: number) => {
  // Fetch from all three providers in parallel
  const [cappedTags, medianTags, lowUsageTags] = await Promise.all([
    byAiSuggestionCountCapped(userId, 150, 10),
    byMedianDifference(userId, 150),
    uniformLowUsage(userId, 150),
  ]);

  // Use Map for deduplication by tag ID (keeps first occurrence)
  const uniqueTagsMap = new Map<number, TagCandidate>();

  [...cappedTags, ...medianTags, ...lowUsageTags].forEach((tag) => {
    if (!uniqueTagsMap.has(tag.id)) {
      uniqueTagsMap.set(tag.id, tag);
    }
  });

  return Array.from(uniqueTagsMap.values());
};
```

**Location**: `apps/web/lib/api/controllers/tags/getAiMergeCandidates.ts:250`

## When to Use Which Provider

### Decision Guide

| Use Case | Recommended Provider | Why |
|----------|---------------------|-----|
| **Default / Comprehensive** | `combinedProvider` ✅ | Mix of continuity, quality, and cleanup in one run |
| **High-impact tags only** | `topTagsByLinkCount` | Focuses on most-used tags |
| **Continue where left off** | `byAiSuggestionCount` | Resuggests previously seen tags for workflow continuity |
| **Avoid boredom** | `byAiSuggestionCountCapped` | Adds variety while maintaining continuity |
| **Find quality sweet spot** | `byMedianDifference` | Targets tags that are neither too general nor too specific |
| **Cleanup overly specific** | `uniformLowUsage` | Merges single-use tags into more general ones |

### Example Workflow

**Option 1: Comprehensive (Recommended)**
- Use `combinedProvider` for all sessions - it covers continuity, quality, and cleanup automatically

**Option 2: Focused Sessions**
1. **First session**: Use `topTagsByLinkCount` to get baseline suggestions on high-impact tags
2. **Follow-up sessions**: Use `byAiSuggestionCount` or `byAiSuggestionCountCapped` to continue working through previously suggested tags
3. **Cleanup session**: Use `uniformLowUsage` to merge overly specific single-use tags
4. **Quality session**: Use `byMedianDifference` to find tags in the goldilocks zone

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

### Similarity-Based Provider (Planned)

```typescript
export const similarNameTags = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get all tags
  // 2. Group by similarity (Levenshtein distance, soundex, etc.)
  // 3. Return tags that have similar names
  // 4. Focus on likely duplicates
  // Use cases: Find "AI" vs "ai", "JavaScript" vs "Javascript", etc.
};
```

### Smart Hybrid Provider (Planned)

```typescript
export const smartHybridProvider = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get top 150 by aiSuggestionCount (repeatedly problematic)
  // 2. Get 100 similar name clusters (likely duplicates)
  // 3. Get 50 single-link tags (cleanup candidates)
  // 4. Combine intelligently with deduplication
};
```

### AI-Powered Pre-filtering (Planned)

```typescript
export const aiFilteredProvider = async (userId: number): Promise<TagCandidate[]> => {
  // 1. Get broader set (e.g., 1000 tags)
  // 2. Use lightweight AI to pre-filter to most promising candidates
  // 3. Return top 300 most likely to benefit from merging
  // Could use embedding similarity, pattern matching, etc.
};
```

### Time-Based Provider (Planned)

```typescript
export const recentlyAddedTags = async (userId: number): Promise<TagCandidate[]> => {
  // Focus on recently created tags that might need cleanup
  // Useful for catching mistakes early
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

### Environment-Based Provider Selection (Planned)

Future: Add environment variable to select provider:

```env
TAG_MERGE_PROVIDER=topByUsage          # Default: Most-used tags
TAG_MERGE_PROVIDER=aiSuggestionCount   # Weighted by AI suggestion count
TAG_MERGE_PROVIDER=aiSuggestionCapped  # Capped AI suggestion count
TAG_MERGE_PROVIDER=medianDifference    # Distance from median
TAG_MERGE_PROVIDER=uniformLowUsage     # Single-link tags only
TAG_MERGE_PROVIDER=combined            # Hybrid approach
```

Then in code:
```typescript
const getConfiguredProvider = (): TagCandidateProvider => {
  switch (process.env.TAG_MERGE_PROVIDER) {
    case 'aiSuggestionCount': return byAiSuggestionCount;
    case 'aiSuggestionCapped': return (uid) => byAiSuggestionCountCapped(uid, 300, 10);
    case 'medianDifference': return byMedianDifference;
    case 'uniformLowUsage': return uniformLowUsage;
    case 'combined': return combinedProvider;
    default: return (uid) => topTagsByLinkCount(uid, 300);
  }
};

const candidates = await getTagMergeCandidates(userId, getConfiguredProvider());
```

### Per-Request Provider Selection (Current)

Currently, you can change the provider by modifying `getAiMergeSuggestions.ts`:

```typescript
// Change this line:
const userTags: TagCandidate[] = await getTagMergeCandidates(userId);

// To this (example):
const userTags: TagCandidate[] = await getTagMergeCandidates(
  userId,
  byAiSuggestionCount
);
```
