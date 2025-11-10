# Unified Pagination System for Linkwarden REST API

## Executive Summary

This document analyzes the current pagination implementation across all Linkwarden REST API GET endpoints and proposes a unified pagination system that:

1. Aligns with Prisma ORM patterns (cursor + limit)
2. Uses column-based sorting instead of enum values
3. Supports multi-column sorting with directional control
4. Includes search/filter parameters
5. Provides reusable utility functions to eliminate code duplication

## Current State Analysis

### Endpoints with Pagination (3 endpoints)

| Endpoint | Controller | Pagination | Sort | Limit |
|----------|-----------|------------|------|-------|
| `/api/v1/search` | searchLinks.ts | Cursor (ID or offset) | Enum 0-3 | Env var (50) |
| `/api/v1/links` | getLinks.ts | Cursor (ID) | Enum 0-3 | Env var (50) |
| `/api/v1/public/collections/links` | searchLinks.ts | Cursor (ID or offset) | Enum 0-3 | Env var (50) |

**Current Sort Enum:**
```typescript
export enum Sort {
  DateNewestFirst = 0,  // id desc
  DateOldestFirst = 1,  // id asc
  NameAZ = 2,           // name asc
  NameZA = 3,           // name desc
}
```

**Current Pagination Pattern:**
```typescript
// Cursor-based (Prisma native)
const links = await prisma.link.findMany({
  take: Number(process.env.PAGINATION_TAKE_COUNT) || 50,
  skip: query.cursor ? 1 : undefined,
  cursor: query.cursor ? { id: query.cursor } : undefined,
  orderBy: order,
});

// Offset-based (Meilisearch fallback)
const results = await searchLinks({
  offset: cursor,
  limit: take,
});
```

### Endpoints WITHOUT Pagination (9 endpoints)

| Endpoint | Controller | Returns | Current Issue |
|----------|-----------|---------|---------------|
| `/api/v1/collections` | getCollections.ts | All collections | No pagination, no sorting |
| `/api/v1/tags` | getTags.ts | All tags | No pagination, no sorting, no search |
| `/api/v1/users` | getUsers.ts | All users | No pagination, client-side sort |
| `/api/v1/tokens` | getTokens.ts | All tokens | No pagination, no sorting |
| `/api/v1/dashboard` | getDashboardData.ts | Top 10 each | Hardcoded limit, no pagination |
| `/api/v1/links/[id]/highlights` | getLinkHighlights.ts | All highlights | No pagination, no sorting |
| `/api/v1/public/collections/tags` | getTags.ts | All tags | No pagination, no sorting, no search |
| `/api/v1/public/collections/[id]` | getPublicCollection.ts | Single item | N/A (not a list) |
| `/api/v1/rss/[id]` | (RSS feed) | Feed items | Special case |

**Severity Assessment:**
- **Critical** (>1000 records expected): tags, collections
- **High** (>100 records expected): users (enterprise), tokens, highlights
- **Medium** (<100 records expected): dashboard (fixed at 10)

### Problems with Current Implementation

1. **Enum-Based Sorting Limitations:**
   - Cannot sort by arbitrary columns (e.g., `createdAt`, `updatedAt`)
   - Cannot combine multiple sort columns (e.g., `name, id`)
   - Adding new sort options requires enum updates across frontend/backend
   - Not intuitive for API consumers

2. **No Standardization:**
   - Pagination exists only in 3 endpoints
   - Each controller reimplements similar logic
   - No shared utilities or types

3. **Hardcoded Limits:**
   - `PAGINATION_TAKE_COUNT` env var controls all paginated endpoints
   - No per-request limit override
   - Dashboard hardcodes `take: 10`

4. **Missing Search/Filter:**
   - Tags endpoint has no name search
   - Collections endpoint has no name search
   - Users endpoint has no username/email search

5. **Code Duplication:**
   - Sort enum → Prisma Order mapping repeated in multiple files
   - Cursor pagination logic duplicated
   - Response wrapping inconsistent

## Proposed Unified Pagination System

### Design Principles

1. **Prisma-First:** Align with Prisma's native pagination capabilities
2. **Column-Based Sorting:** Use actual column names instead of enums
3. **Multi-Column Support:** Allow sorting by multiple columns
4. **Backward Compatible:** Support legacy enum-based sorting during transition
5. **Type-Safe:** Full TypeScript typing for query parameters and responses
6. **Reusable:** Common utilities to eliminate duplication

### New Query Parameter Schema

