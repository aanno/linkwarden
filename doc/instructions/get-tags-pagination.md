# Implementation Guide: Pagination and Sorting for GET Tags API

## Overview

This document outlines the implementation plan for adding pagination and sorting capabilities to the `GET /api/v1/tags` endpoint. Currently, this endpoint returns all tags without pagination or sorting, which can lead to performance issues for users with large tag collections.

### Goals

1. **Add pagination** to limit the number of tags returned per request
2. **Add sorting** to allow ordering tags by different criteria
3. **Maintain backward compatibility** where possible
4. **Follow existing patterns** from the search API implementation
5. **Expose collectionId filtering** (currently hidden in controller)

### Reference Implementation

The `searchLinks` implementation (`apps/web/lib/api/controllers/search/searchLinks.ts`) should be used as a reference for pagination and sorting patterns.

---

## 1. Type Definitions

### 1.1 Create TagSort Enum

**File:** `packages/types/global.ts`

Add a new `TagSort` enum after the existing `Sort` enum (after line 86):

```typescript
export enum TagSort {
  DateNewestFirst = 0,
  DateOldestFirst = 1,
  NameAZ = 2,
  NameZA = 3,
  LinkCountHighLow = 4,
  LinkCountLowHigh = 5,
}
```

**Rationale:**
- Values 0-3 match the existing `Sort` enum for consistency
- Values 4-5 are unique to tags (sort by link count)
- This enum is already used in the mobile app (`apps/mobile/types/global.ts`)

### 1.2 Create TagRequestQuery Type

**File:** `packages/types/global.ts`

Add after the `PublicLinkRequestQuery` type (after line 102):

```typescript
export type TagRequestQuery = {
  sort?: TagSort;
  cursor?: number;
  collectionId?: number;
};
```

**Fields:**
- `sort`: Sort order using TagSort enum
- `cursor`: Pagination cursor (last tag ID from previous page)
- `collectionId`: Optional filter by collection (currently supported in controller but not exposed)

### 1.3 Update Exports

Ensure both `TagSort` and `TagRequestQuery` are exported from the package.

---

## 2. Controller Changes

### 2.1 Update getTags Function Signature

**File:** `apps/web/lib/api/controllers/tags/getTags.ts`

**Current signature (lines 3-9):**
```typescript
export default async function getTags({
  userId,
  collectionId,
}: {
  userId?: number;
  collectionId?: number;
}) {
```

**New signature:**
```typescript
import { TagRequestQuery, TagSort, Order } from "@linkwarden/types";

interface GetTagsParams {
  userId?: number;
  query?: TagRequestQuery;
}

export default async function getTags({
  userId,
  query = {},
}: GetTagsParams) {
```

**Rationale:**
- Matches the pattern from `searchLinks`
- Groups query parameters in a single object
- Allows easy extension with new parameters

### 2.2 Add Pagination Configuration

Add at the beginning of the function (similar to `searchLinks.ts:24`):

```typescript
const paginationTakeCount = Number(process.env.PAGINATION_TAKE_COUNT) || 50;
```

### 2.3 Implement Sort Logic

Add after pagination configuration:

```typescript
let order: Order = { createdAt: "desc" }; // Default: newest first

if (query.sort === TagSort.DateNewestFirst) {
  order = { createdAt: "desc" };
} else if (query.sort === TagSort.DateOldestFirst) {
  order = { createdAt: "asc" };
} else if (query.sort === TagSort.NameAZ) {
  order = { name: "asc" };
} else if (query.sort === TagSort.NameZA) {
  order = { name: "desc" };
} else if (query.sort === TagSort.LinkCountHighLow) {
  // Requires special handling - see section 2.5
  order = { links: { _count: "desc" } };
} else if (query.sort === TagSort.LinkCountLowHigh) {
  // Requires special handling - see section 2.5
  order = { links: { _count: "asc" } };
}
```

