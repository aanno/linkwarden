# Meilisearch in Linkwarden

**Date:** 2026-03-15
**Status:** Analysis + enhancement backlog (no implementation yet)

---

## What is Meilisearch?

Meilisearch is the full-text search engine used by Linkwarden. It is more than a plain inverted-index engine but is not a full vector database.

### Core: Inverted index (traditional FTS)
- Tokenises documents, builds a reverse index, supports BM25-style relevance
- Very fast (~50 ms typical response), optimised for search-as-you-type

### Beyond basic FTS

| Feature | What it does |
|---|---|
| **Typo tolerance** | Matches "javascrpit" → "javascript" via Levenshtein distance, built-in |
| **Prefix search** | "java" matches "javascript", "javaScript" etc. — no wildcard needed |
| **Synonyms** | Configure "js" ↔ "javascript" at the index level |
| **Stop words** | Ignore common words ("the", "and") |
| **Faceted search** | Filter + count by attribute (e.g. `tags`, `collection`) |
| **Sorting** | Sort results by any attribute (date, name, etc.) |
| **Ranking rules** | Fully configurable ranking pipeline (typo → words → proximity → attribute → …) |
| **Geo search** | Filter/sort by `_geo` coordinates (irrelevant for Linkwarden but available) |
| **Phrase search** | `"exact phrase"` matching |

### Vector / hybrid search (experimental, since v1.6)
- Store embeddings alongside documents
- Query by vector similarity (cosine distance)
- **Hybrid search**: blend keyword score + vector score with a configurable `semanticRatio`
- **Not a full vector DB**: no HNSW tuning, no metadata-only vector queries, not designed for millions of high-dimensional vectors — it is a convenience layer on top of FTS, not a replacement for Qdrant/Weaviate/pgvector

---

## How Meilisearch is used today

### Key files

| Role | File |
|---|---|
| Client initialisation | `packages/lib/meilisearchClient.ts` |
| Indexing worker | `apps/worker/workers/linkIndexing.ts` |
| Query / filter builder | `apps/web/lib/api/searchQueryBuilder.ts` |
| Search execution | `apps/web/lib/api/controllers/search/searchLinks.ts` |
| Data model | `packages/prisma/schema.prisma` |

### What is indexed

There is a single Meilisearch index named **`links`**. Each document corresponds to one `Link` row, with the following fields:

**From the Link model:**
`id` (primaryKey), `name`, `description`, `url`, `type`, `createdAt`, `updatedAt`, `color`, `icon`, `iconWeight`, `preview`, `image`, `pdf`, `readable`, `monolith`, `clientSide`, `aiTagged`, `metaDescription`, `lastPreserved`, `importDate`, `createdById`, `indexVersion`

**Computed / related fields:**
- `collectionOwnerId` — from `link.collection.ownerId`
- `collectionMemberIds` — array of user IDs from collection members
- `collectionIsPublic` — boolean
- `collectionName` — string
- `tags` — array of tag name strings
- `pinnedBy` — array of user IDs who pinned the link
- `creationTimestamp` — Unix timestamp in seconds (for range filters)

**Deliberately NOT indexed:**
- `textContent` — the full preserved readable text is stored in Postgres but explicitly omitted from the index (size concern)
- Highlight / annotation text
- Collection description, icon, color
- Individual tag metadata beyond the name string

### Meilisearch settings configured

**Filterable attributes:**
`collectionOwnerId`, `collectionMemberIds`, `collectionName`, `tags`, `pinnedBy`, `url`, `type`, `name`, `description`, `collectionIsPublic`, `creationTimestamp`

**Sortable attributes:**
`id`, `name`

**Not configured (using Meilisearch defaults):**
ranking rules, typo tolerance, synonyms, stop words, distinct attributes

### Indexing mechanism

- **Worker:** `apps/worker/workers/linkIndexing.ts` — runs continuously, polling every 10 s
- **Trigger:** Any link with `indexVersion != MEILI_INDEX_VERSION` or `indexVersion = null` is picked up
- **Batch size:** 50 links per poll (configurable via `INDEX_TAKE_COUNT`)
- **Fair distribution:** `getLinkBatch()` mixes oldest and newest unindexed links to avoid starvation
- **Re-index triggers:** link creation, link update, tag rename/delete, collection update/delete
- **Deletions:** handled immediately by the controller that deletes the link/collection/user

**Environment variables:**

| Variable | Default | Purpose |
|---|---|---|
| `MEILI_HOST` | `http://meilisearch:7700` | Meilisearch endpoint |
| `MEILI_MASTER_KEY` | — | Authentication key |
| `MEILI_TIMEOUT` | `1000000` ms | Timeout for index operations |
| `INDEX_TAKE_COUNT` | `50` | Links per indexing batch |

### Search query flow

1. User sends a search string, e.g. `javascript tag:programming before:2024-01-01`
2. `parseSearchTokens()` splits into typed tokens (`url:`, `name:`, `tag:`, `before:`, `after:`, `collection:`, `pinned:`, `public:`, general text); prefix `!` negates
3. `buildMeiliQuery()` joins general-text tokens into a plain FTS query string
4. `buildMeiliFilters()` builds Meilisearch filter expressions:
   - Access control: `(collectionOwnerId = {userId}) OR (collectionMemberIds = {userId})`
   - Field filters: exact match on `url`, `name`, `description`, `type`, `collectionName`, `tags`
   - Range filters: `creationTimestamp < {ts}` / `> {ts}`
   - Boolean flags: `pinnedBy = {userId}`, `collectionIsPublic = true`
