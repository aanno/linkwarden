# AI Merge Tags API Documentation

**Date:** 2025-01-15
**Version:** 2.1
**Last Updated:** 2026-03-15
**Status:** Fully Enhanced ✅

## Overview

The AI Merge Tags API provides intelligent tag merge suggestions and background processing for tag consolidation. It leverages Linkwarden's existing AI/LLM infrastructure (same as auto-tagging) to analyze tags and suggest optimal merge operations based on quality rules.

**Version 2.0 Enhancements:**
- Per-tag selection within merge suggestions (frontend only)
- Custom new tag name selection via star icons (frontend only)
- `aiSuggestionCount` tracking for analytics
- Shared `performTagMerge()` function in `@linkwarden/lib`
- Robust duplicate job handling with upsert logic
- Optimistic UI updates on submission

**Version 2.1 Changes:**
- AI suggestions still require 2+ tags, but users may now submit a single-tag operation as a **rename** (deselect all but one tag in the UI)
- `generateObject` switched from `output: "array"` to `output: "object"` with `{ suggestions: [...] }` wrapper schema for compatibility with models that don't support structured outputs / `responseFormat`
- `QueueAiMergesSchema.tagIds` minimum changed from 2 → 1 to allow single-tag rename
- Backend filter in `queueAiMerges.ts` updated from `>= 2` → `>= 1` accordingly

## Endpoints

### GET /api/v1/tags/ai_merge

Generate AI-powered tag merge suggestions.

#### Authentication

Required. Uses standard Linkwarden session authentication.

#### Request

```bash
GET /api/v1/tags/ai_merge HTTP/1.1
Host: your-linkwarden-instance.com
Cookie: next-auth.session-token=...
```

#### Response

**Success (200 OK)**

```json
{
  "response": {
    "suggestions": [
      {
        "newName": "AI",
        "tags": [
          {
            "id": 123,
            "name": "ai",
            "linkCount": 15,
            "url": "/tags/123"
          },
          {
            "id": 456,
            "name": "Artificial Intelligence",
            "linkCount": 8,
            "url": "/tags/456"
          }
        ],
        "reason": "Case variation and abbreviation merge"
      },
      {
        "newName": "Courses",
        "tags": [
          {
            "id": 789,
            "name": "Course",
            "linkCount": 5,
            "url": "/tags/789"
          },
          {
            "id": 234,
            "name": "course",
            "linkCount": 2,
            "url": "/tags/234"
          }
        ],
        "reason": "Plural and case variation merge"
      }
    ]
  }
}
```

**Error Responses**

- **400 Bad Request** - Not enough tags (minimum 10 required)
  ```json
  {
    "response": "Not enough tags to generate merge suggestions. You need at least 10 tags."
  }
  ```

- **503 Service Unavailable** - AI provider not configured
  ```json
  {
    "response": "AI provider not configured. Please configure an AI provider in environment variables."
  }
  ```

- **500 Internal Server Error** - AI generation failed
  ```json
  {
    "response": "Error generating merge suggestions: [error details]"
  }
  ```

#### Implementation Details

**Controller:** `apps/web/lib/api/controllers/tags/getAiMergeSuggestions.ts`

**Process Flow:**
1. Validates AI provider is configured (`getAIModel()`)
2. Fetches top 300 user tags sorted by link count (descending)
3. Constructs AI prompt with tag data and quality rules
4. Calls AI using Vercel AI SDK's `generateObject()` — uses `output: "object"` with `MergeSuggestionsResponseSchema` (`{ suggestions: [...] }` wrapper) for compatibility with models that don't support `responseFormat` / structured outputs
5. Maps tag names back to IDs and URLs
6. Filters out invalid suggestions (tags not found, or fewer than 2 resolved tags — AI suggestions always require 2+)
7. **NEW:** Increments `aiSuggestionCount` for all tags appearing in suggestions (bulk update)
8. Returns 5-50 suggestions