**Note:** The commented-out sorting in the current code (lines 35-39) uses this exact pattern for link count sorting.

### 2.4 Update Prisma Query for userId

**Current query (lines 11-40):**
```typescript
const tags = await prisma.tag.findMany({
  where: {
    OR: [
      { ownerId: userId },
      {
        links: {
          some: {
            collection: {
              members: { some: { userId } },
            },
          },
        },
      },
    ],
  },
  include: {
    _count: { select: { links: true } },
  },
});
```

**New query with pagination:**
```typescript
const tags = await prisma.tag.findMany({
  take: paginationTakeCount,
  skip: query.cursor ? 1 : undefined,
  cursor: query.cursor ? { id: query.cursor } : undefined,
  where: {
    AND: [
      // User access filter
      {
        OR: [
          { ownerId: userId },
          {
            links: {
              some: {
                collection: {
                  members: { some: { userId } },
                },
              },
            },
          },
        ],
      },
      // Collection filter (if provided)
      ...(query.collectionId
        ? [{
            links: {
              some: {
                collection: { id: query.collectionId },
              },
            },
          }]
        : []),
    ],
  },
  include: {
    _count: { select: { links: true } },
  },
  orderBy: order,
});
```

**Key changes:**
- Added `take`, `skip`, `cursor` for pagination
- Added `orderBy` for sorting
- Changed `where` to use `AND` to support multiple conditions
- Added optional `collectionId` filtering

### 2.5 Handle Link Count Sorting

**Important:** Prisma has limitations with sorting by relation counts. You may need to:

**Option A - Client-side sorting (simpler):**
```typescript
// After fetching tags, sort in memory if needed
if (query.sort === TagSort.LinkCountHighLow) {
  tags.sort((a, b) => (b._count?.links || 0) - (a._count?.links || 0));
} else if (query.sort === TagSort.LinkCountLowHigh) {
  tags.sort((a, b) => (a._count?.links || 0) - (b._count?.links || 0));
}
```

**Option B - Raw SQL (better for large datasets):**
Use Prisma's `$queryRaw` with a custom SQL query that joins and sorts by count.

**Recommendation:** Start with Option A for simplicity. The commented code in the current implementation (lines 35-39) suggests this was the original intention.

### 2.6 Calculate nextCursor

Add after the query:

```typescript
const nextCursor = tags.length === paginationTakeCount 
  ? tags[tags.length - 1].id 
  : null;
```

### 2.7 Update Return Value

**Current return (line 42):**
```typescript
return { response: tags, status: 200 };
```

**New return:**
```typescript
return {
  response: {
    tags,
    nextCursor,
  },
  status: 200,
};
```

### 2.8 Handle collectionId-only Case

The current implementation has a separate case for `collectionId` without `userId` (lines 43-57). This should be integrated into the main query logic as shown in section 2.4.

**Remove lines 43-57** and rely on the unified query logic.

---

## 3. API Endpoint Changes

### 3.1 Update Tags Endpoint

**File:** `apps/web/pages/api/v1/tags/index.ts`

**Current GET handler (lines 12-18):**
```typescript
if (req.method === "GET") {
  const tags = await getTags({
    userId: user.id,
  });

  return res.status(tags?.status || 500).json({ response: tags?.response });
}
```

**New GET handler:**
```typescript
if (req.method === "GET") {
  // Convert query parameters to TagRequestQuery
  const convertedData: TagRequestQuery = {
    sort: req.query.sort ? Number(req.query.sort as string) : undefined,
    cursor: req.query.cursor ? Number(req.query.cursor as string) : undefined,
    collectionId: req.query.collectionId
      ? Number(req.query.collectionId as string)
      : undefined,
  };

  const tags = await getTags({
    userId: user.id,
    query: convertedData,
  });

  return res.status(tags?.status || 500).json({ response: tags?.response });
}
```

