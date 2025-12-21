# Merge Tags API Documentation

## Overview

The Merge Tags API allows users to consolidate multiple tags into a single tag. This endpoint deletes the selected tags and creates a new tag with all links from the merged tags assigned to it. This is particularly useful for cleaning up duplicate tags, consolidating similar tags, or reorganizing tag taxonomies.

**Endpoint:** `PUT /api/v1/tags/merge`

**Controller:** `apps/web/lib/api/controllers/tags/mergeTags.ts`

**API Route:** `apps/web/pages/api/v1/tags/merge.ts`

**UI Component:** `apps/web/components/ModalContent/MergeTagsModal.tsx`

## Implementation Details

### Request Flow

1. **Client sends PUT request** with `tagIds` array and `newTagName`
2. **Schema validation** using Zod (`MergeTagsSchema`)
3. **Permission check** - Only tags owned by the authenticated user can be merged
4. **Database transaction**:
   - Find all links associated with the tags to be merged
   - Delete the old tags
   - Create new tag with the specified name
   - Connect all affected links to the new tag
   - Invalidate search index for affected links
5. **Return new tag** with 200 status

### Key Design Decisions

1. **Atomic Transaction**: All operations happen in a Prisma transaction to ensure data consistency
2. **Permission Scoped**: Users can only merge their own tags (checked via `ownerId`)
3. **Link Preservation**: All links from merged tags are preserved and connected to the new tag
4. **Search Index Invalidation**: Affected links have `indexVersion` set to `null` to trigger re-indexing
5. **Demo Mode Protection**: Merge operations are blocked in read-only demo mode

### Schema Validation

The request body is validated using `MergeTagsSchema` from `packages/lib/schemaValidation.ts`:

```typescript
export const MergeTagsSchema = z.object({
  newTagName: z.string().trim().max(50),
  tagIds: z.array(z.number()).min(1),
});

export type MergeTagsSchemaType = z.infer<typeof MergeTagsSchema>;
```

**Validation Rules:**
- `newTagName`: Required string, trimmed, maximum 50 characters
- `tagIds`: Required array of numbers, minimum 1 tag required

## API Usage

### Authentication

**Required.** This endpoint requires authentication via:
- Session cookie (browser)
- API key (Bearer token)

### Request

**Method:** `PUT`

**URL:** `/api/v1/tags/merge`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Body:**
```json
{
  "tagIds": [12, 45, 67],
  "newTagName": "JavaScript"
}
```

### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tagIds` | number[] | Yes | Array of tag IDs to merge (minimum 1) |
| `newTagName` | string | Yes | Name for the new merged tag (max 50 chars, trimmed) |

### Response

#### Success Response (200 OK)

```json
{
  "response": {
    "id": 123,
    "name": "JavaScript",
    "ownerId": 42,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | ID of the newly created tag |
| `name` | string | Name of the new tag |
| `ownerId` | number | ID of the user who owns the tag |
| `createdAt` | string | ISO 8601 timestamp when tag was created |
| `updatedAt` | string | ISO 8601 timestamp when tag was last updated |

#### Error Responses

**400 Bad Request** - Validation error
```json
{
  "response": "Error: String must contain at most 50 character(s) [newTagName]"
}
```

**400 Bad Request** - Demo mode
```json
{
  "response": "This action is disabled because this is a read-only demo of Linkwarden."
}
```

**401 Unauthorized** - Not authenticated
```json
{
  "error": "Unauthorized"
}
```

## Examples

### Example 1: Merge Two Tags

Merge tags "javascript" and "js" into a single "JavaScript" tag.

```bash
curl -X PUT "https://your-instance.com/api/v1/tags/merge" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tagIds": [12, 45],
    "newTagName": "JavaScript"
  }'
```

**Response:**
```json
{
  "response": {
    "id": 150,
    "name": "JavaScript",
    "ownerId": 42,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Result:**
- Tags with IDs 12 and 45 are deleted
- New tag "JavaScript" (ID: 150) is created
- All links previously tagged with IDs 12 or 45 are now tagged with ID 150

### Example 2: Merge Multiple Tags with TypeScript

```typescript
const mergeTags = async (tagIds: number[], newName: string) => {
  const response = await fetch('/api/v1/tags/merge', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${YOUR_API_KEY}`
    },
    body: JSON.stringify({
      tagIds,
      newTagName: newName
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.response);
  }

  const data = await response.json();
  return data.response; // Returns the new tag object
};

