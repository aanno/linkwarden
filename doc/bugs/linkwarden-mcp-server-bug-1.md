# Bug Report: Linkwarden MCP Server - Response Size Exceeds Token Limits

## Bug Information

**Repository:** https://github.com/irfansofyana/linkwarden-mcp-server
**Severity:** High - Makes the MCP server unusable for moderate to large Linkwarden instances
**Affected Tools:** `get_all_links`, `search_links`
**Date Reported:** 2025-01-09

## Summary

The Linkwarden MCP server returns responses that exceed token limits (25,000 tokens) even with small datasets, making it unusable for instances with more than a handful of links. The tools lack proper pagination controls and return excessive data per link.

## Environment

- **Linkwarden Instance:** 2000+ links, 6000+ tags
- **MCP Server:** https://github.com/irfansofyana/linkwarden-mcp-server
- **Client:** Claude Code (Anthropic)
- **Token Limit:** 25,000 tokens per MCP tool response

## Problem Description

### Issue 1: Response Size Too Large

Even when filtering to the smallest collection (46 links), the response size is **111,141 tokens**, which is **4.4x over the 25,000 token limit**.

```
Error: MCP tool "get_all_links" response (111141 tokens) exceeds maximum
allowed tokens (25000). Please use pagination, filtering, or limit
parameters to reduce the response size.
```

### Issue 2: Missing `limit` Parameter

The MCP tools do not expose a `limit`, `count`, or `pageSize` parameter to control how many links are returned per request.

**Current parameters available:**
```typescript
get_all_links({
  cursor?: number,
  collectionId?: number,
  tagId?: number,
  pinnedOnly?: boolean,
  searchQueryString?: string,
  searchByName?: boolean,
  searchByUrl?: boolean,
  searchByDescription?: boolean,
  searchByTextContent?: boolean,
  searchByTags?: boolean,
  sort?: number
})
```

**Missing:** `limit` or `count` parameter

### Issue 3: Returns Full Link Objects with Heavy Fields

Each link object includes:
- Full `textContent` (can be thousands of characters)
- Complete tag arrays
- Full collection details
- All metadata fields

This makes even a small number of links (10-20) generate enormous responses.

## Steps to Reproduce

1. Set up Linkwarden instance with 100+ links
2. Connect MCP server to the instance
3. Call `get_all_links` with any parameters:
   ```typescript
   mcp__linkwarden__get_all_links({
     collectionId: 5,  // Collection with 46 links
     cursor: 0
   })
   ```
4. Observe error: Response exceeds 25,000 token limit

## Expected Behavior

1. **Small default page size:** Return 10-20 links per page by default (not 50+)
2. **Expose `limit` parameter:** Allow clients to control page size
3. **Omit heavy fields:** Exclude `textContent` from responses by default
4. **Respect token limits:** Ensure responses stay under 25k tokens

## Actual Behavior