**Pattern:** This follows the exact pattern from `apps/web/pages/api/v1/search/index.ts:15-28`.

---

## 4. Database Considerations

### 4.1 Indexes

For optimal performance, consider adding database indexes:

```sql
-- Index for sorting by name
CREATE INDEX idx_tag_name ON "Tag"(name);

-- Index for sorting by createdAt
CREATE INDEX idx_tag_createdAt ON "Tag"("createdAt");

-- Index for cursor-based pagination
CREATE INDEX idx_tag_id ON "Tag"(id);
```

**Note:** Check your Prisma schema to see if these indexes already exist.

### 4.2 Link Count Sorting Performance

Sorting by link count requires joining with the links table. For better performance:

1. Consider adding a cached `linkCount` column to the Tag table
2. Update this count when links are added/removed from tags
3. Sort by this column instead of computing counts on-the-fly

**Alternative:** Use materialized views or database triggers (PostgreSQL-specific).

---

## 5. Response Structure Changes

### 5.1 Current Response

```json
{
  "response": [
    { "id": 1, "name": "tag1", ... },
    { "id": 2, "name": "tag2", ... }
  ]
}
```

### 5.2 New Response

```json
{
  "response": {
    "tags": [
      { "id": 1, "name": "tag1", ... },
      { "id": 2, "name": "tag2", ... }
    ],
    "nextCursor": 123
  }
}
```

**Breaking Change:** This changes the response structure!

### 5.3 Backward Compatibility Option

To maintain backward compatibility, you could:

**Option 1 - Version the API:**
- Keep `GET /api/v1/tags` as-is (no pagination)
- Create `GET /api/v2/tags` with pagination

**Option 2 - Smart response:**
```typescript
// If no pagination params provided, use old format
if (!query.sort && !query.cursor && !query.collectionId) {
  return res.status(tags?.status || 500).json({ response: tags?.response.tags });
}
// Otherwise use new format
return res.status(tags?.status || 500).json({ response: tags?.response });
```

**Recommendation:** Use Option 2 for seamless transition.

---

## 6. Client-Side Changes

### 6.1 Update API Calls

Existing clients calling `GET /api/v1/tags` will need to be updated if the response structure changes.

**Before:**
```typescript
const response = await fetch('/api/v1/tags');
const { response: tags } = await response.json();
// tags is an array
```

**After:**
```typescript
const response = await fetch('/api/v1/tags?sort=0&cursor=0');
const { response: data } = await response.json();
const { tags, nextCursor } = data;
// tags is an array, nextCursor is for pagination
```

### 6.2 Pagination Implementation

Example infinite scroll implementation:

```typescript
const fetchTags = async (cursor?: number) => {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor.toString());
  params.set('sort', '4'); // LinkCountHighLow
  
  const response = await fetch(`/api/v1/tags?${params}`);
  const { response: data } = await response.json();
  return data;
};

// Usage
let allTags = [];
let cursor = undefined;

do {
  const { tags, nextCursor } = await fetchTags(cursor);
  allTags = [...allTags, ...tags];
  cursor = nextCursor;
} while (cursor !== null);
```

---

## 7. Testing

### 7.1 Unit Tests

Create tests for:

1. **Sorting:**
   - Verify each sort option returns correctly ordered results
   - Test default sort (DateNewestFirst)

2. **Pagination:**
   - Verify `take` limit is respected
   - Verify `nextCursor` is correct
   - Verify cursor-based pagination works across pages
   - Verify last page returns `nextCursor: null`

