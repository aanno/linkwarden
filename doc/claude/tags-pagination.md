# Tags Pagination Implementation Summary

## Overview

This document summarizes the implementation of unified pagination for the Linkwarden tags API endpoint, completed as Phase 1 and Phase 2 of the broader pagination migration plan documented in `doc/instructions/pagination.md`.

## What Was Implemented

### Phase 1: Core Utilities (Reusable Infrastructure)

Created three new utility modules with comprehensive TypeScript types and helper functions:

**1. `apps/web/lib/api/utils/types.ts`**
- TypeScript type definitions for pagination system
- `PaginationParams`: Input parameters (cursor, limit, sort, dir, search)
- `PaginatedResponse<T>`: Standardized response format (items, nextCursor, hasMore, total?)
- `ParsedPagination`: Prisma-compatible query config
- `TagPaginationParams`: Extended params for tags endpoint

**2. `apps/web/lib/api/utils/sorting.ts`**
- `parseSort()`: Converts column-based sorting to Prisma orderBy format
  - Example: `sort=name,id&dir=asc,desc` → `[{name: 'asc'}, {id: 'desc'}]`
  - Security: Column whitelist filtering prevents SQL injection
  - Stability: Always includes `id` column for cursor pagination
- `parseSortWithLegacy()`: Backward compatibility with enum values (0-3)
- `orderByToString()`: Debug helper for SQL-like output

**3. `apps/web/lib/api/utils/pagination.ts`**
- `parsePagination()`: All-in-one parser for pagination params
  - Validates and bounds limit (default: 50, max: 100)
  - Parses cursor for Prisma's `cursor: {id: value}, skip: 1` pattern
  - Delegates to parseSort() for orderBy configuration
- `buildPaginatedResponse()`: Formats results with nextCursor and hasMore
- `paginate()`: High-level helper combining parse + query + format

### Phase 2: Tags Endpoint Migration

**Modified Files:**

**1. `apps/web/lib/api/controllers/tags/getTags.ts`**
- Complete refactor to use pagination utilities
- Added search parameter: `search=react` filters tags by name (case-insensitive on PostgreSQL)
- Uses `paginate()` helper for clean implementation
- Configured allowed sort columns: `['name', 'id', 'createdAt']`
- Default sort: `name ASC`
- **Note**: Link count sorting excluded due to Prisma bug (see `doc/instructions/get-tags-sorting-issue.md`)

**2. `apps/web/pages/api/v1/tags/index.ts`**
- Added query parameter parsing: cursor, limit, sort, dir, search, collectionId
- Passes structured `TagPaginationParams` to getTags()

**3. `apps/web/pages/api/v1/public/collections/tags/index.ts`**
- Updated public tags endpoint with direct paginate() implementation
- Different WHERE clause (no userId) from private endpoint

## API Usage Examples

### Basic Pagination
```bash
GET /api/v1/tags?limit=10
# Returns first 10 tags (default: name ASC)

GET /api/v1/tags?cursor=42&limit=10
# Returns next 10 tags after ID 42
```

### Sorting
```bash
# Single column
GET /api/v1/tags?sort=name&dir=desc

# Multi-column (name ASC, then ID DESC for ties)
GET /api/v1/tags?sort=name,id&dir=asc,desc

# By creation date (newest first)
GET /api/v1/tags?sort=createdAt&dir=desc
```

### Search
```bash
# Case-insensitive search (PostgreSQL)
GET /api/v1/tags?search=react

# Combine search + sort
GET /api/v1/tags?search=ai&sort=name&dir=asc&limit=20
```

### Response Format
```json
{
  "success": true,
  "response": {
    "items": [
      {"id": 11, "name": "AI", "_count": {"links": 2}, ...},
      {"id": 30, "name": "Ai Analytics", "_count": {"links": 1}, ...}
    ],
    "nextCursor": 35,
    "hasMore": true
  }
}
```

## Testing

### Test Suite (76 total tests)

**Sorting Tests (50 tests)** - `apps/web/lib/api/utils/__tests__/sorting.test.ts`
- `parseSort()`: 12 tests (single/multi-column, whitelist, edge cases)
- `parseSortWithLegacy()`: 9 tests (backward compatibility)
- `orderByToString()`: 5 tests (debug output)
- **Multi-column Integration**: 24 tests
  - Two/three/four-column combinations with mixed directions
  - Direction count edge cases (more/fewer directions than columns)
  - Whitelist filtering with multi-column
  - Real-world scenarios (tags, collections, users)
  - Stability and consistency (idempotent, cursor stability)

**Pagination Tests (26 tests)** - `apps/web/lib/api/utils/__tests__/pagination.test.ts`
- `parsePagination()`: 13 tests (limits, cursor, error handling)
- `buildPaginatedResponse()`: 6 tests (hasMore detection)
- `buildPaginatedResponseWithCount()`: 2 tests (total count)
- `paginate()`: 5 tests (integration, error propagation)

### Running Tests
```bash
# From workspace root
yarn test                    # All tests
yarn web:test:watch          # Watch mode
yarn web:test:coverage       # Coverage report

# From apps/web directory
yarn jest                    # All tests
yarn jest sorting.test.ts    # Specific file
```

## Manual Verification

All API endpoints were manually verified with curl:
- ✅ Basic pagination with cursor
- ✅ Multi-column sorting (2, 3, and 4 columns)
- ✅ Search parameter (case-insensitive)
- ✅ Combined search + sorting
- ✅ Limit enforcement (max 100)
- ✅ Empty results handling
- ✅ Edge cases (invalid search terms, excessive limits)

## Key Design Decisions

1. **Column-based sorting** instead of enum values for flexibility and clarity
2. **Cursor pagination** using Prisma's native `cursor: {id}` pattern for efficiency
3. **Security-first**: Column whitelist filtering prevents SQL injection
4. **Cursor stability**: Always include `id` in orderBy to prevent skipped/duplicate records
5. **Type safety**: Comprehensive TypeScript types throughout
6. **Reusability**: Generic utilities work for any entity (tags, collections, users, etc.)
7. **Backward compatibility**: `parseSortWithLegacy()` supports existing enum values
8. **Search simplicity**: Basic LIKE/CONTAINS search, not advanced Meilisearch syntax

## Known Limitations

1. **Link count sorting disabled** - Prisma bug with `orderBy: {links: {_count: 'desc'}}` on complex WHERE clauses (see `doc/instructions/get-tags-sorting-issue.md`)
2. **Case-insensitive search** - Only works on PostgreSQL; case-sensitive on other databases
3. **Search on name only** - Does not search other fields (by design for tags)

## Next Steps (Future Phases)

- **Phase 3**: Collections endpoint pagination
- **Phase 4**: Users endpoint pagination
- **Phase 5**: Public endpoints migration
- **Phase 6**: Legacy endpoint migration with backward compatibility

See `doc/instructions/pagination.md` for complete migration plan.

## References

- Design Document: `doc/instructions/pagination.md`
- Testing Guide: `doc/claude/testing.md`
- Prisma Bug Report: `doc/instructions/get-tags-sorting-issue.md`
- Test Script: `scripts/test-tags-pagination.sh`