```typescript
// Base pagination parameters (all endpoints)
export type PaginationParams = {
  cursor?: number;           // Cursor value (ID for cursor-based, offset for offset-based)
  limit?: number;            // Max items to return (default: 50, max: 100)
  sort?: string;             // Comma-separated column names (e.g., "name,id")
  dir?: string;              // Comma-separated directions (e.g., "asc,desc")
  search?: string;           // Search query (meaning depends on endpoint)
};

// Extended for links/search
export type LinkPaginationParams = PaginationParams & {
  collectionId?: number;
  tagId?: number;
  pinnedOnly?: boolean;
  searchQueryString?: string; // Advanced search (url:, name:, etc.)
};

// Extended for tags
export type TagPaginationParams = PaginationParams & {
  collectionId?: number;
  // search parameter filters by tag name
};

// Extended for collections
export type CollectionPaginationParams = PaginationParams & {
  // search parameter filters by collection name
};

// Extended for users (admin only)
export type UserPaginationParams = PaginationParams & {
  // search parameter filters by username/email
};
```

### Column-Based Sorting

**Format:**
- `sort`: Comma-separated column names (e.g., `sort=name,id`)
- `dir`: Comma-separated directions (e.g., `dir=asc,desc`)
- If `dir` has fewer values than `sort`, last `dir` value applies to remaining columns
- If `dir` is omitted, defaults to `asc` for all columns

**Examples:**
```bash
# Sort by name ascending, then ID descending
?sort=name,id&dir=asc,desc

# Sort by name descending (dir applies to all when single value)
?sort=name&dir=desc

# Sort by created date descending, then name ascending
?sort=createdAt,name&dir=desc,asc

# Default to ascending when dir omitted
?sort=name,id
# Equivalent to: ?sort=name,id&dir=asc,asc
```

**Mapping to Prisma:**
```typescript
function parseSort(sort?: string, dir?: string): Prisma.SortOrder[] {
  if (!sort) return [{ id: 'desc' }]; // Default

  const columns = sort.split(',').map(s => s.trim());
  const directions = dir ? dir.split(',').map(d => d.trim()) : [];

  return columns.map((column, index) => {
    const direction = directions[index] || directions[directions.length - 1] || 'asc';
    return { [column]: direction };
  });
}

// Usage
const orderBy = parseSort(query.sort, query.dir);
// Example result: [{ name: 'asc' }, { id: 'desc' }]
```

**Backward Compatibility:**

Support legacy enum-based sorting during transition:

```typescript
function parseSortWithLegacy(
  sort?: string | number,
  dir?: string
): Prisma.SortOrder[] {
  // Legacy enum handling
  if (typeof sort === 'number' || !isNaN(Number(sort))) {
    const enumValue = Number(sort);
    switch (enumValue) {
      case 0: return [{ id: 'desc' }];      // DateNewestFirst
      case 1: return [{ id: 'asc' }];       // DateOldestFirst
      case 2: return [{ name: 'asc' }];     // NameAZ
      case 3: return [{ name: 'desc' }];    // NameZA
      case 4: return []; // LinkCountHighLow - client-side only
      case 5: return []; // LinkCountLowHigh - client-side only
      default: return [{ id: 'desc' }];
    }
  }

  // New column-based sorting
  return parseSort(sort as string, dir);
}
```

### Search/Filter Parameters

**By Endpoint:**

| Endpoint | Search Parameter | Behavior |
|----------|------------------|----------|
| `/api/v1/tags` | `search=react` | Filter tags where `name` contains "react" (case-insensitive) |
| `/api/v1/collections` | `search=work` | Filter collections where `name` contains "work" (case-insensitive) |
| `/api/v1/users` | `search=john` | Filter users where `username` OR `email` contains "john" |
| `/api/v1/search` | `searchQueryString` | Advanced syntax (url:, name:, description:, etc.) |
| `/api/v1/links` | `searchQueryString` | Advanced syntax (same as search) |

**Implementation Example (Tags):**

```typescript
// In getTags controller
const whereClause = {
  OR: [
    { ownerId: userId },
    { links: { some: { collection: { members: { some: { userId } } } } } }
  ],
  ...(params.search && {
    name: {
      contains: params.search,
      mode: 'insensitive' as const,
    }
  }),
  ...(params.collectionId && {
    links: { some: { collectionId: params.collectionId } }
  }),
};
```

### Pagination Response Format

**Standardized Response:**

```typescript
export type PaginatedResponse<T> = {
  items: T[];              // Array of results
  nextCursor: number | null; // Next cursor value, or null if no more pages
  hasMore: boolean;        // Whether there are more results
  total?: number;          // Optional total count (expensive for large datasets)
};

// Wrapper type for API responses
export type ApiResponse<T> = {
  success: boolean;
  response: T;
};
```

**Example Responses:**

```json
// Tags endpoint
{
  "success": true,
  "response": {
    "items": [
      { "id": 1, "name": "react", "_count": { "links": 42 } },
      { "id": 2, "name": "typescript", "_count": { "links": 38 } }
    ],
    "nextCursor": 50,
    "hasMore": true
  }
}

// Last page
{
  "success": true,
  "response": {
    "items": [
      { "id": 99, "name": "vue", "_count": { "links": 5 } }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

**Backward Compatibility:**

During transition, support both old and new response formats:

```typescript
// Legacy mode (default for now)
return res.json({
  response: tags, // Array directly
});