3. **Filtering:**
   - Verify `collectionId` filter works
   - Verify user access control (only user's tags)

4. **Edge cases:**
   - Empty result set
   - Single page of results
   - Exactly `paginationTakeCount` results

### 7.2 Integration Tests

Test the complete flow:

```typescript
describe('GET /api/v1/tags with pagination', () => {
  it('should return first page with nextCursor', async () => {
    const response = await request(app)
      .get('/api/v1/tags?sort=2&cursor=0')
      .expect(200);
    
    expect(response.body.response.tags).toHaveLength(50);
    expect(response.body.response.nextCursor).toBeDefined();
  });

  it('should return sorted tags by name A-Z', async () => {
    const response = await request(app)
      .get('/api/v1/tags?sort=2')
      .expect(200);
    
    const tags = response.body.response.tags;
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i].name >= tags[i-1].name).toBe(true);
    }
  });

  it('should filter by collectionId', async () => {
    const response = await request(app)
      .get('/api/v1/tags?collectionId=5')
      .expect(200);
    
    // Verify all tags belong to collection 5
    const tags = response.body.response.tags;
    tags.forEach(tag => {
      // Tag should have links in collection 5
      expect(tag).toBeDefined();
    });
  });
});
```

### 7.3 Performance Tests

Test with large datasets:

1. Create 10,000+ tags
2. Measure query time for different sort options
3. Verify pagination doesn't slow down with higher cursor values
4. Test link count sorting performance

---

## 8. Documentation Updates

Update the following documentation files:

### 8.1 API Documentation

**File:** `doc/api/get-tags.md`

Add sections for:
- Query parameters (sort, cursor, collectionId)
- Sort values (TagSort enum)
- Pagination examples
- Response structure changes

### 8.2 Migration Guide

Create a migration guide for developers using the API:

```markdown
# Migration Guide: Tags API v1 → v1.1

## Breaking Changes

The response structure for `GET /api/v1/tags` has changed:

**Before:**
- Response: `{ response: Tag[] }`

**After:**
- Response: `{ response: { tags: Tag[], nextCursor: number | null } }`

## Backward Compatibility

If you don't provide pagination parameters, the old response format is maintained.

## New Features

- Pagination support via `cursor` parameter
- Sorting support via `sort` parameter
- Collection filtering via `collectionId` parameter
```

---

## 9. Implementation Checklist

### Phase 1: Type Definitions
- [ ] Add `TagSort` enum to `packages/types/global.ts`
- [ ] Add `TagRequestQuery` type to `packages/types/global.ts`
- [ ] Verify exports in type package

### Phase 2: Controller Changes
- [ ] Update `getTags` function signature
- [ ] Add pagination configuration
- [ ] Implement sort logic
- [ ] Update Prisma query with pagination
- [ ] Add collectionId filtering
- [ ] Calculate nextCursor
- [ ] Update return value structure
- [ ] Remove duplicate collectionId-only logic

### Phase 3: API Endpoint
- [ ] Update tags endpoint to parse query parameters
- [ ] Pass query object to getTags controller
- [ ] Handle backward compatibility

### Phase 4: Database
- [ ] Add database indexes (if needed)
- [ ] Test query performance
- [ ] Optimize link count sorting (if needed)

### Phase 5: Testing
- [ ] Write unit tests for getTags controller
- [ ] Write integration tests for API endpoint
- [ ] Test pagination flow
- [ ] Test all sort options
- [ ] Test collectionId filtering
- [ ] Performance testing with large datasets

### Phase 6: Documentation
- [ ] Update `doc/api/get-tags.md`
- [ ] Create migration guide
- [ ] Update API examples
- [ ] Document breaking changes

### Phase 7: Client Updates
- [ ] Update frontend tag fetching logic
- [ ] Implement pagination UI (if needed)
- [ ] Update mobile app (if applicable)
- [ ] Test all client integrations

---

## 10. Future Enhancements

### 10.1 Expose collectionId Filtering

Currently, the `getTags` controller supports a `collectionId` parameter (lines 43-57), but the API endpoint doesn't expose it. With this implementation, it will be available via the query parameter.

**Use case:** Get tags for a specific collection

**Example:**
```bash
curl -X GET "https://your-instance.com/api/v1/tags?collectionId=5"
```

### 10.2 Search/Filter by Tag Name

Add a `searchQueryString` parameter to filter tags by name:

```typescript
export type TagRequestQuery = {
  sort?: TagSort;
  cursor?: number;
  collectionId?: number;
  searchQueryString?: string; // New field
};
```

**Implementation:**
```typescript
where: {
  AND: [
    // Existing filters...
    ...(query.searchQueryString
      ? [{
          name: {
            contains: query.searchQueryString,
            mode: "insensitive",
          },
        }]
      : []),
  ],
}
```

### 10.3 Multiple Sort Options

Allow sorting by multiple fields:

```typescript
sort?: TagSort[];
```

**Example:** Sort by link count descending, then by name ascending.

### 10.4 Offset-based Pagination

For compatibility with tools that expect offset/limit:

```typescript
export type TagRequestQuery = {
  sort?: TagSort;
  cursor?: number;
  offset?: number; // Alternative to cursor
  limit?: number;   // Alternative to PAGINATION_TAKE_COUNT
  collectionId?: number;
};
```

### 10.5 Tag Statistics

Include additional statistics in the response:

```typescript
{
  response: {
    tags: Tag[],
    nextCursor: number | null,
    stats: {
      totalTags: number,
      totalLinks: number,
      averageLinksPerTag: number,
    },
  }
}
```

---

## 11. Example Code

### 11.1 Complete getTags Controller (After Changes)

```typescript
import { prisma } from "@linkwarden/prisma";
import { TagRequestQuery, TagSort, Order } from "@linkwarden/types";

interface GetTagsParams {
  userId?: number;
  query?: TagRequestQuery;
}

export default async function getTags({
  userId,
  query = {},
}: GetTagsParams) {
  if (!userId) {
    return { response: { tags: [], nextCursor: null }, status: 400 };
  }

  const paginationTakeCount = Number(process.env.PAGINATION_TAKE_COUNT) || 50;

  // Determine sort order
  let order: Order = { createdAt: "desc" };
  
  if (query.sort === TagSort.DateNewestFirst) {
    order = { createdAt: "desc" };
  } else if (query.sort === TagSort.DateOldestFirst) {
    order = { createdAt: "asc" };
  } else if (query.sort === TagSort.NameAZ) {
    order = { name: "asc" };
  } else if (query.sort === TagSort.NameZA) {
    order = { name: "desc" };
  }
  // Note: LinkCount sorting handled after query

  const tags = await prisma.tag.findMany({
    take: paginationTakeCount,
    skip: query.cursor ? 1 : undefined,
    cursor: query.cursor ? { id: query.cursor } : undefined,
    where: {
      AND: [
        // User access filter
        {
          OR: [
            { ownerId: userId },
            {
              links: {
                some: {
                  collection: {
                    members: { some: { userId } },
                  },
                },
              },
            },
          ],
        },
        // Collection filter (if provided)
        ...(query.collectionId
          ? [
              {
                links: {
                  some: {
                    collection: { id: query.collectionId },
                  },
                },
              },
            ]
          : []),
      ],
    },
    include: {
      _count: {
        select: { links: true },
      },
    },
    orderBy: query.sort === TagSort.LinkCountHighLow || 
             query.sort === TagSort.LinkCountLowHigh 
      ? undefined 
      : order,
  });

  // Handle link count sorting (client-side)
  if (query.sort === TagSort.LinkCountHighLow) {
    tags.sort((a, b) => (b._count?.links || 0) - (a._count?.links || 0));
  } else if (query.sort === TagSort.LinkCountLowHigh) {
    tags.sort((a, b) => (a._count?.links || 0) - (b._count?.links || 0));
  }

  const nextCursor =
    tags.length === paginationTakeCount ? tags[tags.length - 1].id : null;

  return {
    response: {
      tags,
      nextCursor,
    },
    status: 200,
  };
}
```

### 11.2 Complete API Endpoint (After Changes)

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import getTags from "@/lib/api/controllers/tags/getTags";
import verifyUser from "@/lib/api/verifyUser";
import { PostTagSchema } from "@linkwarden/lib/schemaValidation";
import createOrUpdateTags from "@/lib/api/controllers/tags/createOrUpdateTags";
import bulkTagDelete from "@/lib/api/controllers/tags/bulkTagDelete";
import { TagRequestQuery } from "@linkwarden/types";

export default async function tags(req: NextApiRequest, res: NextApiResponse) {
  const user = await verifyUser({ req, res });
  if (!user) return;

  if (req.method === "GET") {
    // Convert query parameters to TagRequestQuery
    const convertedData: TagRequestQuery = {
      sort: req.query.sort ? Number(req.query.sort as string) : undefined,
      cursor: req.query.cursor 
        ? Number(req.query.cursor as string) 
        : undefined,
      collectionId: req.query.collectionId
        ? Number(req.query.collectionId as string)
        : undefined,
    };

    const tags = await getTags({
      userId: user.id,
      query: convertedData,
    });

    // Backward compatibility: if no query params, return old format
    const hasQueryParams = req.query.sort || req.query.cursor || req.query.collectionId;
    
    if (!hasQueryParams) {
      // Old format: { response: Tag[] }
      return res.status(tags?.status || 500).json({ 
        response: tags?.response?.tags || [] 
      });
    }

    // New format: { response: { tags: Tag[], nextCursor: number | null } }
    return res.status(tags?.status || 500).json({ response: tags?.response });
  }

  // POST and DELETE handlers remain unchanged...
  if (req.method === "POST") {
    // ... existing code
  }

  if (req.method === "DELETE") {
    // ... existing code
  }
}
```

---

## 12. Risk Assessment

### 12.1 Breaking Changes

**Risk:** High  
**Impact:** Existing clients may break if response structure changes  
**Mitigation:** Implement backward compatibility mode (see section 5.3)

### 12.2 Performance

**Risk:** Medium  
**Impact:** Link count sorting may be slow with many tags  
**Mitigation:** 
- Use client-side sorting for now
- Add database indexes
- Consider caching link counts

### 12.3 Data Consistency

**Risk:** Low  
**Impact:** Cursor-based pagination may miss/duplicate items if tags are added/deleted during pagination  
**Mitigation:** Document this limitation; consider adding timestamp-based pagination in the future

---

## 13. References

### Source Files

- **searchLinks controller:** `apps/web/lib/api/controllers/search/searchLinks.ts`
- **getTags controller:** `apps/web/lib/api/controllers/tags/getTags.ts`
- **tags endpoint:** `apps/web/pages/api/v1/tags/index.ts`
- **search endpoint:** `apps/web/pages/api/v1/search/index.ts`
- **types:** `packages/types/global.ts`
- **mobile types:** `apps/mobile/types/global.ts` (TagSort already defined)

### Related Documentation

- **Search API docs:** `doc/api/search-links.md`
- **Get Tags API docs:** `doc/api/get-tags.md`

---

## 14. Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|---------------|--------------|
| Type definitions | 1 hour | None |
| Controller changes | 4-6 hours | Type definitions |
| API endpoint changes | 2 hours | Controller changes |
| Database optimization | 2-4 hours | Controller changes |
| Testing | 4-6 hours | All above |
| Documentation | 2-3 hours | Testing |
| Client updates | 4-8 hours | API endpoint changes |

**Total:** 19-30 hours

---

## 15. Notes

1. The commented-out sorting code (lines 35-39 in current `getTags.ts`) suggests this feature was planned but not completed
2. The mobile app already uses a `TagSort` enum with 6 values, confirming demand for this feature
3. The controller already supports `collectionId` filtering but it's not exposed via the API endpoint
4. Consider using this implementation as a template for pagination in other endpoints (collections, users, etc.)
