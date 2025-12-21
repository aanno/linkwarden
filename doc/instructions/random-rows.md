# on a postresql relational dB, I want to receive n random row. but not uniformly distributed, but depending to a non negative integer in column 'weight'. the weight directly gives the probability of the row to be selected (normalisation to sum(weight) for complete table).

To select \$ n \$ random rows from a PostgreSQL table according to a non-uniform probability distribution given by a non-negative integer column `weight`, you can use a weighted random sampling technique. The probability of each row being selected is proportional to its `weight` value divided by the total sum of all weights in the table. This is sometimes called "weighted reservoir sampling".

Here’s an SQL technique to do this using PostgreSQL:

### Method: Weighted Random Sampling with ORDER BY

For single-row selection:

```sql
SELECT *
FROM your_table
ORDER BY -LN(RANDOM()) / weight
LIMIT 1;
```

To get \$ n \$ rows, replace `LIMIT 1` with `LIMIT n`:

```sql
SELECT *
FROM your_table
ORDER BY -LN(RANDOM()) / weight
LIMIT n;
```


#### Theory

- `RANDOM()` generates a uniform random float between 0 and 1.
- `-LN(RANDOM())` transforms the distribution to exponential, suitable for weighted sampling .
- Dividing by `weight` makes the selection probability proportional to `weight`.


### Important Notes

- `weight` must be positive for all rows (no zero weights).
- If you want to exclude zero-weight rows, filter them out:

```sql
SELECT *
FROM your_table
WHERE weight > 0
ORDER BY -LN(RANDOM()) / weight
LIMIT n;
```


### Recommended Use Cases

- Useful for recommendations, smart sampling, or randomized experiments where selection probability must be controlled by a table column.


### References

This technique is well-documented and is a practical solution for PostgreSQL without the need for procedural code or custom extension.

***
If you need a truly sampling-without-replacement algorithm (no duplicates), this method works as described for small \$ n \$ relative to table size. For very large \$ n \$, other techniques are needed.

Let me know if you need advanced examples, such as aggregating or joining related data into the sample.

---

# same, but with an alternative capped weight w = min(weight, max) with max as a constant.

To select \$ n \$ random rows from a PostgreSQL table with the selection probability proportional to a capped weight \$ w = \min(weight, max) \$ where `max` is a constant, you can adapt the weighted random sampling by replacing the original weight with the capped weight in the calculation.

Here is a practical approach based on cumulative distribution and random sampling, using SQL:

```sql
WITH capped_weights AS (
  SELECT *,
    LEAST(weight, max) AS capped_weight
  FROM your_table
),
weights_sum AS (
  SELECT SUM(capped_weight) AS total_weight FROM capped_weights
),
sampling_prob AS (
  SELECT *,
    capped_weight / total_weight AS prob
  FROM capped_weights, weights_sum
),
cumulative_probs AS (
  SELECT *,
    SUM(prob) OVER (ORDER BY id) AS cum_prob
  FROM sampling_prob
),
cumulative_bounds AS (
  SELECT *,
    COALESCE(LAG(cum_prob) OVER (ORDER BY id), 0) AS lower_cum_prob,
    cum_prob AS upper_cum_prob
  FROM cumulative_probs
),
random_samples AS (
  SELECT generate_series(1, n) AS sample_idx,
    random() AS rand_val
)
SELECT cb.*
FROM random_samples rs
JOIN cumulative_bounds cb
  ON rs.rand_val >= cb.lower_cum_prob
 AND rs.rand_val < cb.upper_cum_prob
LIMIT n;
```


### Explanation:

- `capped_weights`: Calculate capped weights by `LEAST(weight, max)`.
- `weights_sum`: Compute sum of the capped weights.
- `sampling_prob`: Normalize capped weights to probabilities.
- `cumulative_probs`: Cumulative sum of probabilities for range boundaries.
- `cumulative_bounds`: Each row gets a [lower, upper) range to map random numbers.
- `random_samples`: Generate \$ n \$ random numbers.
- Final `SELECT`: Match random numbers to their weighted ranges to pick rows.