5. `meiliClient.index("links").search(query, { filter, attributesToRetrieve: ["id"], limit, offset, sort })`
6. Meilisearch returns only `id` values
7. Postgres fetches full Link objects for those IDs (with auth re-check, tag/collection joins)
8. `textContent` is explicitly omitted from all API responses

**Fallback:** If `meiliClient` is null (Meilisearch disabled), falls back to a Postgres FTS query on `name`, `url`, `description`, `tags.name`.

**Supported sort orders:** `DateNewestFirst` (`id:desc`), `DateOldestFirst` (`id:asc`), `NameAZ` (`name:asc`), `NameZA` (`name:desc`)

### Faceted search — currently unused

All the filterable attributes are configured, but no facet counts or aggregations are requested. There is no `facetDistribution` in any search call and no faceted UI.

---

## Enhancement backlog

### Priority overview

| Enhancement | Value | Effort | Notes |
|---|---|---|---|
| Faceted browsing sidebar | High | Medium | Attributes already filterable; only needs `facetDistribution` in query + UI |
| Index `textContent` | High | Low–Medium | Size concern; consider truncating or selective indexing |
| Separate tags index | Medium | Low | Enables tag autocomplete + similarity queries |
| Typo-based merge candidates | Medium | Medium | Depends on tags index |
| Index highlights / annotations | Medium | Low | Pure indexing addition, no schema change needed |
| Synonyms from accepted merges | Low–Medium | Low | Feedback loop: a completed merge is a synonym declaration |
| Vector / hybrid search | Low | High | Experimental feature, requires embedding generation |

---

### Enhancement 1 — Faceted browsing

Meilisearch's `facetDistribution` feature returns hit counts per attribute value alongside search results. All required attributes are already in the filterable set. This would enable a search sidebar showing:

- **Tag facets:** "Programming (42), AI (31), Music (18) …" — clickable to add `tag:X` filter
- **Collection facets:** counts per collection
- **Type facets:** url / pdf / image counts
- **Date histogram:** binnable by `creationTimestamp`

Implementation would require:
1. Add `facets: ["tags", "collectionName", "type"]` to the Meilisearch search call
2. Return `facetDistribution` alongside `links` in the API response
3. Build a sidebar/filter panel in the UI

---

### Enhancement 2 — Index `textContent`

The full preserved readable text is stored in Postgres but excluded from Meilisearch. Indexing it would make Linkwarden a true "search what the page said" tool. Options to manage size:

- **Truncated indexing:** index only the first N characters (e.g. 10 000) of `textContent`
- **Selective indexing:** only index `textContent` for links where `readable IS NOT NULL`
- **Full indexing:** index everything, accept larger Meilisearch storage

The existing `indexVersion` mechanism already handles re-indexing triggers; adding `textContent` to the indexed document would be the only change needed.

---

### Enhancement 3 — Separate tags index

Currently `tags` on the links index is an array of name strings per link. There is no Meilisearch index for tags themselves. A dedicated `tags` index (one document per tag: `id`, `name`, `linkCount`, `ownerId`) would enable:

- **Tag autocomplete:** query Meilisearch instead of Postgres for the tag picker — inherits typo tolerance for free ("programing" → "Programming")
- **Fuzzy tag lookup:** the foundation for the typo-based merge candidates (Enhancement 4)

---

### Enhancement 4 — Typo-based AI merge candidates

Currently `getAiMergeCandidates.ts` uses SQL with weighted random sampling (`byAiSuggestionCount`, `byMedianDifference`, `uniformLowUsage`). These select candidates by usage statistics but have no awareness of name similarity.

With a tags index (Enhancement 3), an additional candidate provider could:

1. For each tag, issue a Meilisearch query with the tag name as the query string against the tags index
2. Meilisearch's built-in typo tolerance + prefix matching naturally surfaces "AI" / "ai" / "Artificial Intelligence" as related hits
3. Collect (query-tag, result-tag) pairs as merge candidates
4. Pass these pre-filtered pairs to the AI — the AI only needs to confirm/group them, not discover them from scratch

This would make the AI step cheaper (fewer tokens, more targeted prompt) and would catch case/typo/prefix variations without any ML.

**Co-occurrence variant:** fetch a sample of links per tag, compute which other tags appear on the same links. High-overlap tag pairs are co-occurrence merge candidates ("js" and "javascript" used on the same 30 links → strong signal).

---

### Enhancement 5 — Index highlights / annotations

User-written highlights and annotations (`Highlight` model) are not indexed. Indexing the `text` and `comment` fields of highlights (linked back to their parent link ID) would make personal notes searchable — a high-value feature for a "read it later + annotate" tool.

Options:
- Add highlight text to the existing links document (concatenated)
- Separate `highlights` index with a `linkId` foreign key

---

### Enhancement 6 — Synonyms from accepted merges

Every time a user accepts an AI merge suggestion (e.g. merging "ai" and "Artificial Intelligence" into "AI"), that is semantically a synonym declaration. These could be fed back into Meilisearch's synonyms configuration automatically:

```
accepted merge: ["ai", "Artificial Intelligence"] → "AI"
→ meiliClient.index("links").updateSynonyms({ "ai": ["AI", "Artificial Intelligence"], ... })
```

This creates a positive feedback loop: merges improve future search quality without extra user effort.

---

### Enhancement 7 — Vector / hybrid search

Meilisearch v1.6+ supports experimental vector search. Embeddings stored per document can be queried by cosine similarity, and a `semanticRatio` parameter blends FTS and vector scores.

For Linkwarden this would require:
- Generating embeddings for link content (name + description + textContent excerpt) — via the existing AI provider infrastructure
- Storing embeddings in the Meilisearch document at index time
- Exposing a "semantic search" mode in the UI

This is the most effort and most experimental of all options. Lower priority unless the simpler enhancements prove insufficient.
