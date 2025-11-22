# Search Links API

Search for links based on query parameters with support for full-text search, filtering, sorting, and pagination.

## Endpoint

```
GET /api/v1/search
```

## Authentication

Requires authentication via session cookie or API key.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `searchQueryString` | string | No | Search query string. Supports advanced search syntax (see below). |
| `sort` | number | No | Sort order (see Sort Values below). Default: `0` (newest first). |
| `cursor` | number | No | Pagination cursor. Value depends on search mode (see Pagination below). |
| `collectionId` | number | No | Filter results to a specific collection ID. |
| `tagId` | number | No | Filter results to links with a specific tag ID. |
| `pinnedOnly` | boolean | No | Filter to only pinned links. Default: `false`. |

### Sort Values

| Value | Enum Name | Sort Order | Description |
|-------|-----------|------------|-------------|
| `0` | `DateNewestFirst` | Newest → Oldest | Sort by creation date, newest first (default) |
| `1` | `DateOldestFirst` | Oldest → Newest | Sort by creation date, oldest first |
| `2` | `NameAZ` | A → Z | Sort by name alphabetically, ascending |
| `3` | `NameZA` | Z → A | Sort by name alphabetically, descending |

**Source:** `packages/types/global.ts:79-84`

### Advanced Search Syntax

The `searchQueryString` parameter supports advanced field-specific filters:

- `url:example.com` - Search in URL field
- `name:keyword` - Search in name field
- `description:text` - Search in description field
- `type:pdf` - Filter by link type (url, image, pdf)
- `collection:name` - Filter by collection name
- `tag:tagname` - Filter by tag name
- `pinned:true` - Filter pinned links
- `public:true` - Filter public links
- `before:2024-01-01` - Links created before date
- `after:2024-01-01` - Links created after date
- `!field:value` - Negation (exclude results matching this filter)

**Examples:**
- `url:github.com tag:programming` - Find GitHub URLs tagged with "programming"
- `!type:pdf name:tutorial` - Find non-PDF links with "tutorial" in name
- `collection:research after:2024-01-01` - Find links in "research" collection created after Jan 1, 2024

**Source:** `apps/web/lib/api/searchQueryBuilder.ts` - `parseSearchTokens()` function

## Pagination

The API uses **different pagination strategies** depending on whether Meilisearch is enabled:

### With Meilisearch (Offset-based)

When Meilisearch is configured and a `searchQueryString` is provided:

- **`cursor`**: Numeric offset (starting from 0)
- **`nextCursor`**: Next offset value, or `null` if no more results
- **Page size**: Controlled by `PAGINATION_TAKE_COUNT` environment variable (default: 50)

**How it works:**
1. First request: Don't provide `cursor` (or use `cursor=0`)
2. Response includes `nextCursor` (e.g., `50`)
3. Next request: Use `cursor=50`
4. Continue until `nextCursor` is `null`

**Source:** `apps/web/lib/api/controllers/search/searchLinks.ts:64-66, 142`

### Without Meilisearch (Cursor-based)

When Meilisearch is not available or no search query is provided:

- **`cursor`**: ID of the last link from the previous page
- **`nextCursor`**: ID of the last link in current results, or `null` if no more results
- **Page size**: Controlled by `PAGINATION_TAKE_COUNT` environment variable (default: 50)

**How it works:**
1. First request: Don't provide `cursor`
2. Response includes `nextCursor` (e.g., `1234`)
3. Next request: Use `cursor=1234`
4. Continue until `nextCursor` is `null`