This method selects rows according to the capped weights with probabilities proportional to each row's capped weight over the total capped weight sum. It can be easily customized for any `max` value.

If `weight` column or table is large, appropriate indexing and query optimization may be necessary.

This technique is derived and adapted from known PostgreSQL weighted sampling methods, modified for capped weights [^2_1][^2_2].
<span style="display:none">[^2_10][^2_3][^2_4][^2_5][^2_6][^2_7][^2_8][^2_9]</span>

<div align="center">⁂</div>

[^2_1]: https://www.marcosantoni.com/2016/08/23/weighted-random-sampling-with-postgresql

[^2_2]: https://stackoverflow.com/questions/13040246/select-random-row-from-a-postgresql-table-with-weighted-row-probabilities

[^2_3]: https://www.reddit.com/r/PostgreSQL/comments/qq86tb/select_random_rows_from_postgres_table_weighted/

[^2_4]: https://news.ycombinator.com/item?id=41894528

[^2_5]: https://www.depesz.com/2022/11/30/picking-random-element-with-weights/

[^2_6]: https://www.postgresql.org/docs/current/pgbench.html

[^2_7]: https://www.alibabacloud.com/blog/599392

[^2_8]: https://www.tigerdata.com/blog/generating-more-realistic-sample-time-series-data-with-postgresql-generate_series

[^2_9]: https://gist.github.com/FanchenBao/88ce9a912c876e79006f269b8cd968c5

[^2_10]: https://www.postgresql.org/docs/current/sql-select.html


---

# can this be improved with a (temporary) view or virtual/calculated columns?

Yes, performance and manageability of weighted random sampling with capped weights in PostgreSQL can be improved using either a temporary view or calculated (generated) columns:

### Using a Temporary View

- You can create a temporary view for the capped weights and normalized probabilities once per session or per query batch:

```sql
CREATE TEMPORARY VIEW vw_capped_weights AS
SELECT *,
  LEAST(weight, max) AS capped_weight
FROM your_table;
```

- Then use this view in your sampling query to avoid recalculating capped weights repeatedly.
- This can also allow indexing on the temp view if it is materialized, improving repeated sampling queries performance.


### Using a Generated (Virtual) Column

- Since PostgreSQL supports generated columns (PostgreSQL 12+), you can add a generated column for capped weights:

```sql
ALTER TABLE your_table
ADD COLUMN capped_weight integer GENERATED ALWAYS AS (LEAST(weight, max)) STORED;
```

- This eliminates the runtime calculation for each query.
- You can then create indexes on `capped_weight` to speed up weighted operations.
- The normalized probabilities and cumulative sums can be materialized in a separate summary table or computed on demand.


### Benefits

- Temporary views reduce query complexity and repeated computations within a session.
- Generated columns push computation to data modification time—making reads faster.
- Both approaches improve readability and maintainability of your weighted sampling SQL.
- Indexes on capped weights further improve performance if you sample frequently.

Overall, using either a temporary view or a stored generated column for the capped weight calculation is recommended to optimize the weighted random sampling query performance and clarity.

If highest performance is critical, combining a generated capped weight column with precomputed cumulative weights in a materialized table or summary can enable very fast weighted random sampling.

