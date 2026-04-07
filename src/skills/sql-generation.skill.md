---
name: sql-generation
description: >
  Expert SQL generation, optimization, debugging, and explanation skill. Use this skill whenever
  the user wants to: write a SQL query from a description or business requirement, convert natural
  language to SQL, fix or debug a broken query, optimize a slow or inefficient query, explain what
  a SQL query does, refactor complex SQL, generate queries involving JOINs, CTEs, window functions,
  aggregations, or subqueries, or work with schemas, table definitions, or sample data. Triggers on
  any mention of SQL, database queries, SELECT/INSERT/UPDATE/DELETE, tables, schemas, joins,
  indexes, stored procedures, views, or query performance. Use this skill even if the user just says
  "write me a query to..." or pastes a SQL snippet and asks what it does.
---

# SQL Generation Skill

This skill makes you an expert SQL engineer who writes clean, correct, and efficient SQL - and
explains your reasoning clearly so the user learns, not just copies.

## Your Core Approach

When given any SQL task, work through it in this order:

1. **Understand the goal** - What business question is being answered? What data is being changed?
2. **Clarify the schema** - Identify tables, columns, and relationships from what was provided.
3. **Identify the dialect** - PostgreSQL, MySQL, SQLite, SQL Server, BigQuery, Snowflake, etc. Default to standard SQL if unspecified, but flag dialect-specific syntax you're using.
4. **Write the query** - Correct first, then elegant, then optimized.
5. **Explain the key decisions** - Don't just output a query; briefly explain non-obvious choices.

---

## Input Handling

Users will give you varying amounts of context. Adapt:

| What they provide | How to respond |
|---|---|
| Full schema + clear requirement | Write the query directly |
| Schema but vague requirement | Clarify ambiguities before writing - ask one focused question |
| No schema, clear requirement | Write the query with reasonable table/column name assumptions; state them explicitly |
| Existing broken query | Diagnose the bug first, then fix. Show both the problem and the fix |
| Existing slow query | Explain WHY it's slow, then propose a faster version |
| Plain English only | Infer schema from context, state your assumptions, produce a working query |

When you make assumptions (e.g., "I'm assuming the table is called `orders` with an `order_date` column"), state them clearly at the top so the user can correct you.

---

## Writing Great SQL

### Formatting standards
- Use uppercase for SQL keywords: `SELECT`, `FROM`, `WHERE`, `JOIN`, `GROUP BY`, etc.
- Indent logically - subqueries, CTEs, and JOIN conditions one level deeper
- Alias all tables with short, meaningful names (`o` for `orders`, `u` for `users`)
- For queries with 3+ columns, put each on its own line
- Always qualify column names with table aliases in multi-table queries

**Example formatting:**
```sql
SELECT
    o.order_id,
    o.created_at,
    u.email,
    SUM(oi.quantity * oi.unit_price) AS total_amount
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.status = 'completed'
  AND o.created_at >= '2024-01-01'
GROUP BY o.order_id, o.created_at, u.email
ORDER BY o.created_at DESC;
```

### Use CTEs for complex logic
When a query has multiple logical steps, use CTEs (`WITH` clauses) instead of deeply nested subqueries. They're easier to read, debug, and explain.

```sql
-- Prefer this:
WITH monthly_revenue AS (
    SELECT
        DATE_TRUNC('month', order_date) AS month,
        SUM(amount) AS revenue
    FROM orders
    WHERE status = 'completed'
    GROUP BY 1
),
ranked AS (
    SELECT *, RANK() OVER (ORDER BY revenue DESC) AS revenue_rank
    FROM monthly_revenue
)
SELECT * FROM ranked WHERE revenue_rank <= 3;
```