**Quality Rules Applied:**
1. English Only - Translate non-English tags
2. Single-Link Limit - Identify tags with only 1 link (≤5% target)
3. Use Decades - Convert specific years to decade ranges
4. Avoid Redundancy - Merge duplicates and variations
5. Subcategories OK - Allow specific + general tags
6. Context Clarity - Ensure tags explain link domain

**AI Provider Support:**
- OpenAI (including custom compatible endpoints)
- Azure OpenAI
- Anthropic Claude
- Ollama (local models)
- OpenRouter
- Perplexity

---

### PATCH /api/v1/tags/ai_merge

Queue selected merge operations for background processing.

#### Authentication

Required. Uses standard Linkwarden session authentication.

#### Request

```bash
PATCH /api/v1/tags/ai_merge HTTP/1.1
Host: your-linkwarden-instance.com
Content-Type: application/json
Cookie: next-auth.session-token=...

{
  "merges": [
    {
      "newTagName": "AI",
      "tagIds": [123, 456]
    },
    {
      "newTagName": "Courses",
      "tagIds": [789, 234, 567]
    }
  ]
}
```

#### Request Schema

```typescript
{
  merges: Array<{
    newTagName: string;     // Max 50 characters, trimmed
    tagIds: number[];       // Minimum 1 tag (1 = rename, 2+ = merge)
  }>;                       // 1-100 merge operations allowed
}
```

**Validation:**
- `merges` array: 1-100 items
- Each merge must have at least 1 `tagId` — **1 tag = rename** (the tag is deleted and recreated with the new name); 2+ tags = merge
- `newTagName` max length: 50 characters
- All tags must exist and belong to the authenticated user

> **Note:** AI-generated suggestions always contain 2+ tags. The single-tag case arises when the user deselects all but one tag in the UI, effectively using the AI merge page as a convenient rename tool.

#### Response

**Success (200 OK)**

```json
{
  "response": {
    "message": "Successfully queued 2 merge operations",
    "jobsCreated": 2
  }
}
```

**Error Responses**

- **400 Bad Request** - Validation failed
  ```json
  {
    "response": "Error: Array must contain at least 1 element(s) [merges.0.tagIds]"
  }
  ```

- **403 Forbidden** - Tags don't belong to user
  ```json
  {
    "response": "Error: Some tags do not exist or do not belong to you"
  }
  ```

- **500 Internal Server Error** - Database error
  ```json
  {
    "response": "Error queueing merge jobs: [error details]"
  }
  ```

#### Implementation Details

**Controller:** `apps/web/lib/api/controllers/tags/queueAiMerges.ts`

**Process Flow:**
1. Validates request schema using Zod
2. Extracts all tag IDs from merge operations
3. Verifies all tags exist and belong to the user
4. Creates `TagMergeJob` records with `PENDING` status
5. Returns immediately (background worker processes jobs)

**Database Schema:**
```prisma
model TagMergeJob {
  id          Int                @id @default(autoincrement())
  userId      Int
  newTagName  String
  tagIds      Int[]
  status      TagMergeJobStatus  @default(PENDING)
  error       String?
  createdAt   DateTime           @default(now())
  completedAt DateTime?
}

enum TagMergeJobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}
```

---

## Background Processing

### Worker

**File:** `apps/worker/workers/tagMergeProcessing.ts`

**Process:**
1. Runs in continuous loop (default 10s interval)
2. Fetches up to 5 `PENDING` jobs (batch size configurable via `TAG_MERGE_BATCH_SIZE`)
3. For each job:
   - Marks as `PROCESSING`
   - **NEW:** Fetches and sums `aiSuggestionCount` from tags to be merged
   - Calls shared `performTagMerge()` from `@linkwarden/lib` with summed count
   - Marks as `COMPLETED` or `FAILED`
4. Logs progress and remaining job count

**Shared Function Architecture:**
- Worker imports `performTagMerge` from `@linkwarden/lib` (not from apps/web)
- Same merge logic used by manual API and worker
- Ensures consistency and follows monorepo best practices
- Function handles: duplicate jobs, existing tags, upsert logic