This advice aligns with common PostgreSQL best practices for optimizing repeated complex calculations and sampling queries [^3_1][^3_2].
<span style="display:none">[^3_10][^3_3][^3_4][^3_5][^3_6][^3_7][^3_8][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://stackoverflow.com/questions/25995056/view-optimization-in-postgresql

[^3_2]: https://db.in.tum.de/~leis/papers/lookingglass.pdf

[^3_3]: https://www.tigerdata.com/blog/using-pg-stat-statements-to-optimize-queries

[^3_4]: https://www.postgresql.org/docs/current/runtime-config-query.html

[^3_5]: https://www.tigerdata.com/blog/generating-more-realistic-sample-time-series-data-with-postgresql-generate_series

[^3_6]: https://www.postgresql.org/docs/current/pgbench.html

[^3_7]: https://pganalyze.com/docs/query-performance

[^3_8]: https://pgxn.org/dist/weighted_statistics/1.0.0/

[^3_9]: https://www.youtube.com/watch?v=4C3omclRxxc

[^3_10]: https://dev.to/metis/how-to-master-postgresql-performance-like-never-before-4feb


---

# can you line out the materialized view and summary solution a bit?

To implement the weighted random sampling with capped weights efficiently using materialized views and a summary table in PostgreSQL, here is a detailed outline:

### 1. Materialized View for Capped Weights

Create a materialized view that precomputes capped weights and their cumulative sums for efficient sampling:

```sql
CREATE MATERIALIZED VIEW mv_capped_weights AS
SELECT
  id,
  LEAST(weight, max) AS capped_weight
FROM your_table;

-- Add an index on id for quick lookups (optional)
CREATE UNIQUE INDEX idx_mv_capped_weights_id ON mv_capped_weights(id);
```


### 2. Summary Table with Total Weight and Cumulative Sum

Create a summary table that stores the total sum of capped weights and possibly cumulative sums for ordered sampling (optional, for very large datasets):

```sql
CREATE TABLE summary_weights (
  total_capped_weight numeric,
  last_refresh timestamp
);

INSERT INTO summary_weights(total_capped_weight, last_refresh)
SELECT SUM(capped_weight), now() FROM mv_capped_weights;
```

Optionally, if your sampling requires cumulative sums by order, add a column with cumulative weights in the materialized view:

```sql
CREATE MATERIALIZED VIEW mv_capped_weights_cumulative AS
SELECT
  id,
  capped_weight,
  SUM(capped_weight) OVER (ORDER BY id) AS cumulative_weight
FROM (
  SELECT
    id,
    LEAST(weight, max) AS capped_weight
  FROM your_table
) sub;

CREATE UNIQUE INDEX idx_mv_capped_weights_cum_id ON mv_capped_weights_cumulative(id);
```

Then update the summary table with the total as the max cumulative weight.

### 3. Sampling Query Using Materialized View

Use these precomputed values to perform the weighted sampling:

```sql
WITH random_numbers AS (
  SELECT generate_series(1, n) AS sample_idx, random() * (SELECT MAX(cumulative_weight) FROM mv_capped_weights_cumulative) AS rand_val
)
SELECT mwc.*
FROM random_numbers rn
JOIN mv_capped_weights_cumulative mwc ON rn.rand_val <= mwc.cumulative_weight
  AND rn.rand_val > COALESCE((
    SELECT MAX(cumulative_weight) FROM mv_capped_weights_cumulative WHERE cumulative_weight < rn.rand_val
  ), 0)
LIMIT n;
```


### 4. Refresh Strategy

Since materialized views are static snapshots, schedule periodic `REFRESH MATERIALIZED VIEW` commands (manually or via a cron job) to keep the data current. Also update the summary table accordingly.

### Advantages:

- This pre-aggregation saves expensive runtime calculations of capped weights and cumulative sums.
- Sampling becomes a simple join for efficient lookups.
- Indexes on materialized views enable fast access.
- Summary table quickens access to totals needed for scaling random numbers.
- Suitable for large tables with frequent sampling.


### When to Use

- When sampling is frequent and performance matters.
- Large datasets where per-query weight recalculation is costly.

This approach aligns with PostgreSQL best practices for complex weighted sampling optimization including materialized views, indexing, and summary tables[^4_1][^4_2][^4_3].
<span style="display:none">[^4_10][^4_4][^4_5][^4_6][^4_7][^4_8][^4_9]</span>

<div align="center">⁂</div>

[^4_1]: https://questdb.com/blog/how-to-create-a-materialized-view/

[^4_2]: https://www.postgresql.org/docs/current/rules-materializedviews.html

[^4_3]: https://dev.to/hexshift/creating-materialized-views-in-postgresql-for-faster-analytics-2m2l

[^4_4]: https://www.crunchydata.com/blog/indexing-materialized-views-in-postgres

[^4_5]: https://liambx.com/blog/postgresql-materialized-views-from-basics-to-practical-examples-in-mastodon

[^4_6]: https://www.marcosantoni.com/weighted_random_sampling_follow_up.html

[^4_7]: https://www.tigerdata.com/blog/generating-more-realistic-sample-time-series-data-with-postgresql-generate_series

[^4_8]: https://github.com/postgrespro/pg_wait_sampling

[^4_9]: https://rizqimulki.com/optimizing-postgresql-for-real-time-ai-model-inference-at-scale-87df27acb9f8

[^4_10]: https://stackoverflow.com/questions/29437650/how-can-i-ensure-that-a-materialized-view-is-always-up-to-date


---

# I have a second problem. now I want to choose the n rows depending on the (absolute) difference to the median weight value, but every row should at least have a minimal constant propabiliy to get chosen.

To choose \$ n \$ rows in PostgreSQL based on the absolute difference of their weight to the median weight, while ensuring every row has at least a minimal constant probability, here is a structured approach:

### Step 1: Calculate the median weight

PostgreSQL can calculate the median weight using percentile functions, for example:

```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY weight) AS median_weight
FROM your_table;
```


### Step 2: Define the weighted probability for each row

To assign a sampling weight reflecting closeness to the median, use the absolute difference:

$$
\text{distance} = | \text{weight} - \text{median\_weight} |
$$

To get higher probabilities near the median, invert the distance; for example:

$$
\text{score} = \frac{1}{1 + \text{distance}}
$$

This ensures rows closer to the median have a higher score.

### Step 3: Ensure minimum probability

Add a minimal constant probability \$ p_{min} \$:

$$
\text{final\_weight} = p_{min} + (1 - p_{min}) \times \frac{\text{score}}{\max(\text{score})}
$$

This normalizes scores so all have at least \$ p_{min} \$ probability.

### Step 4: Use these final weights for weighted random sampling

You can then apply the weighted random sampling logic described earlier, substituting the `weight` column with `final_weight`.

### Example SQL snippet integrating all:

```sql
WITH median_cte AS (
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY weight) AS median_weight FROM your_table
),
score_cte AS (
  SELECT
    *,
    ABS(weight - (SELECT median_weight FROM median_cte)) AS distance
  FROM your_table
),
weight_cte AS (
  SELECT
    *,
    1.0 / (1.0 + distance) AS score
  FROM score_cte
),
normalization_cte AS (
  SELECT
    *,
    (score - MIN(score) OVER ()) / (MAX(score) OVER () - MIN(score) OVER ()) AS norm_score
  FROM weight_cte
),
final_weight_cte AS (
  SELECT
    *,
    0.1 + 0.9 * norm_score AS final_weight  -- assuming p_min = 0.1
  FROM normalization_cte
)
-- Sample n rows weighted by final_weight
SELECT *
FROM final_weight_cte
ORDER BY -LN(RANDOM()) / final_weight
LIMIT n;
```


### Summary

- Compute median weight.
- Calculate absolute distance from median per row.
- Convert distance to scores favoring closeness.
- Add minimal probability offset.
- Use transformed weights for weighted random sampling.

This guarantees every row can be selected with at least minimal probability while biasing selection toward those near the median weight, combining fair chance with weighted preference.

Let me know if you want a version optimized via materialized views or precomputed columns! This balances flexibility and performance well for ad hoc sampling [^5_1][^5_2][^5_6].
<span style="display:none">[^5_10][^5_3][^5_4][^5_5][^5_7][^5_8][^5_9]</span>

<div align="center">⁂</div>

[^5_1]: https://www.tigerdata.com/blog/how-percentiles-work-and-why-theyre-better-than-averages

[^5_2]: https://wiki.postgresql.org/wiki/Aggregate_Median

[^5_3]: https://github.com/vincentlaucsb/Weighted-Statistics-PostgreSQL

[^5_4]: http://jdlm.info/articles/2023/06/11/bootstrap-confidence-intervals-sql-postgresql-bigquery.html

[^5_5]: https://stackoverflow.com/questions/12067656/how-do-i-get-min-median-and-max-from-my-query-in-postgresql

[^5_6]: https://stackoverflow.com/questions/2748725/is-there-a-weighted-median-function

[^5_7]: https://www.datacamp.com/tutorial/mean-vs-median

[^5_8]: https://www.elastic.co/docs/reference/aggregations/search-aggregations-metrics-median-absolute-deviation-aggregation

[^5_9]: https://stackoverflow.com/questions/53283671/weighted-median-calculation-in-postgres

[^5_10]: https://www.postgresql.org/docs/current/pgbench.html


---

# I'm using typescript and prisms ORM. are there particularities with implementing both with this stack?

When using **TypeScript** with the **Prisma ORM** (not "Prisms ORM") to implement advanced weighted random sampling strategies like those discussed (including capped, distance-from-median, and minimal probability selection), there are several important considerations:

### 1. Prisma and Custom SQL

- Prisma’s query engine focuses on typical CRUD and simple aggregation queries.
- Advanced SQL constructs, such as:
    - Median calculations
    - Common Table Expressions (CTEs)
    - Window functions
    - Materialized views
are **not directly supported** by Prisma's query builder.


#### Solutions:

- Use **Prisma’s `$queryRaw`** or `$executeRaw` methods to execute raw SQL for:
    - CTEs, window functions, custom sampling logic, etc.
- TypeScript integration is straightforward, but **you must handle type assertion** when dealing with raw results, since Prisma cannot infer types from raw SQL.


### 2. Prisma Limitations and Workarounds

- **Materialized views**: You can query them using `$queryRaw`, but you’ll need to manually define TypeScript types.
- **Generated columns**: Prisma (as of late 2025) supports reading from these columns but not always creating them in migrations. You may need to manually edit your schema or use `@@ignore`.


### 3. TypeScript Typing

- Prisma will not generate TypeScript types for _transient_ result columns (e.g., those computed in raw SQL queries), unless you define them explicitly.
- Always define interfaces for your custom query results to leverage TypeScript’s safety.

```typescript
// Example: TypeScript type for a custom sampling result
interface WeightedSampleResult {
  id: string;
  final_weight: number;
  // Extend with your required columns
}

// Usage:
const median = await prisma.$queryRaw<WeightedSampleResult[]>(`...your SQL...`);
```


### 4. Transaction Safety

- If your query uses or updates a materialized view, consider transactions for consistency if your sampling depends on up-to-date data.


### 5. Parameterization

- Always use Prisma's parameterized queries (`$queryRaw` with template literals and Prisma.sql) to avoid SQL injection.

Example with parameters and TypeScript type assertion:

```typescript
const samples = await prisma.$queryRaw<WeightedSampleResult[]>(
  Prisma.sql`SELECT * FROM ... WHERE ... LIMIT ${n};`
);
```


### 6. Performance

- For large datasets, consider maintaining your materialized views outside Prisma—schedule view refreshes with a CRON job or SQL triggers, not application logic.

***

### Summary Table

| Feature | Native in Prisma? | Solution |
| :-- | :-- | :-- |
| Capped/complex weights | ❌ | Use `$queryRaw` with custom SQL |
| CTEs, window functions | ❌ | Use `$queryRaw`, define TypeScript types |
| Materialized views | ⚠️ (read-only) | Query with `$queryRaw`, define types, manage refresh outside Prisma |
| Generated columns | ⚠️ | Read with Prisma, may need manual schema adjustment for migrations |
| SQL Injection Safety | n/a | Use parameterized queries with `Prisma.sql` template literals |


***

**In summary:**
You can implement any advanced sampling mechanism in PostgreSQL and access the results from TypeScript + Prisma, but you’ll typically be using raw SQL with explicit result typing and must manually manage schema features that Prisma doesn't natively handle in migrations or query building. Always validate raw queries for safety and maintainability[^6_1][^6_2].

<div align="center">⁂</div>

[^6_1]: https://dev.to/hexshift/creating-materialized-views-in-postgresql-for-faster-analytics-2m2l

[^6_2]: https://stackoverflow.com/questions/12067656/how-do-i-get-min-median-and-max-from-my-query-in-postgresql


---

# can I add custom SQL to migrations? also, I conclude that generated columns might be the easiest thing to do.

Yes, you can add custom SQL to Prisma migrations by editing the generated migration SQL files directly.

### How to add custom SQL to Prisma migrations:

1. Create a draft migration without applying it:

```
npx prisma migrate dev --create-only --name your_migration_name
```

2. This generates a migration folder with a `migration.sql` file.
3. Open that `migration.sql` file and **add your custom SQL commands** there—for example, to add generated columns:

```sql
ALTER TABLE your_table
ADD COLUMN capped_weight INT GENERATED ALWAYS AS (LEAST(weight, max)) STORED;
```

4. Save the file.
5. Apply the migration as usual:

```
npx prisma migrate dev
```


### Important notes:

- The Prisma schema (`schema.prisma`) does not support generated columns natively now, so your Prisma schema won’t reflect the generated column.
- Since Prisma schema is out of sync in this case, to avoid issues with Prisma's auto-generated migrations later, you may want to use the `@@ignore` attribute for these generated columns inside your Prisma schema, so Prisma doesn't try to manage them:

```prisma
model YourModel {
  id            Int     @id @default(autoincrement())
  weight        Int
  capped_weight Int?    @ignore
}
```

- Keep track of manual SQL changes you add, since future Prisma schema changes and migrations might overwrite or conflict with them.


### Summary

- Prisma lets you customize migrations via editing the generated raw SQL files.
- Generated columns are conveniently added this way.
- You must handle Prisma schema manually regarding generated columns to avoid migration conflicts.

This is currently the easiest, safest way to work with generated columns given Prisma limitations, and the process is well-documented in Prisma’s customization guides[^7_1][^7_2][^7_3].

If you want, a sample migration snippet for a generated column can be provided.
<span style="display:none">[^7_10][^7_4][^7_5][^7_6][^7_7][^7_8][^7_9]</span>

<div align="center">⁂</div>

[^7_1]: https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations

[^7_2]: https://www.answeroverflow.com/m/1343635936310726736

[^7_3]: https://github.com/prisma/prisma/discussions/14544

[^7_4]: https://stackoverflow.com/questions/78638427/is-there-a-way-to-use-prisma-and-do-a-live-migration-without-data-loss

[^7_5]: https://stackoverflow.com/questions/77248196/how-to-generate-a-migration-file-with-prisma

[^7_6]: https://github.com/prisma/prisma/issues/24180

[^7_7]: https://www.youtube.com/watch?v=LNxWk4twzGE

[^7_8]: https://www.prisma.io/docs/orm/prisma-migrate

[^7_9]: https://www.reddit.com/r/node/comments/17895ci/how_do_you_handle_prismas_sql_migration_schemas/

[^7_10]: https://www.reddit.com/r/node/comments/173n3jp/we_migrated_to_sql_our_biggest_learning_dont_use/


---

# When should I use generated columns versus computed fields in Postgres

Generated columns and computed (or virtual) fields in PostgreSQL serve similar purposes but differ in implementation, performance, and use cases. Here’s when to use each, based on PostgreSQL features:

### Generated Columns

- **Definition:** Columns whose values are computed and stored on disk automatically when rows are inserted or updated.
- **Types:**
    - **Stored generated columns** (supported since PostgreSQL 12) compute values on write and persist them.
    - **Virtual generated columns** (introduced in PostgreSQL 18) compute values on read, without storing them.
- **Use when:**
    - You want **automatic, consistent, and immutable computation** of column values derived from other columns.
    - The computed value is used frequently in queries, and you want to **avoid recalculating it repeatedly** (stored columns improve read performance).
    - You want to **index** the computed value for faster queries.
    - You desire **data integrity** where computations aren't accidentally overridden.
- **Limitations:**
    - Generation expressions must be **immutable**.
    - For stored columns, values take **extra storage space**.
    - For virtual columns, functions must be built-in or leakproof (in PostgreSQL 18+).
    - Cannot reference other tables or generated columns.
- **Example:**

```sql
ALTER TABLE your_table
ADD COLUMN capped_weight int GENERATED ALWAYS AS (LEAST(weight, max)) STORED;
```


### Computed Fields (Computed on Query Time or Views)

- **Definition:** Computed fields are typically derived by queries, often via views or expressions in SELECT statements.
- **Use when:**
    - Your calculations are **ad hoc or infrequent**.
    - You want **no extra storage cost**.
    - The computed value depends on **complex logic**, joins, or functions not allowed in generated columns.
    - You want **flexibility** and don’t need the overhead of maintaining stored values.
- **Limitations:**
    - Computed values incur **runtime cost** on every query.
    - No direct indexing on computed expressions without using expression indexes.
- **Example:**

```sql
SELECT id, weight, LEAST(weight, max) AS capped_weight FROM your_table;
```


### Summary Table

| Aspect | Generated Columns | Computed Fields (Views/Expressions) |
| :-- | :-- | :-- |
| Storage | Stored columns consume storage | No storage overhead |
| Performance | Faster reads, computed once on write | Computed each read, slower on large datasets |
| Indexing | Indexes possible on stored columns | Indexes via expression indexes (less straightforward) |
| Data consistency | Automated and immutable | Computed on demand, can be inconsistent if base data changes |
| Flexibility | Limited to immutable expressions | Supports complex logic, joins, and functions |
| Maintenance overhead | Updates on insert/update | No maintenance, always computed at query time |

### Recommendation

- Use **generated columns** when your computed value is simple, immutable, frequently queried, and benefits from indexing.
- Use **computed fields** or views when computation is complex, rarely needed, or involves logic beyond what generated columns support.

Given your use case with capped weights and normalization, **generated columns (stored)** are likely the easiest and most performant way to implement the core computations, especially if you want to index or optimize queries on these values.

This guidance aligns with PostgreSQL documentation and best practices as of versions 12 and 18+ [^8_1][^8_3][^8_5].
<span style="display:none">[^8_10][^8_2][^8_4][^8_6][^8_7][^8_8][^8_9]</span>

<div align="center">⁂</div>

[^8_1]: https://www.postgresql.org/docs/current/ddl-generated-columns.html

[^8_2]: https://www.codeproject.com/Articles/5246207/Generated-Columns-in-PostgreSQL?PageFlow=FixedWidth

[^8_3]: https://stackoverflow.com/questions/8250389/computed-calculated-virtual-derived-generated-columns-in-postgresql

[^8_4]: https://dev.to/camptocamp-geo/understanding-the-generated-always-column-option-in-postgresql-oo4

[^8_5]: https://severalnines.com/blog/overview-generated-columns-postgresql/

[^8_6]: https://stackoverflow.com/questions/8250389/computed-calculated-virtual-derived-generated-columns-in-postgresql/8250729

[^8_7]: https://www.dbi-services.com/blog/generated-columns-in-postgresql/

[^8_8]: https://pgdash.io/blog/postgres-12-generated-columns.html

[^8_9]: https://hashrocket.com/blog/posts/generated-columns-in-postgresql

[^8_10]: https://www.reddit.com/r/PostgreSQL/comments/1jq3gev/is_there_a_technical_reason_why_postgresql_does/