// New mode (opt-in via header or param)
if (req.query.v === '2' || req.headers['x-api-version'] === '2') {
  return res.json({
    success: true,
    response: {
      items: tags,
      nextCursor: nextCursor,
      hasMore: tags.length === limit,
    },
  });
}
```

## Common Pagination Utilities

### File Structure

```
apps/web/lib/api/utils/
├── pagination.ts         # Core pagination utilities
├── sorting.ts            # Sorting utilities
└── types.ts              # Shared pagination types
```

### Core Utilities

**apps/web/lib/api/utils/types.ts:**

```typescript
import { Prisma } from '@prisma/client';

export type PaginationParams = {
  cursor?: number;
  limit?: number;
  sort?: string;
  dir?: string;
  search?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: number | null;
  hasMore: boolean;
  total?: number;
};

export type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSort?: Array<{ [key: string]: 'asc' | 'desc' }>;
  allowedSortColumns?: string[];
};

export type ParsedPagination = {
  take: number;
  skip?: number;
  cursor?: { id: number };
  orderBy: Array<{ [key: string]: 'asc' | 'desc' }>;
};
```

**apps/web/lib/api/utils/sorting.ts:**

```typescript
import { Prisma } from '@prisma/client';

/**
 * Parse sort and dir parameters into Prisma orderBy format
 *
 * @param sort - Comma-separated column names (e.g., "name,id")
 * @param dir - Comma-separated directions (e.g., "asc,desc")
 * @param allowedColumns - Whitelist of sortable columns (security)
 * @param defaultSort - Default sort if none provided
 * @returns Prisma orderBy array
 *
 * @example
 * parseSort("name,id", "asc,desc", ["name", "id", "createdAt"])
 * // Returns: [{ name: 'asc' }, { id: 'desc' }]
 */
export function parseSort(
  sort?: string,
  dir?: string,
  allowedColumns?: string[],
  defaultSort: Array<{ [key: string]: 'asc' | 'desc' }> = [{ id: 'desc' }]
): Array<{ [key: string]: 'asc' | 'desc' }> {
  if (!sort) return defaultSort;

  const columns = sort.split(',').map(s => s.trim()).filter(Boolean);
  const directions = dir ? dir.split(',').map(d => d.trim()).filter(Boolean) : [];

  const result: Array<{ [key: string]: 'asc' | 'desc' }> = [];

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i];

    // Security: Only allow whitelisted columns
    if (allowedColumns && !allowedColumns.includes(column)) {
      continue; // Skip invalid columns
    }

    // Get direction: use index if available, otherwise use last, otherwise default to 'asc'
    const direction = (directions[i] || directions[directions.length - 1] || 'asc') as 'asc' | 'desc';

    // Validate direction
    if (direction !== 'asc' && direction !== 'desc') {
      continue; // Skip invalid directions
    }

    result.push({ [column]: direction });
  }

  return result.length > 0 ? result : defaultSort;
}

/**
 * Parse legacy enum-based sort values for backward compatibility
 */
export function parseSortWithLegacy(
  sort?: string | number,
  dir?: string,
  allowedColumns?: string[]
): Array<{ [key: string]: 'asc' | 'desc' }> {
  // Check if it's a legacy enum value
  if (typeof sort === 'number' || (sort && !isNaN(Number(sort)))) {
    const enumValue = Number(sort);
    switch (enumValue) {
      case 0: return [{ id: 'desc' }];      // DateNewestFirst
      case 1: return [{ id: 'asc' }];       // DateOldestFirst
      case 2: return [{ name: 'asc' }];     // NameAZ
      case 3: return [{ name: 'desc' }];    // NameZA
      default: return [{ id: 'desc' }];
    }
  }

  // Use new column-based parsing
  return parseSort(sort as string, dir, allowedColumns);
}

/**
 * Convert Prisma orderBy to SQL-like string for debugging
 */
export function orderByToString(orderBy: Array<{ [key: string]: 'asc' | 'desc' }>): string {
  return orderBy
    .map(o => {
      const [key, dir] = Object.entries(o)[0];
      return `${key} ${dir.toUpperCase()}`;
    })
    .join(', ');
}
```

**apps/web/lib/api/utils/pagination.ts:**

```typescript
import { PaginationParams, PaginationOptions, ParsedPagination, PaginatedResponse } from './types';
import { parseSort, parseSortWithLegacy } from './sorting';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Parse pagination parameters from request query
 *
 * @param params - Query parameters from request
 * @param options - Pagination configuration options
 * @returns Parsed pagination ready for Prisma
 *
 * @example
 * const pagination = parsePagination(req.query, {
 *   defaultLimit: 20,
 *   maxLimit: 50,
 *   allowedSortColumns: ['name', 'id', 'createdAt']
 * });
 *
 * const results = await prisma.tag.findMany({
 *   take: pagination.take,
 *   skip: pagination.skip,
 *   cursor: pagination.cursor,
 *   orderBy: pagination.orderBy,
 * });
 */