**Environment Variables:**
- `TAG_MERGE_BATCH_SIZE` - Number of jobs to process per batch (default: 5)
- `ARCHIVE_SCRIPT_INTERVAL` - Worker interval in seconds (default: 10)

**Error Handling:**
- Catches and logs errors per job
- Updates job status to `FAILED` with error message
- Continues processing remaining jobs in batch
- Waits longer interval on worker-level errors

---

## Frontend Integration

### React Hooks

**File:** `packages/router/tags.tsx`

#### useAiMergeSuggestions()

```typescript
const { data, isLoading, error, refetch } = useAiMergeSuggestions();

// data shape:
{
  suggestions: Array<{
    newName: string;
    tags: Array<{
      id: number;
      name: string;
      linkCount: number;
      url: string;
    }>;
    reason: string;
  }>;
}
```

**Features:**
- Cached for 5 minutes (`staleTime: 5 * 60 * 1000`)
- Only runs when authenticated
- Query key: `["ai-merge-suggestions"]`

#### useSubmitAiMerges()

```typescript
const submitMerges = useSubmitAiMerges();

await submitMerges.mutateAsync({
  merges: [
    { newTagName: "AI", tagIds: [123, 456] }
  ]
});
```

**Features:**
- Invalidates `tags-paginated`, `links`, and `ai-merge-suggestions` on success
- Returns mutation state (`isPending`, `isError`, etc.)

### UI Component

**File:** `apps/web/pages/settings/ai-merge-tags.tsx`

**Features:**
- Displays merge suggestions with checkboxes
- Select/deselect all functionality
- Shows total link counts per merge
- Visual feedback for selection state
- Refresh button to regenerate suggestions
- Loading and error states
- Success toast notifications

**Path:** `/settings/ai-merge-tags`

---

## Examples

### Example 1: Fetch Suggestions

```bash
curl -X GET https://your-instance.com/api/v1/tags/ai_merge \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN"
```

### Example 2: Submit Merges (TypeScript)

```typescript
const submitMerges = async (selectedSuggestions: number[]) => {
  const mergesToSubmit = selectedSuggestions.map(index => ({
    newTagName: suggestions[index].newName,
    tagIds: suggestions[index].tags.map(t => t.id),
  }));

  const response = await fetch('/api/v1/tags/ai_merge', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merges: mergesToSubmit }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.response);
  }

  return response.json();
};
```

### Example 3: React Component

```tsx
import { useAiMergeSuggestions, useSubmitAiMerges } from "@linkwarden/router/tags";

function AiMerge() {
  const { data, isLoading, error } = useAiMergeSuggestions();
  const submitMerges = useSubmitAiMerges();
  const [selected, setSelected] = useState<number[]>([]);

  const handleSubmit = async () => {
    const mergesToSubmit = selected.map(index => ({
      newTagName: data.suggestions[index].newName,
      tagIds: data.suggestions[index].tags.map(t => t.id),
    }));

    await submitMerges.mutateAsync({ merges: mergesToSubmit });
  };

  return (
    <div>
      {data?.suggestions.map((suggestion, i) => (
        <div key={i}>
          <input
            type="checkbox"
            checked={selected.includes(i)}
            onChange={() => setSelected(prev =>
              prev.includes(i)
                ? prev.filter(x => x !== i)
                : [...prev, i]
            )}
          />
          {suggestion.newName} ← {suggestion.tags.map(t => t.name).join(', ')}
        </div>
      ))}
      <button onClick={handleSubmit}>Merge Selected</button>
    </div>
  );
}
```

---

## Testing

### Manual Testing

1. **Generate Suggestions:**
   ```bash
   # Check if AI is configured
   echo $OPENAI_API_KEY

   # Visit UI
   open http://localhost:3003/settings/ai-merge-tags
   ```