// Usage
const newTag = await mergeTags([10, 20, 30, 40], "Programming");
console.log(`Created merged tag: ${newTag.name} (ID: ${newTag.id})`);
```

### Example 3: Using React Hook (Frontend)

The `useMergeTags()` hook from `packages/router/tags.tsx`:

```typescript
import { useMergeTags } from "@linkwarden/router/tags";
import { toast } from "react-hot-toast";

function MergeTagsComponent() {
  const mergeTags = useMergeTags();
  const [selectedTags, setSelectedTags] = useState<number[]>([12, 45, 67]);
  const [newTagName, setNewTagName] = useState("JavaScript");

  const handleMerge = async () => {
    const load = toast.loading("Merging tags...");

    await mergeTags.mutateAsync(
      {
        tagIds: selectedTags,
        newTagName
      },
      {
        onSettled: (data, error) => {
          toast.dismiss(load);

          if (error) {
            toast.error(error.message);
          } else {
            toast.success("Tags merged successfully!");
            setSelectedTags([]);
          }
        }
      }
    );
  };

  return (
    <button onClick={handleMerge}>
      Merge {selectedTags.length} tags
    </button>
  );
}
```

### Example 4: Bulk Merge Operation

Merge multiple groups of tags sequentially:

```typescript
const mergePlan = [
  { tagIds: [1, 2], newName: "AI" },
  { tagIds: [5, 6, 7], newName: "Machine Learning" },
  { tagIds: [10, 11], newName: "Programming" }
];