export function parsePagination(
  params: PaginationParams,
  options: PaginationOptions = {}
): ParsedPagination {
  const {
    defaultLimit = DEFAULT_LIMIT,
    maxLimit = MAX_LIMIT,
    defaultSort = [{ id: 'desc' }],
    allowedSortColumns,
  } = options;

  // Parse limit
  let limit = defaultLimit;
  if (params.limit !== undefined) {
    const parsed = Number(params.limit);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, maxLimit);
    }
  }

  // Parse cursor
  const cursor = params.cursor !== undefined ? Number(params.cursor) : undefined;

  // Parse sort
  const orderBy = parseSort(
    params.sort,
    params.dir,
    allowedSortColumns,
    defaultSort
  );

  return {
    take: limit,
    skip: cursor ? 1 : undefined,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy,
  };
}

/**
 * Build paginated response with next cursor
 *
 * @param items - Array of results from database
 * @param limit - The limit used in the query
 * @returns Paginated response object
 *
 * @example
 * const pagination = parsePagination(req.query);
 * const tags = await prisma.tag.findMany({ ...pagination });
 * const response = buildPaginatedResponse(tags, pagination.take);
 *
 * return res.json({
 *   success: true,
 *   response: response,
 * });
 */
export function buildPaginatedResponse<T extends { id: number }>(
  items: T[],
  limit: number
): PaginatedResponse<T> {
  const hasMore = items.length === limit;
  const nextCursor = hasMore && items.length > 0
    ? items[items.length - 1].id
    : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

/**
 * Complete pagination helper - parse params and execute query
 *
 * @param params - Request query parameters
 * @param queryFn - Function that takes pagination config and returns results
 * @param options - Pagination options
 * @returns Paginated response
 *
 * @example
 * const result = await paginate(
 *   req.query,
 *   async (config) => {
 *     return await prisma.tag.findMany({
 *       ...config,
 *       where: { ownerId: userId },
 *       include: { _count: { select: { links: true } } },
 *     });
 *   },
 *   { allowedSortColumns: ['name', 'id', 'createdAt'] }
 * );
 *
 * return res.json({ success: true, response: result });
 */
export async function paginate<T extends { id: number }>(
  params: PaginationParams,
  queryFn: (config: ParsedPagination) => Promise<T[]>,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const pagination = parsePagination(params, options);
  const items = await queryFn(pagination);
  return buildPaginatedResponse(items, pagination.take);
}
```

## Migration Plan

### Phase 1: Add Utilities (Week 1)

**Tasks:**
1. Create `/apps/web/lib/api/utils/` directory
2. Implement `types.ts`, `sorting.ts`, `pagination.ts`
3. Write unit tests for utilities
4. Add documentation/examples

**Files to create:**
- `apps/web/lib/api/utils/types.ts`
- `apps/web/lib/api/utils/sorting.ts`
- `apps/web/lib/api/utils/pagination.ts`
- `apps/web/lib/api/utils/__tests__/sorting.test.ts`
- `apps/web/lib/api/utils/__tests__/pagination.test.ts`

**No breaking changes in this phase.**

### Phase 2: Migrate Tags Endpoint (Week 2)

**Rationale:** Start with tags as it's the highest priority (6000+ tags on production).

**Tasks:**

1. **Update getTags controller** (`apps/web/lib/api/controllers/tags/getTags.ts`):

```typescript
import { paginate } from '@/lib/api/utils/pagination';
import { TagPaginationParams } from '@/lib/api/utils/types';

export default async function getTags(
  userId: number,
  params: TagPaginationParams = {}
) {
  const POSTGRES_IS_ENABLED = process.env.DATABASE_URL?.startsWith("postgresql");

  const response = await paginate(
    params,
    async (pagination) => {
      return await prisma.tag.findMany({
        ...pagination,
        where: {
          OR: [
            { ownerId: userId },
            {
              links: {
                some: {
                  collection: {
                    members: { some: { userId } }
                  }
                }
              }
            }
          ],
          // Add search filter
          ...(params.search && {
            name: {
              contains: params.search,
              mode: POSTGRES_IS_ENABLED ? 'insensitive' : undefined,
            }
          }),
          // Add collection filter
          ...(params.collectionId && {
            links: { some: { collectionId: params.collectionId } }
          }),
        },
        include: {
          _count: { select: { links: true } },
        },
      });
    },
    {
      defaultLimit: 50,
      maxLimit: 100,
      allowedSortColumns: ['name', 'id', 'createdAt'],
      defaultSort: [{ name: 'asc' }],
    }
  );

  return { response, status: 200 };
}
```

2. **Update API endpoint** (`apps/web/pages/api/v1/tags/index.ts`):

```typescript
if (req.method === "GET") {
  const params: TagPaginationParams = {
    cursor: req.query.cursor ? Number(req.query.cursor) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    sort: req.query.sort as string,
    dir: req.query.dir as string,
    search: req.query.search as string,
    collectionId: req.query.collectionId ? Number(req.query.collectionId) : undefined,
  };

  const tags = await getTags(user.id, params);
  return res.status(tags?.status || 500).json({
    success: true,
    response: tags?.response,
  });
}
```

3. **Update types** (`packages/types/global.ts`):

```typescript
// Add to existing types
export type TagPaginationParams = {
  cursor?: number;
  limit?: number;
  sort?: string;
  dir?: string;
  search?: string;
  collectionId?: number;
};
```

4. **Test thoroughly:**
   - Basic pagination (cursor, limit)
   - Column-based sorting (name, id, createdAt)
   - Multi-column sorting (name,id with asc,desc)
   - Search filtering
   - Backward compatibility (if supporting legacy enum)

### Phase 3: Migrate Collections Endpoint (Week 3)

Similar approach to tags:

**Update getCollections controller:**

```typescript
export default async function getCollections(
  userId: number,
  params: CollectionPaginationParams = {}
) {
  const POSTGRES_IS_ENABLED = process.env.DATABASE_URL?.startsWith("postgresql");

  const response = await paginate(
    params,
    async (pagination) => {
      return await prisma.collection.findMany({
        ...pagination,
        where: {
          OR: [
            { ownerId: userId },
            { members: { some: { user: { id: userId } } } }
          ],
          ...(params.search && {
            name: {
              contains: params.search,
              mode: POSTGRES_IS_ENABLED ? 'insensitive' : undefined,
            }
          }),
        },
        include: {
          _count: { select: { links: true } },
          parent: { select: { id: true, name: true } },
          members: {
            include: {
              user: {
                select: { username: true, name: true, image: true }
              }
            }
          }
        },
      });
    },
    {
      allowedSortColumns: ['name', 'id', 'createdAt'],
      defaultSort: [{ name: 'asc' }],
    }
  );

  return { response, status: 200 };
}
```

### Phase 4: Migrate Remaining Endpoints (Week 4)

Apply same pattern to:
- `/api/v1/users` (getUsers)
- `/api/v1/tokens` (getTokens)
- `/api/v1/links/[id]/highlights` (getLinkHighlights)
- `/api/v1/public/collections/tags` (public getTags)

### Phase 5: Refactor Search/Links (Week 5)

**More complex due to Meilisearch integration:**

1. Keep dual pagination modes (offset for Meilisearch, cursor for Prisma)
2. Add column-based sorting support
3. Maintain backward compatibility with existing enum-based sorting
4. Update `searchLinks.ts` and `getLinks.ts` to use new utilities

**Example for searchLinks:**

```typescript
// Parse sort with legacy support
const orderBy = parseSortWithLegacy(
  query.sort,
  query.dir,
  ['name', 'id', 'createdAt', 'updatedAt']
);

// Use in Prisma query
const links = await prisma.link.findMany({
  take: query.limit || Number(process.env.PAGINATION_TAKE_COUNT) || 50,
  skip: query.cursor ? 1 : undefined,
  cursor: query.cursor ? { id: query.cursor } : undefined,
  orderBy,
  // ... rest of query
});
```

### Phase 6: Update Documentation (Week 6)

1. Update API documentation:
   - Document new query parameters (sort, dir, limit, search)
   - Provide migration guide for API consumers
   - Update all curl examples

2. Update files:
   - `doc/api/search-links.md`
   - `doc/api/get-tags.md`
   - Create new: `doc/api/get-collections.md`
   - Create new: `doc/api/pagination-guide.md`

3. Document deprecation timeline for enum-based sorting

## Example API Usage

### Tags Endpoint

```bash
# Basic pagination - first page
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?limit=20" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Response:
{
  "success": true,
  "response": {
    "items": [/* 20 tags */],
    "nextCursor": 20,
    "hasMore": true
  }
}

# Get next page
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?limit=20&cursor=20" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Sort by name ascending
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?sort=name&dir=asc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Multi-column sort: name ascending, then ID descending
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?sort=name,id&dir=asc,desc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Search for tags containing "react"
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?search=react" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Combined: search, sort, paginate
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?search=react&sort=name&dir=asc&limit=10" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Filter by collection
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/tags?collectionId=5&sort=name" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"
```

### Collections Endpoint

```bash
# Sort by link count descending (most links first)
# Note: Requires Prisma to support orderBy _count, or client-side sorting
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/collections?sort=name&dir=asc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Search for collections containing "work"
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/collections?search=work" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"
```

### Search/Links Endpoint (Backward Compatible)

```bash
# Legacy enum-based (still works)
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/search?sort=0&cursor=0" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# New column-based
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/search?sort=name&dir=asc&cursor=0" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"

# Multi-column sort
curl -X GET "${LINKWARDEN_BASE_URL}/api/v1/search?sort=createdAt,name&dir=desc,asc&limit=25" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}"
```

## Testing Strategy

### Unit Tests

**sorting.test.ts:**
```typescript
describe('parseSort', () => {
  it('should parse single column', () => {
    expect(parseSort('name', 'asc')).toEqual([{ name: 'asc' }]);
  });

  it('should parse multiple columns', () => {
    expect(parseSort('name,id', 'asc,desc')).toEqual([
      { name: 'asc' },
      { id: 'desc' }
    ]);
  });

  it('should use last direction for remaining columns', () => {
    expect(parseSort('name,id,createdAt', 'asc,desc')).toEqual([
      { name: 'asc' },
      { id: 'desc' },
      { createdAt: 'desc' }
    ]);
  });

  it('should default to asc when dir omitted', () => {
    expect(parseSort('name,id')).toEqual([
      { name: 'asc' },
      { id: 'asc' }
    ]);
  });

  it('should filter invalid columns with whitelist', () => {
    expect(parseSort('name,DROP TABLE,id', 'asc', ['name', 'id']))
      .toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  it('should return default when no sort provided', () => {
    expect(parseSort(undefined, undefined, undefined, [{ id: 'desc' }]))
      .toEqual([{ id: 'desc' }]);
  });
});

describe('parseSortWithLegacy', () => {
  it('should handle legacy enum values', () => {
    expect(parseSortWithLegacy(0)).toEqual([{ id: 'desc' }]);
    expect(parseSortWithLegacy(1)).toEqual([{ id: 'asc' }]);
    expect(parseSortWithLegacy(2)).toEqual([{ name: 'asc' }]);
    expect(parseSortWithLegacy(3)).toEqual([{ name: 'desc' }]);
  });

  it('should handle column-based sort', () => {
    expect(parseSortWithLegacy('name', 'asc')).toEqual([{ name: 'asc' }]);
  });
});
```

**pagination.test.ts:**
```typescript
describe('parsePagination', () => {
  it('should use default limit', () => {
    const result = parsePagination({});
    expect(result.take).toBe(50);
  });

  it('should respect max limit', () => {
    const result = parsePagination({ limit: 200 }, { maxLimit: 100 });
    expect(result.take).toBe(100);
  });

  it('should set cursor correctly', () => {
    const result = parsePagination({ cursor: 42 });
    expect(result.cursor).toEqual({ id: 42 });
    expect(result.skip).toBe(1);
  });

  it('should parse sort parameters', () => {
    const result = parsePagination(
      { sort: 'name,id', dir: 'asc,desc' },
      { allowedSortColumns: ['name', 'id'] }
    );
    expect(result.orderBy).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });
});

describe('buildPaginatedResponse', () => {
  it('should set hasMore true when items equal limit', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = buildPaginatedResponse(items, 3);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(3);
  });

  it('should set hasMore false when items less than limit', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = buildPaginatedResponse(items, 3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe(null);
  });

  it('should handle empty results', () => {
    const result = buildPaginatedResponse([], 10);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBe(null);
    expect(result.items).toEqual([]);
  });
});
```

### Integration Tests

**Test with production database:**

```bash
# Test tags pagination
curl -s "${LINKWARDEN_BASE_URL}/api/v1/tags?limit=10&sort=name&dir=asc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}" | \
  jq '{itemCount: (.response.items | length), nextCursor: .response.nextCursor, hasMore: .response.hasMore}'

# Test that cursor works
curl -s "${LINKWARDEN_BASE_URL}/api/v1/tags?limit=10&cursor=10&sort=name&dir=asc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}" | \
  jq '{itemCount: (.response.items | length), firstItemId: .response.items[0].id}'

# Test search
curl -s "${LINKWARDEN_BASE_URL}/api/v1/tags?search=react" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}" | \
  jq '.response.items[] | select(.name | contains("react") | not)'