**Source:** `apps/web/lib/api/controllers/search/searchLinks.ts:194-195, 247-250`

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "links": [
      {
        "id": 4,
        "name": "Example link",
        "type": "url",
        "description": "Some additional thoughts...",
        "createdById": 1,
        "collectionId": 3,
        "icon": "Airplane",
        "iconWeight": "fill",
        "color": "#0ea5e9",
        "url": "https://example.com",
        "textContent": "Example Domain This domain is for use in illustrative examples...",
        "preview": "archives/preview/3/4.jpeg",
        "image": "archives/preview/3/4.jpeg",
        "pdf": "archives/preview/3/4.pdf",
        "readable": "archives/3/4_readability.json",
        "monolith": "unavailable",
        "lastPreserved": "2024-12-02T00:40:22.295Z",
        "importDate": "2024-12-02T00:40:22.295Z",
        "createdAt": "2024-12-02T00:40:22.295Z",
        "updatedAt": "2024-12-02T00:40:22.295Z",
        "tags": [
          {
            "id": 1,
            "name": "programming",
            "createdAt": "2024-12-01T00:00:00.000Z",
            "updatedAt": "2024-12-01T00:00:00.000Z"
          }
        ],
        "collection": {
          "id": 3,
          "name": "My Collection",
          "ownerId": 1,
          "isPublic": false,
          "createdAt": "2024-12-01T00:00:00.000Z",
          "updatedAt": "2024-12-01T00:00:00.000Z"
        },
        "pinnedBy": [1, 2, 3]
      }
    ],
    "nextCursor": 50
  }
}
```

### Response Fields

#### Root Object

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the request was successful |
| `message` | string | Response message |
| `data` | object | Response data containing links and pagination info |

#### Data Object

| Field | Type | Description |
|-------|------|-------------|
| `links` | array | Array of link objects (see Link Object below) |
| `nextCursor` | number \| null | Cursor for next page, or `null` if no more results |

#### Link Object

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | integer | No | Link ID |
| `name` | string | No | Link name/title |
| `type` | string | No | Link type: `"url"`, `"image"`, or `"pdf"` |
| `description` | string | No | Link description |
| `createdById` | integer | No | ID of user who created the link |
| `collectionId` | integer | No | ID of collection containing the link |
| `icon` | string | Yes | Icon name (e.g., "Airplane") |
| `iconWeight` | string | Yes | Icon weight: `"fill"`, `"bold"`, `"light"`, `"regular"`, `"duotone"`, or `"thin"` |
| `color` | string | No | Color hex code (e.g., "#0ea5e9") |
| `url` | string | No | The actual URL of the link |
| `textContent` | string | Yes | Extracted text content from the webpage (excluded from response) |
| `preview` | string | Yes | Path to preview image (e.g., "archives/preview/3/4.jpeg") |
| `image` | string | Yes | Path to archived image |
| `pdf` | string | Yes | Path to archived PDF |
| `readable` | string | Yes | Path to readable/reader view JSON |
| `monolith` | string | Yes | Path to single-file HTML archive or "unavailable" |
| `lastPreserved` | string (datetime) | Yes | Timestamp of last preservation |
| `importDate` | string (datetime) | Yes | Timestamp when link was imported |
| `createdAt` | string (datetime) | No | Creation timestamp |
| `updatedAt` | string (datetime) | No | Last update timestamp |
| `tags` | array | No | Array of tag objects |
| `collection` | object | No | Collection object containing the link |
| `pinnedBy` | array | No | Array of user IDs who pinned this link |

## Examples

### Example 1: Basic Search

Search for links containing "docker":

```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=docker" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "links": [
      {
        "id": 123,
        "name": "Docker Documentation",
        "url": "https://docs.docker.com",
        ...
      }
    ],
    "nextCursor": 50
  }
}
```

### Example 2: Advanced Search with Filters

Search for GitHub URLs tagged "programming", sorted by name:

```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=url:github.com%20tag:programming&sort=2" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example 3: Filtered Search by Collection

Get all links in collection ID 5, newest first:

```bash
curl -X GET "https://your-instance.com/api/v1/search?collectionId=5&sort=0" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example 4: Pagination (Meilisearch Mode)

**First Page:**
```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=tutorial" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "links": [ /* 50 links */ ],
    "nextCursor": 50
  }
}
```

**Second Page:**
```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=tutorial&cursor=50" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "links": [ /* 50 more links */ ],
    "nextCursor": 100
  }
}
```

**Last Page (no more results):**
```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=tutorial&cursor=100" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "links": [ /* remaining links */ ],
    "nextCursor": null
  }
}
```

### Example 5: Pagination (Fallback Mode)

When no search query is provided:

**First Page:**
```bash
curl -X GET "https://your-instance.com/api/v1/search?sort=0" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Response:**
```json
{
  "data": {
    "links": [ /* 50 links */ ],
    "nextCursor": 1234
  }
}
```

**Second Page (using last link ID as cursor):**
```bash
curl -X GET "https://your-instance.com/api/v1/search?sort=0&cursor=1234" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example 6: Pinned Links Only

Get only pinned links:

```bash
curl -X GET "https://your-instance.com/api/v1/search?pinnedOnly=true" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Example 7: Complex Query

Find PDF files in collection "Research" created after 2024-01-01, sorted Z→A:

```bash
curl -X GET "https://your-instance.com/api/v1/search?searchQueryString=type:pdf%20collection:Research%20after:2024-01-01&sort=3" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Configuration

### Environment Variables

- **`PAGINATION_TAKE_COUNT`**: Number of links returned per page (default: 50)
- **`SEARCH_FILTER_LIMIT`**: Maximum number of advanced search filters allowed per query
- **`DATABASE_URL`**: Database connection string (PostgreSQL enables case-insensitive search)
- **Meilisearch configuration**: See Linkwarden documentation for Meilisearch setup

**Source:** `apps/web/lib/api/controllers/search/searchLinks.ts:24`

## Notes

- The `textContent` field is excluded from responses to reduce payload size (`searchLinks.ts:126-128, 228-230`)
- When Meilisearch is enabled, search is performed using full-text search with better performance
- Without Meilisearch, search falls back to database `LIKE` queries (case-insensitive on PostgreSQL)
- The actual pagination mode (offset vs cursor) is determined by the backend based on Meilisearch availability
- Sort order is applied consistently in both Meilisearch and fallback modes

## Related Types

TypeScript types are defined in `packages/types/global.ts`:

```typescript
export enum Sort {
  DateNewestFirst = 0,
  DateOldestFirst = 1,
  NameAZ = 2,
  NameZA = 3,
}

export type LinkRequestQuery = {
  sort?: Sort;
  cursor?: number;
  collectionId?: number;
  tagId?: number;
  pinnedOnly?: boolean;
  searchQueryString?: string;
};
```

## Implementation Reference

- **API Endpoint:** `apps/web/pages/api/v1/search/index.ts`
- **Controller:** `apps/web/lib/api/controllers/search/searchLinks.ts`
- **Query Parser:** `apps/web/lib/api/searchQueryBuilder.ts`
  - `parseSearchTokens()` - Parses advanced search syntax
  - `buildMeiliQuery()` - Builds Meilisearch queries
  - `buildMeiliFilters()` - Builds Meilisearch filters
  - `escapeForMeilisearch()` - Escapes special characters
- **Type Definitions:** `packages/types/global.ts`