for (const merge of mergePlan) {
  const result = await fetch('/api/v1/tags/merge', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${YOUR_API_KEY}`
    },
    body: JSON.stringify({
      tagIds: merge.tagIds,
      newTagName: merge.newName
    })
  });

  const data = await result.json();
  console.log(`Merged ${merge.tagIds.length} tags into "${data.response.name}"`);
}
```

## Controller Implementation

**File:** `apps/web/lib/api/controllers/tags/mergeTags.ts`

### Function Signature

```typescript
export default async function mergeTags(
  userId: number,
  body: MergeTagsSchemaType
): Promise<{
  response: Tag | string;
  status: number;
}>
```

### Implementation Flow

1. **Validate Request Body**
   ```typescript
   const dataValidation = MergeTagsSchema.safeParse(body);
   if (!dataValidation.success) {
     return { response: `Error: ${...}`, status: 400 };
   }
   ```

2. **Extract Parameters**
   ```typescript
   const { tagIds, newTagName } = dataValidation.data;
   ```

3. **Find Affected Links**
   ```typescript
   affectedLinks = await prisma.link.findMany({
     where: {
       tags: {
         some: {
           id: { in: tagIds },
           ownerId: userId  // Permission check
         }
       }
     },
     select: { id: true }
   });
   ```

4. **Execute Atomic Transaction**
   ```typescript
   const { newTag } = await prisma.$transaction(async (tx) => {
     // Delete old tags
     await tx.tag.deleteMany({
       where: {
         ownerId: userId,
         id: { in: tagIds }
       }
     });

     // Create new tag with all links
     const newTag = await tx.tag.create({
       data: {
         name: newTagName,
         ownerId: userId,
         links: {
           connect: affectedLinks.map(id => ({ id }))
         }
       }
     });

     // Invalidate search index for affected links
     await tx.link.updateMany({
       where: { id: { in: affectedLinks } },
       data: { indexVersion: null }
     });

     return { newTag };
   });
   ```

5. **Return Success**
   ```typescript
   return { response: newTag, status: 200 };
   ```

### Key Implementation Notes

**Permission Security:**
- Only tags with matching `ownerId` can be deleted
- Links are only retrieved if they belong to tags owned by the user
- This prevents users from merging other users' tags

**Link Preservation:**
- All links from all merged tags are preserved
- Duplicate link assignments are automatically handled by Prisma
- If a link was tagged with multiple merged tags, it will only have one connection to the new tag

**Search Index Invalidation:**
- `indexVersion: null` triggers re-indexing of affected links
- Ensures search results reflect the new tag structure
- Background indexing process will update these links

**Transaction Atomicity:**
- If any step fails, entire operation is rolled back
- Prevents partial merges (e.g., tags deleted but new tag not created)
- Maintains database consistency

## Use Cases

### Common Use Cases

1. **Consolidate Duplicates**
   ```json
   {
     "tagIds": [12, 45],
     "newTagName": "JavaScript"
   }
   ```
   Merge "javascript", "js", "JS" into "JavaScript"

2. **Fix Typos**
   ```json
   {
     "tagIds": [20, 21],
     "newTagName": "Programming"
   }
   ```
   Merge "Programing" (typo) and "programming" into "Programming"

3. **Rename Tag**
   ```json
   {
     "tagIds": [30],
     "newTagName": "Frontend Development"
   }
   ```
   Effectively renames a single tag (merge with itself)

4. **Consolidate Variants**
   ```json
   {
     "tagIds": [10, 11, 12, 13],
     "newTagName": "AI"
   }
   ```
   Merge "AI", "Artificial Intelligence", "ai", "A.I." into "AI"

5. **Clean Up Single-Link Tags**
   ```json
   {
     "tagIds": [100, 101, 102],
     "newTagName": "Miscellaneous"
   }
   ```
   Merge multiple low-usage tags into a broader category

### AI-Assisted Tag Merging Workflow

For large-scale tag cleanup (see `doc/instructions/ai-merge-tags.md`):

1. **Analyze** - Identify tags to merge using automated analysis
2. **Rename** - Rename tags to follow `Xyz~1`, `Xyz~2` pattern
3. **Merge** - Use this API to merge `Xyz~1`, `Xyz~2`, etc. into `Xyz`
4. **Verify** - Check that all links are preserved correctly

Example merge for AI-identified duplicates:
```typescript
// After renaming AI, ai → AI~1
const mergeResult = await fetch('/api/v1/tags/merge', {
  method: 'PUT',
  headers: { /* ... */ },
  body: JSON.stringify({
    tagIds: [tagId_AI, tagId_AI_tilde_1],
    newTagName: "AI"
  })
});
```

## UI Integration

### Modal Component

**File:** `apps/web/components/ModalContent/MergeTagsModal.tsx`

The UI provides a modal for merging tags:

**Features:**
- Displays count of selected tags
- Text input for new tag name
- Merge button with loading state
- Toast notifications for success/error

**User Flow:**
1. User selects multiple tags in the tags page (edit mode)
2. Clicks "Merge" button
3. Modal appears with selected count
4. User enters new tag name
5. Clicks "Merge Tags" button
6. Loading toast appears
7. Success toast shows or error is displayed
8. Selected tags are cleared
9. Tag list refreshes automatically (via React Query invalidation)

**Translation Keys:**
- `merge_count_tags` - "Merge {count} tags"
- `rename_tag_instruction` - Instructions for entering new tag name
- `tag_name_placeholder` - Placeholder text for input
- `merge_tags` - "Merge Tags" button text
- `merging` - "Merging..." loading message

## Performance Considerations

### Database Operations

**Query Complexity:**
- Link lookup: O(n) where n = total links tagged with any of the merged tags
- Tag deletion: O(m) where m = number of tags being merged
- Tag creation: O(1)
- Link update: O(n) for index invalidation

**Transaction Time:**
- Small merges (2-3 tags, <100 links): <100ms
- Medium merges (5-10 tags, 100-500 links): 100-500ms
- Large merges (>10 tags, >500 links): 500ms-2s

**Indexing Impact:**
- Setting `indexVersion: null` is fast (single UPDATE query)
- Actual re-indexing happens asynchronously in background
- No user-facing performance impact from re-indexing

### Optimization Tips

1. **Batch Similar Merges**: Group related tag merges to minimize UI updates
2. **Limit Concurrent Requests**: Merge sequentially to avoid database lock contention
3. **Client-Side Validation**: Validate input before API call to reduce failed requests
4. **Optimistic UI Updates**: Update UI immediately, revert on error

## Error Handling

### Validation Errors

**Empty Tag Name:**
```json
{
  "response": "Error: Required [newTagName]"
}
```

**Tag Name Too Long:**
```json
{
  "response": "Error: String must contain at most 50 character(s) [newTagName]"
}
```

**Empty Tag Array:**
```json
{
  "response": "Error: Array must contain at least 1 element(s) [tagIds]"
}
```

**Invalid Tag ID Type:**
```json
{
  "response": "Error: Expected number, received string [tagIds.0]"
}
```

### Permission Errors

If a tag in `tagIds` doesn't belong to the user:
- The tag will not be deleted (filtered by `ownerId` in WHERE clause)
- The merge will still succeed for tags that do belong to the user
- No explicit error is returned (this is a security feature)

### Transaction Errors

If the transaction fails (database error, constraint violation):
- All operations are rolled back
- No tags are deleted
- No new tag is created
- Links remain unchanged
- 500 status code returned

## Testing

### Manual Testing

```bash
# Test script location
scripts/test-tags-merge.sh

# Usage
export LINKWARDEN_BASE_URL=http://localhost:3003
export LINKWARDEN_TOKEN=your_token_here
./scripts/test-tags-merge.sh
```

### Test Cases

1. **Basic Merge** - Merge 2 tags with 5 links each
2. **Single Tag Rename** - Merge 1 tag to rename it
3. **Large Merge** - Merge 10+ tags with 100+ total links
4. **Validation** - Test all validation error cases
5. **Permission** - Attempt to merge another user's tags
6. **Transaction Rollback** - Simulate database error during merge

### React Query Integration

The `useMergeTags()` hook automatically:
- Invalidates `["tags-paginated"]` query on success
- Triggers UI refresh
- Handles optimistic updates
- Provides loading/error states

## Related Endpoints

- **GET /api/v1/tags** - List all tags (see `doc/api/get-tags.md`)
- **POST /api/v1/tags** - Create or update tags
- **DELETE /api/v1/tags** - Bulk delete tags
- **PUT /api/v1/tags/{id}** - Update single tag

## Migration Guide

### From Manual Tag Cleanup to Merge API

**Before:**
1. Manually delete duplicate tags
2. Links lose tag associations
3. Have to manually re-tag links

**After:**
1. Use merge API to consolidate tags
2. All link associations preserved automatically
3. Single atomic operation

### Bulk Migration Script

For migrating from old tag structure to new:

```typescript
// Load merge plan from analysis
const mergePlan = require('./scripts/merge-execution-plan.json');

for (const group of mergePlan.phase1_case_plural) {
  const tagIds = group.merges.map(m => getTagIdByName(m.original));

  await fetch('/api/v1/tags/merge', {
    method: 'PUT',
    headers: { /* ... */ },
    body: JSON.stringify({
      tagIds,
      newTagName: group.primary
    })
  });

  console.log(`Merged ${tagIds.length} tags into "${group.primary}"`);
}
```

## Implementation Reference

### File Locations

| Component | File Path |
|-----------|-----------|
| Controller | `apps/web/lib/api/controllers/tags/mergeTags.ts` |
| API Route | `apps/web/pages/api/v1/tags/merge.ts` |
| Schema Validation | `packages/lib/schemaValidation.ts:278-283` |
| React Hook | `packages/router/tags.tsx` (useMergeTags) |
| UI Modal | `apps/web/components/ModalContent/MergeTagsModal.tsx` |

### Database Schema

**Tag Model** (`@linkwarden/prisma/client`):
```prisma
model Tag {
  id        Int      @id @default(autoincrement())
  name      String
  ownerId   Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  links     Link[]   @relation("_LinkToTag")
}
```

**Link-Tag Relation:**
- Many-to-many relationship via `_LinkToTag` junction table
- Duplicate associations automatically handled by Prisma
- Cascade delete when tag is deleted (handled by foreign key)

## Security Considerations

1. **User Isolation**: Tags can only be merged by their owner
2. **SQL Injection**: Protected by Prisma's parameterized queries
3. **Input Validation**: Zod schema validates all input
4. **Transaction Safety**: Atomic operations prevent partial states
5. **Demo Mode**: Destructive operations disabled in demo

## Best Practices

### For API Consumers

1. **Validate Client-Side**: Check tag name length before API call
2. **Handle Errors Gracefully**: Display user-friendly error messages
3. **Provide Feedback**: Show loading states and success confirmations
4. **Refresh UI**: Invalidate tag caches after merge
5. **Confirm Destructive Operations**: Ask user to confirm before merging

### For Large Merges

1. **Process Sequentially**: Don't merge multiple groups in parallel
2. **Batch Related Tags**: Group similar tags in single merge operation
3. **Monitor Performance**: Watch transaction times for large merges
4. **Backup First**: Create database backup before bulk operations
5. **Verify Results**: Check link counts before and after merge

## Future Enhancements

Potential improvements to the merge API:

1. **Dry Run Mode**: Preview merge results without committing
2. **Conflict Resolution**: Handle tag name conflicts explicitly
3. **Merge History**: Track which tags were merged together
4. **Undo Capability**: Ability to reverse a merge operation
5. **Batch Merge Endpoint**: Merge multiple groups in single request
6. **Progress Tracking**: WebSocket updates for large merge operations

## References

- **API Documentation**: `doc/api/get-tags.md`
- **Pagination Guide**: `doc/claude/tags-pagination.md`
- **AI Merge Instructions**: `doc/instructions/ai-merge-tags.md`
- **Merge Analysis**: `doc/analysis/tag-merge-analysis-summary.md`
- **Schema Validation**: `packages/lib/schemaValidation.ts`
- **Prisma Schema**: `packages/prisma/schema.prisma`