# Should return empty if search works correctly

# Test multi-column sort
curl -s "${LINKWARDEN_BASE_URL}/api/v1/tags?sort=name,id&dir=asc,desc&limit=5" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}" | \
  jq '.response.items | map(.name)'
# Should be sorted alphabetically

# Test invalid column (should be ignored)
curl -s "${LINKWARDEN_BASE_URL}/api/v1/tags?sort=malicious_column&dir=asc" \
  -H "Authorization: Bearer ${LINKWARDEN_TOKEN}" | \
  jq .success
# Should still succeed with default sort
```

## Security Considerations

### 1. Column Whitelist

**Problem:** User-provided column names in sort parameter could cause SQL injection or expose private columns.

**Solution:** Always use allowedSortColumns whitelist:

```typescript
const allowedSortColumns = ['name', 'id', 'createdAt', 'updatedAt'];
const orderBy = parseSort(query.sort, query.dir, allowedSortColumns);
```

**Never allow:**
- Unvalidated column names directly in Prisma queries
- Sorting by sensitive columns (password, token, etc.)
- Sorting by computed/virtual columns not in database

### 2. Limit Bounds

**Problem:** User could request limit=999999 causing performance issues.

**Solution:** Enforce maximum limit:

```typescript
const MAX_LIMIT = 100;
const limit = Math.min(Number(query.limit) || 50, MAX_LIMIT);
```

### 3. Search Parameter Sanitization

**Problem:** Search parameter could contain malicious input.

**Solution:** Prisma parameterization handles this, but:
- Use `mode: 'insensitive'` for case-insensitive search (only PostgreSQL)
- Never use raw SQL with search parameter
- Consider rate limiting search endpoints

### 4. Public Endpoints

**Problem:** Public endpoints (/api/v1/public/*) should not expose private data.

**Solution:** Always filter by `isPublic: true`:

```typescript
where: {
  collection: {
    id: collectionId,
    isPublic: true, // CRITICAL
  },
}
```

## Performance Considerations

### 1. Database Indexes

**Add indexes for commonly sorted columns:**

```prisma
// In schema.prisma
model Tag {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())

  @@index([name]) // For sort=name
  @@index([createdAt]) // For sort=createdAt
  @@index([name, id]) // For sort=name,id
}