2. **Monitor Background Jobs:**
   ```bash
   # Watch worker logs
   cd apps/worker
   yarn dev

   # Check database
   psql $DATABASE_URL -c "SELECT * FROM \"TagMergeJob\" ORDER BY \"createdAt\" DESC LIMIT 10;"
   ```

3. **Verify Merge Results:**
   ```bash
   # Check tag count before/after
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Tag\";"
   ```

### Automated Testing

```typescript
// Test AI suggestions endpoint
describe('GET /api/v1/tags/ai_merge', () => {
  it('returns suggestions when user has enough tags', async () => {
    const response = await fetch('/api/v1/tags/ai_merge', {
      headers: { Cookie: sessionCookie }
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.response.suggestions).toBeInstanceOf(Array);
  });
});

// Test queue endpoint
describe('PATCH /api/v1/tags/ai_merge', () => {
  it('queues merge jobs', async () => {
    const response = await fetch('/api/v1/tags/ai_merge', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({
        merges: [{ newTagName: 'Test', tagIds: [1, 2] }]
      })
    });
    expect(response.status).toBe(200);
  });
});
```

---

## Performance Considerations

### Suggestions Generation
- **Tag Limit:** Processes top 300 tags to avoid overwhelming AI
- **Caching:** Frontend caches for 5 minutes
- **Token Usage:** ~2000-5000 tokens per request (varies by AI provider)

### Background Processing
- **Batch Size:** 5 jobs per iteration (configurable)
- **Interval:** 10 seconds between batches
- **Atomicity:** Each merge uses database transaction
- **Search Index:** Invalidated per merge (re-indexed by separate worker)

### Scalability
- **Concurrent Users:** Background worker handles queue sequentially
- **Large Merges:** No timeout issues (processes async)
- **Retries:** Failed jobs stay in `FAILED` state (manual review needed)

---

## Security

### Authentication
- All endpoints require valid session
- Tag ownership validated before merge

### Authorization
- Users can only merge their own tags
- Tags verified to belong to user before queueing

### Input Validation
- Zod schema validation on all inputs
- Tag ID arrays checked for existence
- Maximum limits enforced (100 operations, 50 char tag names)

---

## Troubleshooting

### "AI provider not configured"
**Solution:** Set environment variables for at least one AI provider:
```bash
export OPENAI_API_KEY=your-key
export OPENAI_MODEL=gpt-4
```

### "Not enough tags to generate merge suggestions"
**Solution:** You need at least 10 tags. Create more tags or use manual merge.

### Merges not processing
**Solution:** Check worker is running:
```bash
cd apps/worker
yarn dev
```

### Merge job stuck in PROCESSING
**Solution:** Check worker logs for errors. Manually reset in database:
```sql
UPDATE "TagMergeJob" SET status = 'PENDING' WHERE id = YOUR_JOB_ID;
```

---

## Migration Notes

### Database Migration

Run after pulling changes:
```bash
cd packages/prisma
npx prisma migrate dev
npx prisma generate
```

Migration creates:
- `TagMergeJob` table
- `TagMergeJobStatus` enum
- Indexes on `userId` and `status`

### Backward Compatibility

- Existing manual merge functionality (`PUT /api/v1/tags/merge`) unchanged
- New endpoints are additive only
- No breaking changes to existing APIs

---

## Future Enhancements

### Potential Improvements
1. **Configurable AI Prompts** - Allow users to customize merge criteria
2. **Merge History** - Track completed merges for audit trail
3. **Undo Functionality** - Reverse merge operations
4. **Merge Preview** - Show affected links before committing
5. **Scheduled Merges** - Auto-run suggestions on schedule
6. **Notification System** - Alert when background merges complete
7. **Batch Status Endpoint** - Track merge job progress
8. **Custom Rules** - User-defined merge patterns

---

## Related Documentation

- Tag Merge (Manual): `/doc/claude/merge-tags.md`
- Tags Pagination: `/doc/claude/tags-pagination.md`
- Get Tags API: `/doc/api/get-tags.md`
- Instructions: `/doc/instructions/ai-merge-tags.md`