- Returns 50+ links per page (based on Linkwarden's `PAGINATION_TAKE_COUNT`)
- Includes full `textContent` and all metadata
- No way to control page size from client
- Response size: 46 links = 111,141 tokens (4.4x over limit)

## Impact

**Critical for adoption:**
- MCP server is **unusable** for any Linkwarden instance with more than ~10 links
- Cannot test pagination properly
- Cannot browse links through MCP
- Severely limits usefulness of the integration

## Root Cause Analysis

### 1. No Client-Side Limit Control

The MCP server calls the Linkwarden API but doesn't expose the ability to control page size. The server-side `PAGINATION_TAKE_COUNT` environment variable (default: 50) is too large for MCP usage.

### 2. Includes TextContent

The Linkwarden web API explicitly omits `textContent` in responses:

**Source:** `apps/web/lib/api/controllers/search/searchLinks.ts:126-128`
```typescript
omit: {
  textContent: true,
},
```

The MCP server should do the same, but it appears to return the full objects.

### 3. Token Budget Not Considered

MCP responses have strict token limits (25k). A single link with:
- Long `textContent` (~5000 chars)
- Multiple tags (10+ tags)
- Full collection details

Can easily consume 2000-3000 tokens per link.

**Math:**
- 50 links × 2500 tokens/link = **125,000 tokens**
- This is **5x over the limit**

## Proposed Solutions

### Solution 1: Add `limit` Parameter (Required)

Add a `limit` parameter to control page size:

```typescript
get_all_links({
  cursor?: number,
  limit?: number,  // NEW: Default to 10, max 50
  collectionId?: number,
  // ... other params
})
```

**Implementation:**
```typescript
// In MCP server code
const limit = Math.min(args.limit || 10, 50); // Default 10, max 50
const params = new URLSearchParams();
if (cursor !== undefined) params.set('cursor', cursor.toString());
// ... other params

const response = await fetch(`${baseUrl}/api/v1/links?${params}`);
```

But wait - the Linkwarden API doesn't expose a `limit` parameter either! It only uses the server-side `PAGINATION_TAKE_COUNT`.

**So the MCP server needs to:**
1. Fetch from the API (gets up to 50 links based on server config)
2. Slice the results to respect the `limit` parameter
3. Adjust `nextCursor` accordingly

```typescript
let links = apiResponse.data.links;
const requestedLimit = Math.min(args.limit || 10, 50);

if (links.length > requestedLimit) {
  links = links.slice(0, requestedLimit);
  // Adjust nextCursor to the ID of the last returned link
  nextCursor = links[links.length - 1].id;
}
```

### Solution 2: Omit Heavy Fields (Required)

Strip out `textContent` and other heavy fields before returning:

```typescript
const sanitizedLinks = links.map(link => ({
  id: link.id,
  name: link.name,
  url: link.url,
  description: link.description,
  type: link.type,
  collectionId: link.collectionId,
  createdAt: link.createdAt,
  updatedAt: link.updatedAt,
  tags: link.tags,
  collection: {
    id: link.collection.id,
    name: link.collection.name,
    color: link.collection.color,
  },
  // Omit: textContent, preview, image, pdf, readable, monolith
}));
```

**Rationale:** The web API already does this - the MCP server should follow the same pattern.

### Solution 3: Reduce Default Page Size (Required)

Change the default behavior to request fewer links:

```typescript
const defaultLimit = 10; // Instead of using server's PAGINATION_TAKE_COUNT
```

Since the MCP server can't control the API's page size directly, it should:
1. Fetch a page from the API (up to 50 links)
2. Return only the first 10 (or user-specified limit)
3. Track pagination state correctly

### Solution 4: Add `fields` Parameter (Optional)

Allow clients to specify which fields they want:

```typescript
get_all_links({
  // ... existing params
  fields?: string[],  // e.g., ['id', 'name', 'url', 'tags']
})
```

This gives clients full control but adds complexity.

## Comparison with Web API

The Linkwarden web API handles this correctly:

**File:** `apps/web/lib/api/controllers/search/searchLinks.ts`

```typescript
const links = await prisma.link.findMany({
  take: paginationTakeCount,  // 50 by default
  // ...
  omit: {
    textContent: true,  // ✅ Excludes heavy field
  },
  include: {
    tags: true,
    collection: true,
    pinnedBy: { /* ... */ },
  },
  orderBy: order,
});
```

The MCP server should follow this exact pattern.

## Example: Working Request

With the proposed fixes, this should work:

```typescript
// Request
mcp__linkwarden__get_all_links({
  collectionId: 5,
  cursor: 0,
  limit: 10  // NEW parameter
})

// Response (approximately 2,000-3,000 tokens)
{
  "response": [
    {
      "id": 123,
      "name": "Example Link",
      "url": "https://example.com",
      "description": "...",
      "type": "url",
      "collectionId": 5,
      "tags": [...],
      "collection": { "id": 5, "name": "ai-scala" }
      // textContent omitted
    },
    // ... 9 more links
  ],
  "nextCursor": 456
}
```

## Token Budget Calculation

### Current Behavior (Broken)

```
46 links × 2,500 tokens/link = 115,000 tokens
Result: 4.6x over limit ❌
```

### With Proposed Fixes

```
10 links × 250 tokens/link (no textContent) = 2,500 tokens
Result: Within limit ✅
```

## Testing Recommendations

After implementing fixes, test with:

1. **Small dataset:** 10 links, verify response < 5k tokens
2. **Medium dataset:** 50 links (with limit=10), verify pagination works
3. **Large dataset:** 1000+ links, verify cursor-based pagination
4. **Edge cases:**
   - Links with long descriptions
   - Links with many tags (10+)
   - Links with no tags
   - Empty collections

## Priority

**High Priority** - This bug makes the MCP server unusable for any real-world Linkwarden instance.

## Related Issues

- Linkwarden core API lacks `limit` parameter (see `doc/instructions/get-tags-pagination.md` for similar discussion)
- MCP token limits are documented at: https://docs.anthropic.com/en/docs/model-context-protocol

## Workaround

**Current workaround:** None available. Users cannot use the MCP server with instances that have more than ~10 links.

**Temporary mitigation:**
1. Use very specific filters (collectionId, tagId) to reduce result sets
2. Keep Linkwarden instance small (< 20 links) for MCP testing

## References

### Linkwarden Code References

- **Search API implementation:** `apps/web/lib/api/controllers/search/searchLinks.ts`
- **Link type definition:** `packages/types/global.ts`
- **Web API endpoint:** `apps/web/pages/api/v1/search/index.ts`

### MCP Server Repository

- **Repository:** https://github.com/irfansofyana/linkwarden-mcp-server
- **Issue:** (To be created after review)

## Suggested Pull Request

The fix should include:

1. Add `limit` parameter to tool definitions
2. Implement client-side slicing of results
3. Strip `textContent` and heavy fields from responses
4. Update documentation with pagination examples
5. Add tests for token limits

**Files to modify:**
- `src/index.ts` (or main server file)
- Tool definitions
- README.md (document `limit` parameter)

## Additional Notes

This issue was discovered during documentation work on Linkwarden's pagination implementation. The core Linkwarden API works correctly - this is specifically an issue with the MCP server wrapper.

The MCP server should be considered **in alpha/beta state** until this critical issue is resolved.

---

**Reported by:** Claude Code user (via documentation analysis)
**Date:** 2025-01-09
**Affected Versions:** Current (as of 2025-01-09)