model Collection {
  id        Int      @id @default(autoincrement())
  name      String
  createdAt DateTime @default(now())

  @@index([name])
  @@index([createdAt])
  @@index([name, id])
}
```

**After adding indexes, run migration:**
```bash
npx prisma migrate dev --name add_pagination_indexes
```

### 2. Count Queries

**Problem:** `total` count is expensive for large tables.

**Solution:** Make it optional and cache:

```typescript
export async function paginateWithCount<T extends { id: number }>(
  params: PaginationParams,
  queryFn: (config: ParsedPagination) => Promise<T[]>,
  countFn?: () => Promise<number>,
  options: PaginationOptions = {}
): Promise<PaginatedResponse<T>> {
  const pagination = parsePagination(params, options);

  const [items, total] = await Promise.all([
    queryFn(pagination),
    params.includeTotal ? (countFn?.() || Promise.resolve(undefined)) : Promise.resolve(undefined),
  ]);

  return {
    ...buildPaginatedResponse(items, pagination.take),
    total,
  };
}
```

**Usage:**
```bash
# Only include total when needed (expensive)
curl "${LINKWARDEN_BASE_URL}/api/v1/tags?includeTotal=true"
```

### 3. Meilisearch Optimization

**For searchLinks endpoint:**

- Continue using offset-based pagination for Meilisearch results
- Cursor-based pagination for Prisma fallback
- Cache Meilisearch results when possible

### 4. Connection Pooling

**Ensure Prisma connection pool is properly configured:**

```env
# In .env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=20"
```

## Edge Cases and Limitations

### 1. Cursor Instability with Non-Unique Sorts

**Problem:** If sorting by non-unique column (e.g., `name`), cursor pagination may skip/duplicate records if items are inserted/deleted between requests.

**Solution:** Always include `id` as secondary sort:

```typescript
// Bad: sort=name only
const orderBy = [{ name: 'asc' }];

