# Get Tags API

Retrieves a list of tags and their associated metadata for the authenticated user.

## Endpoint

```
GET /api/v1/tags
```

## Authentication

**Required.** This endpoint requires authentication via session cookie or API key.

## Query Parameters

**None.** This endpoint does not accept any query parameters. Tags are automatically filtered based on the authenticated user's permissions.

## Tag Filtering

The API returns tags based on the following criteria:

- **Tags owned by the user**: All tags created by the authenticated user
- **Tags from shared collections**: Tags from collections where the user is a member

This ensures users only see tags they have access to through ownership or collaboration.

**Source:** `apps/web/lib/api/controllers/tags/getTags.ts:10-42`

## Pagination

**Not implemented.** This endpoint returns all accessible tags in a single response without pagination. For users with a large number of tags, all tags will be returned at once.

## Sorting

**Not implemented.** Tags are returned in database order. There is no sorting capability at this time.

> **Note:** The source code contains a commented-out sorting implementation that would sort tags by link count in descending order. This may be enabled in a future version.
>
> **Source:** `apps/web/lib/api/controllers/tags/getTags.ts:35-39`

## Response

### Success Response (200 OK)

```json
{
  "response": [
    {
      "id": 1,
      "name": "programming",
      "ownerId": 42,
      "createdAt": "2024-12-01T00:00:00.000Z",
      "updatedAt": "2024-12-01T00:00:00.000Z",
      "_count": {
        "links": 15
      }
    },
    {
      "id": 2,
      "name": "design",
      "ownerId": 42,
      "createdAt": "2024-12-01T12:00:00.000Z",
      "updatedAt": "2024-12-02T08:30:00.000Z",
      "_count": {
        "links": 8
      }
    }
  ]
}
```

### Unauthorized Response (401)

Returned when the user is not authenticated.

```json
{
  "error": "Unauthorized"
}
```

## Response Fields

### Root Object

| Field | Type | Description |
|-------|------|-------------|
| `response` | array | Array of tag objects |

### Tag Object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | integer | No | Unique identifier for the tag |
| `name` | string | No | Tag name |
| `ownerId` | integer | No | ID of the user who created the tag |
| `createdAt` | string (datetime) | No | Timestamp when the tag was created (ISO 8601 format) |
| `updatedAt` | string (datetime) | No | Timestamp when the tag was last updated (ISO 8601 format) |
| `_count` | object | No | Object containing count statistics |
| `_count.links` | integer | No | Number of links associated with this tag |

## Examples

### Example 1: Get All Tags

```bash
curl -X GET "https://your-instance.com/api/v1/tags" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "response": [
    {
      "id": 1,
      "name": "javascript",
      "ownerId": 10,
      "createdAt": "2024-11-01T10:00:00.000Z",
      "updatedAt": "2024-11-01T10:00:00.000Z",
      "_count": {
        "links": 23
      }
    },
    {
      "id": 5,
      "name": "tutorial",
      "ownerId": 10,
      "createdAt": "2024-11-05T14:30:00.000Z",
      "updatedAt": "2024-11-08T09:15:00.000Z",
      "_count": {
        "links": 12
      }
    },
    {
      "id": 8,
      "name": "documentation",
      "ownerId": 15,
      "createdAt": "2024-10-20T08:00:00.000Z",
      "updatedAt": "2024-11-01T16:45:00.000Z",
      "_count": {
        "links": 7
      }
    }
  ]
}
```

### Example 2: Using with Session Cookie (Browser)

```javascript
fetch('https://your-instance.com/api/v1/tags', {
  method: 'GET',
  credentials: 'include', // Include session cookie
  headers: {
    'Content-Type': 'application/json'
  }
})
  .then(response => response.json())
  .then(data => {
    console.log('Tags:', data.response);
    
    // Calculate total number of links across all tags
    const totalLinks = data.response.reduce((sum, tag) => sum + tag._count.links, 0);
    console.log('Total links:', totalLinks);
  });
```

### Example 3: Processing Tags Client-Side

Since there's no server-side sorting or filtering, you can process tags on the client:

```javascript
const response = await fetch('https://your-instance.com/api/v1/tags', {
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' }
});
const data = await response.json();

// Sort tags by link count (descending)
const tagsByPopularity = data.response.sort((a, b) => 
  b._count.links - a._count.links
);

// Sort tags alphabetically
const tagsByName = data.response.sort((a, b) => 
  a.name.localeCompare(b.name)
);

// Filter tags with more than 10 links
const popularTags = data.response.filter(tag => tag._count.links > 10);

// Get only tag names
const tagNames = data.response.map(tag => tag.name);
```

### Example 4: Error Handling

```bash
# Request without authentication
curl -X GET "https://your-instance.com/api/v1/tags"
```

**Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

## Use Cases

### Common Use Cases

1. **Displaying tag cloud**: Use `_count.links` to determine tag size/importance
2. **Tag autocomplete**: Provide tag suggestions when creating/editing links
3. **Tag management interface**: Show all user tags with usage statistics
4. **Filtering links by tag**: Get available tags to build filter UI

### Tag Visibility

Tags returned by this endpoint include:

- **Own tags**: All tags created by the authenticated user
- **Shared tags**: Tags from collections the user is a member of (but not the owner)

This means:
- A tag with `ownerId` matching the authenticated user's ID is owned by them
- A tag with a different `ownerId` comes from a shared collection

## Performance Considerations

### No Pagination

Since this endpoint returns all tags at once:

- **Small datasets**: Fast and efficient for most users
- **Large datasets**: Users with hundreds of tags may experience slower response times
- **Network usage**: Entire tag list is transferred in one request

### Optimization Tips

If you have many tags:

1. **Cache the response**: Tags don't change frequently, cache on the client-side
2. **Lazy loading**: Fetch tags only when needed (e.g., when user opens tag selector)
3. **Debounce requests**: Don't refetch tags unnecessarily

## Notes

- All tags are returned in a single response without pagination
- Tags are not sorted by default (database order)
- The `_count.links` field shows how many links use this tag
- Tags from shared collections are included based on collection membership
- No filtering or search parameters are available
- Response structure uses `response` field (not `data` like other endpoints)

## Related Endpoints

- **POST /api/v1/tags** - Create or update tags
- **DELETE /api/v1/tags** - Bulk delete tags
- **GET /api/v1/search** - Search links and filter by `tagId`

## Implementation Reference

- **API Endpoint:** `apps/web/pages/api/v1/tags/index.ts:12-18`
- **Controller:** `apps/web/lib/api/controllers/tags/getTags.ts`
  - Main logic: Lines 10-42 (userId filtering)
  - Collection-based filtering: Lines 43-57 (not exposed via API)
  - Commented sorting: Lines 35-39
- **Schema Validation:** `packages/lib/schemaValidation` (for POST/DELETE methods)

## Future Enhancements

Based on the source code, potential future features may include:

1. **Sorting by link count**: Currently commented out in the code
2. **Collection-based filtering**: The controller supports `collectionId` parameter but it's not exposed via the API endpoint
3. **Pagination**: For users with large tag collections
4. **Search/filter**: To find specific tags by name