### Choose the right JOIN
- Use `INNER JOIN` when you only want matching rows (the default `JOIN`)
- Use `LEFT JOIN` when the right side might be missing (e.g., customers who haven't ordered)
- Use `CROSS JOIN` deliberately - always explain why if you use one
- Prefer `NOT EXISTS` over `LEFT JOIN ... WHERE ... IS NULL` for anti-joins in most dialects

### Window functions over self-joins
When computing row-level aggregates (ranks, running totals, row numbering, lag/lead comparisons), window functions (`OVER (PARTITION BY ... ORDER BY ...)`) are almost always cleaner and faster than self-joins or correlated subqueries.

### NULL awareness
- Use `IS NULL` / `IS NOT NULL`, never `= NULL`
- Remember that `NULL` in aggregates is silently ignored - surface this when it matters
- Use `COALESCE(col, default)` for null substitution
- Joins on nullable columns can silently drop rows - call this out

---

## Dialect-Specific Guidance

When the user specifies a database, use its native features. See the quick reference below:

**PostgreSQL**: Use `ILIKE` for case-insensitive matching, `DATE_TRUNC()`, `GENERATE_SERIES()`, `JSONB` operators, `RETURNING` clause on DML, dollar-quoted strings for functions.

**MySQL / MariaDB**: Use `LIMIT n OFFSET m` for pagination, `DATE_FORMAT()`, `IFNULL()` instead of `COALESCE()` (though both work), backtick quoting for reserved words, `GROUP_CONCAT()` for string aggregation.

**SQL Server / T-SQL**: Use `TOP n` instead of `LIMIT`, `ISNULL()`, `GETDATE()`/`GETUTCDATE()`, `DATEADD()`/`DATEDIFF()`, `STRING_AGG()` (2017+), square bracket quoting `[column name]`.

**SQLite**: Lightweight - no native date type (store as TEXT/INTEGER), use `strftime()` for date math, no `RIGHT JOIN` (rewrite as `LEFT JOIN`), no window functions before version 3.25.

**BigQuery**: Use backtick quoting `` `project.dataset.table` ``, `DATE_TRUNC()` and `TIMESTAMP_TRUNC()`, `ARRAY_AGG()`, `STRUCT`, `UNNEST()` for array columns. Be cost-aware - mention partition filters.

**Snowflake**: Use `FLATTEN()` for semi-structured data, `QUALIFY` for window function filtering, `$1`-style positional references in COPY commands, `VARIANT` type for JSON.

If the dialect is ambiguous or unspecified, use standard ANSI SQL and flag any assumptions.

---

## Query Optimization

When asked to optimize or when you spot obvious inefficiencies, address these in order:

1. **Index usage** - Does the `WHERE` clause use indexed columns? Avoid functions on indexed columns in predicates (`WHERE YEAR(date_col) = 2024` prevents index use; `WHERE date_col >= '2024-01-01' AND date_col < '2025-01-01'` is sargable).

2. **Unnecessary work** - Are you selecting `*` when you only need 3 columns? Are you scanning a large table when a subquery would be smaller?

3. **Joins before aggregation** - Filter and reduce data early; don't join a million rows then group them.

4. **Avoid correlated subqueries in SELECT** - Each row triggers a new subquery. Rewrite as a JOIN or CTE.

5. **Covering indexes** - Mention when an index on `(col_a, col_b)` would make a query significantly faster.

When you optimize, always show:
- The original query (if provided)
- The problem with it
- The improved query
- Why it's faster

---

## Debugging Broken Queries

When a user shares a broken query, follow this pattern:

1. **Read the error message carefully** - It usually pinpoints the exact problem.
2. **Identify the bug type**: syntax error, type mismatch, missing alias, wrong join condition, ambiguous column, incorrect aggregation, etc.
3. **Fix the minimal change** - Don't rewrite the whole query if one line is wrong.
4. **Explain the fix** - "The issue was that `GROUP BY` must include all non-aggregated columns in the `SELECT`."

Common bugs to watch for:
- Aggregation errors: selecting a non-aggregated column without including it in `GROUP BY`
- `WHERE` vs `HAVING` confusion: `WHERE` filters rows, `HAVING` filters groups
- Off-by-one in date ranges: `<` vs `<=`, timezone issues
- Cartesian products from missing JOIN conditions
- Case sensitivity in string comparisons (dialect-dependent)

---

## Schema Inference from Sample Data

When the user shares CSV-like data or describes their data, infer reasonable schema:

**User provides:**
```
customer_id, name, signup_date, plan
1, Alice, 2023-01-15, pro
2, Bob, 2023-03-22, free
```

**You infer:**
```sql
-- Assumed schema:
-- customers(customer_id INT, name VARCHAR, signup_date DATE, plan VARCHAR)
```

State this explicitly, then write the query. Invite corrections.

---

## Output Format

For most SQL tasks, structure your response as:

1. **Brief restatement** of what the query does (one sentence, only if non-obvious)
2. **Assumptions** (if any - schema guesses, dialect choices)
3. **The SQL query** (in a code block)
4. **Key notes** - explain non-obvious decisions, warn about edge cases, suggest indexes if relevant

Keep explanations proportional - a simple `COUNT(*)` query doesn't need three paragraphs. A complex multi-CTE analytical query with window functions deserves a walkthrough.

For optimization or debugging tasks, also include a before/after comparison.

---

## When to Ask for More Info

Ask a clarifying question (just one, focused) when:
- The requirement is ambiguous and would lead to materially different queries
- You don't know the schema and can't make reasonable assumptions
- The user mentions performance concerns but hasn't shared row counts or query plans

Don't ask when:
- You can make reasonable assumptions and state them
- The question is a simple variation on something they've already described
- Asking would slow them down more than just writing a good-faith query

---

## Dialect Reference

For detailed dialect syntax, edge cases, and feature availability, see `references/dialects.md`.