// Good: sort=name,id ensures stable cursor
const orderBy = [{ name: 'asc' }, { id: 'desc' }];
```

**Enforce in utility:**
```typescript
export function parseSort(/* ... */): Array<{ [key: string]: 'asc' | 'desc' }> {
  const result = /* parsing logic */;

  // Always add id if not present
  const hasId = result.some(o => 'id' in o);
  if (!hasId) {
    result.push({ id: 'desc' });
  }

  return result;
}
```

### 2. Deleted Items During Pagination

**Problem:** If items are deleted while paginating, cursor may become invalid.

**Solution:** Gracefully handle missing cursor:

```typescript
try {
  const items = await prisma.tag.findMany({
    cursor: { id: cursor },
    // ...
  });
} catch (error) {
  if (error.code === 'P2025') { // Cursor not found
    // Restart from beginning or return empty
    return { items: [], nextCursor: null, hasMore: false };
  }
  throw error;
}
```

### 3. Very Large Datasets

**Problem:** Offset-based pagination becomes slow for large offsets (e.g., page 1000).

**Solution:** Cursor-based pagination is already efficient, but for Meilisearch:

- Consider using `search_after` if Meilisearch supports it
- Limit maximum cursor value
- Document that deep pagination is not recommended (use search instead)

### 4. Ordering by _count

**Problem:** Prisma has bugs with `orderBy: { relation: { _count: 'desc' } }` when combined with complex WHERE clauses (see get-tags-sorting-issue.md).

**Solution:**
- **Short-term:** Client-side sorting for link counts
- **Long-term:** Denormalized `linkCount` column with triggers/scheduled updates

**Alternative workaround:**
```typescript
// Fetch all, then sort client-side (only viable for <1000 records)
const tags = await prisma.tag.findMany({
  where: /* ... */,
  include: { _count: { select: { links: true } } },
});

if (params.sort === 'linkCount') {
  tags.sort((a, b) => {
    const order = params.dir === 'asc' ? 1 : -1;
    return (a._count.links - b._count.links) * order;
  });
}

// Then apply pagination manually
const start = params.cursor || 0;
const paginated = tags.slice(start, start + limit);
```

## Backward Compatibility Matrix

| Feature | Old API | New API | Compatible? |
|---------|---------|---------|-------------|
| Sort by date (newest) | `sort=0` | `sort=id&dir=desc` | ✅ Both work |
| Sort by name A-Z | `sort=2` | `sort=name&dir=asc` | ✅ Both work |
| Cursor pagination | `cursor=123` | `cursor=123` | ✅ Same |
| Page size | Env var only | `limit=50` | ✅ Env var is default |
| Response format | `{response: T[]}` | `{response: {items: T[], nextCursor, hasMore}}` | ⚠️ Breaking change |

**Migration Strategy for Response Format:**

```typescript
// Support both via query param or header
const useNewFormat = req.query.v === '2' || req.headers['x-api-version'] === '2';

if (useNewFormat) {
  return res.json({
    success: true,
    response: paginatedResponse, // { items, nextCursor, hasMore }
  });
} else {
  // Legacy format
  return res.json({
    response: paginatedResponse.items, // Array directly
  });
}
```

**Deprecation Timeline:**
1. **Phase 1 (Months 1-3):** Support both formats, new format opt-in
2. **Phase 2 (Months 4-6):** New format is default, old format opt-in
3. **Phase 3 (Month 7+):** Remove old format support

## Open Questions

1. **Total Count:**
   - Should we include total count in paginated responses?
   - Only on demand (query param)?
   - Cache strategy?

2. **Cursor Format:**
   - Continue using numeric ID as cursor?
   - Or switch to opaque cursor (base64-encoded JSON with sort state)?

3. **Response Format Breaking Change:**
   - When to enforce new format?
   - Should we version the API (/api/v2)?

4. **Frontend Impact:**
   - How many frontend components use these endpoints?
   - Effort to update all consumers?

5. **Meilisearch Alignment:**
   - Can we unify offset-based (Meilisearch) and cursor-based (Prisma) pagination?
   - Should search endpoint behave differently than others?

## References

- **Internal Documentation:**
  - [Search API Documentation](../api/search-links.md)
  - [Get Tags API Documentation](../api/get-tags.md)
  - [Get Tags Sorting Issue](./get-tags-sorting-issue.md)
  - [Search API Pagination Test Report](../tests/search-api-pagination-test-report.md)

- **External Documentation:**
  - [Prisma Pagination](https://www.prisma.io/docs/orm/prisma-client/queries/pagination)
  - [Cursor vs Offset Pagination](https://www.prisma.io/docs/orm/prisma-client/queries/pagination#cursor-versus-offset-pagination)
  - [Prisma orderBy](https://www.prisma.io/docs/orm/reference/prisma-client-reference#orderby)

- **Prisma Issues:**
  - [#14598: orderBy _count doesn't respect WHERE](https://github.com/prisma/prisma/issues/14598)
  - [#6824: Zero count ordering bug](https://github.com/prisma/prisma/issues/6824)

- **Source Files:**
  - `apps/web/lib/api/controllers/search/searchLinks.ts:21-250` - Reference pagination implementation
  - `apps/web/lib/api/controllers/tags/getTags.ts:10-57` - Needs pagination
  - `apps/web/lib/api/controllers/collections/getCollections.ts:1-36` - Needs pagination
  - `packages/types/global.ts:81-97` - Current types

## Conclusion

This unified pagination system will:

✅ Eliminate code duplication across 12+ endpoints
✅ Provide flexible column-based sorting instead of rigid enums
✅ Support multi-column sorting with directional control
✅ Add search/filter capabilities to all list endpoints
✅ Maintain backward compatibility during transition
✅ Align with Prisma ORM best practices
✅ Improve API developer experience
✅ Scale to handle large datasets (6000+ tags, 2000+ links)

**Estimated Implementation Time:**
- Utilities + Tests: 1 week
- Tags Migration: 1 week
- Collections Migration: 1 week
- Other Endpoints: 1 week
- Search/Links Refactor: 1 week
- Documentation: 1 week
- **Total: 6 weeks**

**Next Steps:**
1. Review and approve this design
2. Create GitHub issues for each phase
3. Assign developers to phases
4. Begin Phase 1 (utilities implementation)
