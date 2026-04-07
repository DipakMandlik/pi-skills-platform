---
name: analytics-engineer
description: >
  Analytics engineering skill covering dbt model development, SQL transformations, data testing,
  documentation, and semantic layer design. Use this skill whenever a user wants to: build or
  refactor dbt models (staging, intermediate, marts), write SQL transformations for a data
  warehouse, set up data quality tests or great_expectations suites, write dbt YAML for sources,
  schema, or tests, design a metrics or semantic layer, write data contracts or pipeline design
  docs, debug a failing dbt model or test, set up incremental models, or design a dbt project
  structure. Triggers on any mention of dbt, staging model, mart, intermediate model, ref(),
  source(), schema.yml, sources.yml, incremental, unique_key, data test, data quality, metrics
  layer, semantic layer, transformation pipeline, or "how should I model this in dbt". Always
  produce complete, runnable artifacts — never describe what to do without showing the actual SQL
  or YAML.
---

# Analytics Engineer Skill

You are a senior analytics engineer. Your job is to produce complete, production-ready dbt models,
YAML definitions, tests, and documentation — with enough reasoning that the user understands the
design choices, not just the output.

Always produce working artifacts. If requirements are ambiguous, make reasonable assumptions,
state them clearly, and build something the user can run immediately.

---

## Core Approach

Every request follows this sequence:

1. **Understand the transformation goal** — What raw data exists? What does the output need to look like? Who consumes it?
2. **Identify the layer** — staging, intermediate, or mart? See the Layer Guide below.
3. **Choose the materialization** — view, table, incremental, or ephemeral? See the Materialization Guide.
4. **Write the model** — complete SQL with `ref()` / `source()` references, no hardcoded schema names.
5. **Write the YAML** — schema definition, column descriptions, and tests alongside every model.
6. **Explain key decisions** — grain, join logic, incremental strategy, test coverage rationale.

---

## Project Structure

```
models/
├── staging/                   ← One model per source table. Rename, cast, clean.
│   ├── shopify/
│   │   ├── stg_shopify__orders.sql
│   │   ├── stg_shopify__customers.sql
│   │   └── _shopify__sources.yml
│   └── stripe/
│       ├── stg_stripe__payments.sql
│       └── _stripe__sources.yml
├── intermediate/              ← Business logic. Joins, pivots, complex transforms.
│   ├── int_orders__joined.sql
│   ├── int_customer_orders__grouped.sql
│   └── _int__models.yml
├── marts/                     ← Final models for BI tools and consumers.
│   ├── core/
│   │   ├── fct_orders.sql
│   │   ├── dim_customers.sql
│   │   └── _core__models.yml
│   └── finance/
│       ├── fct_revenue_daily.sql
│       └── _finance__models.yml
├── utils/
│   └── _utils__models.yml
seeds/                         ← Static CSV reference data
macros/                        ← Reusable Jinja macros
tests/                         ← Singular (custom SQL) tests
analyses/                      ← Ad-hoc SQL, not materialized
```

**Naming convention:** `<layer>_<source>__<entity>` for staging; `int_<entity>__<verb>` for intermediate; `fct_<process>` / `dim_<entity>` for marts. Double underscore separates source from entity.

---

## Layer Guide

### Staging layer
**Purpose:** One-to-one with source tables. Rename columns, cast types, apply basic cleaning. No joins, no business logic, no aggregations.

**Rules:**
- One staging model per source table
- Rename to snake_case, full words (`customer_id` not `cust_id`)
- Cast all columns to correct types — never leave dates as VARCHAR
- Add a `source()` reference, never a hardcoded table name
- Deduplicate if the source has known duplicates (use `ROW_NUMBER()`)
- Add `_loaded_at` / `_updated_at` metadata passthrough

```sql
-- models/staging/shopify/stg_shopify__orders.sql
WITH source AS (
    SELECT * FROM {{ source('shopify', 'orders') }}
),

renamed AS (
    SELECT
        -- ids
        id                                    AS order_id,
        customer_id,
        location_id,

        -- timestamps
        created_at::TIMESTAMP_NTZ             AS created_at,
        updated_at::TIMESTAMP_NTZ             AS updated_at,
        processed_at::TIMESTAMP_NTZ           AS processed_at,
        cancelled_at::TIMESTAMP_NTZ           AS cancelled_at,

        -- amounts (cents → dollars)
        total_price_set:shop_money:amount::FLOAT / 100  AS order_total,
        subtotal_price::FLOAT / 100                     AS subtotal,
        total_discounts::FLOAT / 100                    AS discount_amount,
        total_tax::FLOAT / 100                          AS tax_amount,

        -- dimensions
        financial_status,
        fulfillment_status,
        LOWER(currency)                       AS currency_code,

        -- metadata
        _fivetran_synced                      AS _loaded_at

    FROM source
)

SELECT * FROM renamed
```

### Intermediate layer
**Purpose:** Business logic that doesn't belong in staging (too complex) or marts (too reusable). Joins across staging models, pivots, window functions, complex filtering.

**Rules:**
- Only reference staging models or other intermediate models via `ref()`
- Name the file to describe what it does: `int_orders__joined`, `int_customers__grouped`
- These are often ephemeral or view-materialized — they feed marts, not BI tools directly

```sql
-- models/intermediate/int_orders__items_joined.sql
WITH orders AS (
    SELECT * FROM {{ ref('stg_shopify__orders') }}
),

order_items AS (
    SELECT * FROM {{ ref('stg_shopify__order_line_items') }}
),

joined AS (
    SELECT
        o.order_id,
        o.customer_id,
        o.created_at                           AS order_created_at,
        o.financial_status,
        o.currency_code,
        oi.line_item_id,
        oi.product_id,
        oi.variant_id,
        oi.quantity,
        oi.unit_price,
        oi.quantity * oi.unit_price            AS line_total,
        o.discount_amount * (oi.line_total / NULLIF(o.subtotal, 0))
                                               AS allocated_discount
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
)

SELECT * FROM joined
```

### Mart layer
**Purpose:** Final, consumer-facing models. Optimized for BI tools, analysts, and downstream applications. Dimensional (fact/dim) or wide denormalized tables depending on consumer needs.

**Rules:**
- Only reference `ref()` models — never `source()` directly
- Fully tested and documented
- Materialized as `table` or `incremental` (not view — BI tools need fast query times)
- One mart per business domain: `core`, `finance`, `marketing`, `product`

---

## Materialization Guide

| Materialization | When to use | Avoid when |
|---|---|---|
| `view` | Staging models, lightweight transforms, always needs fresh data | Queried frequently by BI tools (re-runs every time) |
| `table` | Marts, intermediate models with complex logic, queried often | Table is extremely large and only a small slice changes daily |
| `incremental` | Large fact tables (>10M rows), append-heavy data | Data arrives out of order frequently, or deletes are common |
| `ephemeral` | CTEs you want to reuse across models, no storage needed | Referenced more than 2–3 times (each reference inlines the SQL) |

### Incremental model patterns

```sql
-- models/marts/core/fct_orders.sql
{{
    config(
        materialized = 'incremental',
        unique_key   = 'order_id',
        on_schema_change = 'sync_all_columns',
        incremental_strategy = 'merge'   -- 'delete+insert' for Redshift/Snowflake if merge is slow
    )
}}

WITH source AS (
    SELECT * FROM {{ ref('int_orders__items_joined') }}

    {% if is_incremental() %}
        -- Only process rows newer than what we've already loaded.
        -- Use a small lookback buffer to catch late-arriving updates.
        WHERE order_created_at >= (
            SELECT DATEADD(day, -3, MAX(order_created_at)) FROM {{ this }}
        )
    {% endif %}
),

final AS (
    SELECT
        {{ dbt_utils.generate_surrogate_key(['order_id', 'line_item_id']) }} AS order_line_sk,
        order_id,
        line_item_id,
        customer_id,
        product_id,
        order_created_at,
        DATE_TRUNC('day', order_created_at)   AS order_date,
        quantity,
        unit_price,
        line_total,
        allocated_discount,
        line_total - allocated_discount       AS net_revenue,
        CURRENT_TIMESTAMP()                   AS dbt_loaded_at
    FROM source
)

SELECT * FROM final
```

**Incremental strategies by platform:**

| Platform | Recommended strategy | Notes |
|---|---|---|
| Snowflake | `merge` | Native MERGE is efficient; use `delete+insert` for very large updates |
| BigQuery | `merge` or `insert_overwrite` | `insert_overwrite` replaces whole partitions — good for date-partitioned tables |
| Redshift | `delete+insert` | No native MERGE before Redshift Serverless; merge is slower |
| Databricks | `merge` | Delta Lake MERGE is well-optimized |

---

## dbt YAML: Sources, Schema & Tests

### Sources definition
```yaml
# models/staging/shopify/_shopify__sources.yml
version: 2

sources:
  - name: shopify
    description: "Raw Shopify e-commerce data loaded by Fivetran"
    database: raw
    schema: shopify
    loader: fivetran
    loaded_at_field: _fivetran_synced

    freshness:
      warn_after:  { count: 24, period: hour }
      error_after: { count: 48, period: hour }

    tables:
      - name: orders
        description: "One row per order placed in Shopify"
        identifier: orders    # actual table name if different from 'name'
        columns:
          - name: id
            description: "Shopify order ID"
            tests:
              - not_null
              - unique
          - name: customer_id
            tests: [not_null]
          - name: financial_status
            tests:
              - accepted_values:
                  values: ['pending', 'authorized', 'partially_paid', 'paid',
                           'partially_refunded', 'refunded', 'voided']

      - name: customers
        description: "One row per Shopify customer account"
        columns:
          - name: id
            tests: [not_null, unique]
          - name: email
            tests: [not_null]
```

### Model schema definition
```yaml
# models/marts/core/_core__models.yml
version: 2

models:
  - name: fct_orders
    description: >
      One row per order line item. Grain: order_id + line_item_id.
      Covers all orders from Shopify (2020-present). Excludes cancelled and test orders.
    config:
      materialized: incremental
    meta:
      owner: "@analytics-team"
      contains_pii: false
      sla_freshness_hours: 4

    columns:
      - name: order_line_sk
        description: "Surrogate key — hash of order_id + line_item_id"
        tests: [not_null, unique]

      - name: order_id
        description: "Shopify order ID (natural key)"
        tests: [not_null]

      - name: customer_id
        description: "FK to dim_customers"
        tests:
          - not_null
          - relationships:
              to: ref('dim_customers')
              field: customer_id

      - name: order_date
        description: "Date the order was placed (UTC, truncated to day)"
        tests: [not_null]

      - name: net_revenue
        description: "line_total minus allocated discount. Always >= 0 for non-refund rows."
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: ">= 0"

      - name: dbt_loaded_at
        description: "Timestamp when this row was last loaded by dbt"
        tests: [not_null]

  - name: dim_customers
    description: >
      One row per customer (current state — no SCD2 history).
      Customers are sourced from Shopify; enriched with Stripe payment metadata.
    columns:
      - name: customer_id
        tests: [not_null, unique]
      - name: email
        tests: [not_null]
      - name: customer_segment
        tests:
          - accepted_values:
              values: ['enterprise', 'smb', 'consumer', 'unknown']
```

---

## Data Testing Strategy

### Test pyramid
Build tests at three levels — don't just cover happy paths:

```
         ▲ Singular tests (custom SQL)       — complex business rules
        ▲▲▲ Generic tests on marts           — relationships, accepted values, expressions
       ▲▲▲▲▲ Generic tests on staging         — not_null, unique on every source key
```

### Generic tests (dbt built-in + dbt_utils)
```yaml
# The four built-in tests — apply to every key column:
tests:
  - not_null
  - unique
  - accepted_values:
      values: [...]
  - relationships:
      to: ref('dim_customers')
      field: customer_id

# dbt_utils tests:
tests:
  - dbt_utils.unique_combination_of_columns:
      combination_of_columns: [order_id, line_item_id]

  - dbt_utils.expression_is_true:
      expression: "net_revenue >= 0"

  - dbt_utils.not_constant:
      column_name: customer_segment    # fails if every row has the same value

  - dbt_utils.at_least_one:
      column_name: order_id            # fails if the model is empty

  - dbt_utils.recency:
      datepart: hour
      field: order_created_at
      interval: 24                     # fails if no data in last 24h

  - dbt_utils.accepted_range:
      min_value: 0
      max_value: 1000000
      column_name: net_revenue
      inclusive: true
```

### Singular tests (custom SQL)
Place in `tests/` directory. Fail if any rows are returned.

```sql
-- tests/assert_orders_revenue_positive.sql
-- Every completed order must have positive net revenue.
SELECT order_id, net_revenue
FROM {{ ref('fct_orders') }}
WHERE financial_status = 'paid'
  AND net_revenue < 0
```

```sql
-- tests/assert_no_duplicate_order_dates.sql
-- Each order_id should appear only once per date in the daily summary.
SELECT order_id, order_date, COUNT(*) AS cnt
FROM {{ ref('fct_orders_daily') }}
GROUP BY 1, 2
HAVING cnt > 1
```

```sql
-- tests/assert_customer_order_totals_match_source.sql
-- Reconciliation: total revenue in mart must match total in staging within 0.01%.
WITH mart_total AS (
    SELECT SUM(net_revenue) AS total FROM {{ ref('fct_orders') }}
),
source_total AS (
    SELECT SUM(order_total) AS total FROM {{ ref('stg_shopify__orders') }}
    WHERE financial_status = 'paid'
)
SELECT
    m.total AS mart_revenue,
    s.total AS source_revenue,
    ABS(m.total - s.total) / NULLIF(s.total, 0) AS pct_diff
FROM mart_total m, source_total s
WHERE ABS(m.total - s.total) / NULLIF(s.total, 0) > 0.0001  -- fail if >0.01% discrepancy
```

### dbt-expectations tests (recommended package)
```yaml
# More expressive tests with dbt-expectations:
tests:
  - dbt_expectations.expect_column_values_to_be_between:
      min_value: 0
      max_value: 99999
      column_name: quantity

  - dbt_expectations.expect_column_to_exist:
      column_name: order_id

  - dbt_expectations.expect_table_row_count_to_be_between:
      min_value: 1000
      max_value: 100000000

  - dbt_expectations.expect_column_values_to_match_regex:
      column_name: email
      regex: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"

  - dbt_expectations.expect_column_pair_values_A_to_be_greater_than_B:
      column_A: effective_to
      column_B: effective_from
      or_equal: true
```

---

## Macros

### Surrogate key (from dbt_utils)
```sql
{{ dbt_utils.generate_surrogate_key(['order_id', 'line_item_id']) }}
```

### Custom macros worth building

```sql
-- macros/cents_to_dollars.sql
{% macro cents_to_dollars(column_name, precision=2) %}
    ROUND({{ column_name }} / 100.0, {{ precision }})
{% endmacro %}
-- Usage: {{ cents_to_dollars('total_price_cents') }}
```

```sql
-- macros/safe_divide.sql
{% macro safe_divide(numerator, denominator) %}
    CASE WHEN {{ denominator }} = 0 OR {{ denominator }} IS NULL
         THEN NULL
         ELSE {{ numerator }} / {{ denominator }}
    END
{% endmacro %}
```

```sql
-- macros/date_spine.sql — generate a continuous date range (uses dbt_utils)
{{ dbt_utils.date_spine(
    datepart   = "day",
    start_date = "cast('2020-01-01' as date)",
    end_date   = "current_date()"
) }}
```

```sql
-- macros/union_sources.sql — union same-shape tables from multiple sources
{% macro union_shopify_regions(table_name) %}
    {% set regions = ['us', 'eu', 'apac'] %}
    {% for region in regions %}
        SELECT *, '{{ region }}' AS region
        FROM {{ source('shopify_' + region, table_name) }}
        {% if not loop.last %} UNION ALL {% endif %}
    {% endfor %}
{% endmacro %}
```

---

## Documentation & Data Contracts

### Model-level documentation
Every mart model needs: description, grain statement, owner, PII flag, freshness SLA.

```yaml
models:
  - name: fct_orders
    description: >
      **Grain:** One row per order line item (order_id + line_item_id).

      **Coverage:** All Shopify orders from 2020-01-01 to present. Excludes:
      - Orders with `financial_status = 'voided'`
      - Test orders (tagged with `test` in Shopify)
      - Refund line items (modeled separately in `fct_refunds`)

      **Joins:** Shopify orders + line items. No external enrichment.

      **Latency:** Loaded every 4 hours via Airflow. Data is typically 1–2 hours
      behind Shopify at time of load.

    meta:
      owner: "@data-platform-team"
      slack_channel: "#analytics-eng"
      contains_pii: false
      downstream_consumers:
        - "Looker: Order Performance dashboard"
        - "Finance: monthly revenue reconciliation"
        - "ML: customer LTV model feature pipeline"
      sla:
        freshness_hours: 4
        completeness_pct: 99.9
```

### Data contracts (schema enforcement)
Use dbt contracts (dbt 1.5+) to enforce column types and prevent breaking changes:

```yaml
models:
  - name: fct_orders
    config:
      contract:
        enforced: true   # dbt will fail if column types don't match
    columns:
      - name: order_line_sk
        data_type: varchar
        constraints:
          - type: not_null
          - type: unique
      - name: order_id
        data_type: varchar
        constraints:
          - type: not_null
      - name: net_revenue
        data_type: numeric
        constraints:
          - type: not_null
```

### Column-level lineage in YAML
```yaml
columns:
  - name: net_revenue
    description: >
      Gross line revenue minus the discount amount allocated proportionally
      to this line item based on its share of the order subtotal.
      Formula: `line_total - (order_discount * line_total / order_subtotal)`
    data_type: numeric
    meta:
      derived_from:
        - stg_shopify__orders.total_discounts
        - stg_shopify__order_line_items.price
        - stg_shopify__order_line_items.quantity
```

---

## Metrics Layer / Semantic Layer

### dbt Semantic Layer (MetricFlow — dbt 1.6+)
```yaml
# models/marts/core/_metrics.yml
semantic_models:
  - name: orders
    description: "Order line item grain model"
    model: ref('fct_orders')

    defaults:
      agg_time_dimension: order_date

    entities:
      - name: order_line
        type: primary
        expr: order_line_sk
      - name: order
        type: foreign
        expr: order_id
      - name: customer
        type: foreign
        expr: customer_id

    dimensions:
      - name: order_date
        type: time
        type_params:
          time_granularity: day
      - name: financial_status
        type: categorical
      - name: currency_code
        type: categorical

    measures:
      - name: order_count
        description: "Number of distinct orders"
        agg: count_distinct
        expr: order_id
      - name: total_revenue
        description: "Sum of net revenue across all line items"
        agg: sum
        expr: net_revenue
      - name: avg_order_value
        description: "Average net revenue per order"
        agg: average
        expr: net_revenue

metrics:
  - name: revenue
    label: "Net Revenue"
    description: "Total net revenue after discounts"
    type: simple
    type_params:
      measure: total_revenue

  - name: revenue_growth_mom
    label: "Revenue Growth (MoM)"
    description: "Month-over-month revenue growth rate"
    type: derived
    type_params:
      expr: (revenue - revenue_prior_period) / revenue_prior_period
      metrics:
        - name: revenue
        - name: revenue
          offset_window: 1 month
          alias: revenue_prior_period

  - name: orders_per_customer
    label: "Orders per Customer"
    type: ratio
    type_params:
      numerator: order_count
      denominator:
        name: customer_count
        filter: "{{ Dimension('customer__customer_segment') }} = 'consumer'"
```

### Exposures (downstream consumer documentation)
```yaml
# models/marts/core/_exposures.yml
exposures:
  - name: order_performance_dashboard
    label: "Order Performance Dashboard"
    type: dashboard
    maturity: high
    url: "https://company.looker.com/dashboards/42"
    description: >
      Daily order and revenue performance. Used by sales and finance teams
      for weekly business reviews.
    depends_on:
      - ref('fct_orders')
      - ref('dim_customers')
      - ref('dim_products')
    owner:
      name: "Analytics Team"
      email: "analytics@company.com"

  - name: customer_ltv_model
    label: "Customer LTV ML Model"
    type: ml
    maturity: medium
    description: "Feature pipeline for the customer lifetime value prediction model"
    depends_on:
      - ref('fct_orders')
      - ref('dim_customers')
    owner:
      name: "ML Platform Team"
      email: "ml@company.com"
```

---

## dbt_project.yml Configuration

```yaml
name: 'my_project'
version: '1.0.0'
config-version: 2

profile: 'my_project'

model-paths:  ["models"]
test-paths:   ["tests"]
seed-paths:   ["seeds"]
macro-paths:  ["macros"]

target-path:  "target"
clean-targets: ["target", "dbt_packages"]

models:
  my_project:
    staging:
      +materialized: view
      +schema: staging
    intermediate:
      +materialized: ephemeral
    marts:
      +materialized: table
      +schema: marts
      core:
        fct_orders:
          +materialized: incremental
          +unique_key: order_line_sk

vars:
  # Use these in models with {{ var('start_date') }}
  start_date: '2020-01-01'
  # Override at run time: dbt run --vars '{"start_date": "2024-01-01"}'

on-run-start:
  - "{{ create_udfs() }}"    # optional: create UDFs before models run

on-run-end:
  - "{{ log_run_results() }}"
```

---

## Platform-Specific Patterns

### Snowflake
```sql
-- Clustering on incremental fact tables
{{ config(
    materialized = 'incremental',
    unique_key   = 'order_line_sk',
    cluster_by   = ['order_date']    -- Snowflake: cluster key on incremental table
) }}

-- Dynamic table alternative (Snowflake-native, no dbt scheduler needed)
-- Use for near-real-time models; set lag instead of scheduling
```

### BigQuery
```sql
-- Partition + cluster config
{{ config(
    materialized          = 'incremental',
    incremental_strategy  = 'insert_overwrite',
    partition_by          = {
        "field": "order_date",
        "data_type": "date",
        "granularity": "day"
    },
    cluster_by            = ['customer_id', 'product_id'],
    on_schema_change      = 'sync_all_columns'
) }}

-- Require partition filter to prevent full scans
{{ config(require_partition_filter = true) }}
```

### Redshift
```sql
{{ config(
    materialized         = 'incremental',
    incremental_strategy = 'delete+insert',    -- more reliable than merge on Redshift
    unique_key           = 'order_line_sk',
    dist                 = 'customer_id',       -- DISTKEY
    sort                 = ['order_date', 'customer_id']   -- SORTKEY
) }}
```

### Databricks
```sql
{{ config(
    materialized         = 'incremental',
    incremental_strategy = 'merge',
    unique_key           = 'order_line_sk',
    file_format          = 'delta',
    merge_update_columns = ['net_revenue', 'financial_status', 'dbt_loaded_at']
) }}
```

---

## Pipeline Design Doc Template

When a user needs a pipeline design doc, use this structure:

```markdown
# Pipeline Design: [Name]

## Overview
[1–2 sentences: what this pipeline does and why it exists]

## Sources
| Source | Table | Load method | Freshness |
|---|---|---|---|
| Shopify | orders | Fivetran CDC | Every 6h |

## Transformations
| Layer | Model | Description | Materialization |
|---|---|---|---|
| Staging | stg_shopify__orders | Rename, cast, clean | View |
| Intermediate | int_orders__joined | Join orders + items | Ephemeral |
| Mart | fct_orders | Final fact table | Incremental |

## Grain & Key Decisions
- **Grain:** One row per order line item
- **Incremental strategy:** Merge on order_line_sk; 3-day lookback for late updates
- **Deduplication:** ROW_NUMBER() on order_id + updated_at in staging

## Tests
| Model | Tests |
|---|---|
| stg_shopify__orders | not_null(order_id), unique(order_id) |
| fct_orders | unique(order_line_sk), relationships(customer_id → dim_customers) |

## Lineage Diagram
[source: shopify.orders] → stg_shopify__orders → int_orders__joined → fct_orders
[source: shopify.customers] → stg_shopify__customers → dim_customers → fct_orders

## SLAs
- Freshness: data must be < 4 hours old
- Completeness: > 99.9% of source rows present
- Test pass rate: 100% (no warnings tolerated in prod)

## Open Questions
- [ ] Should cancelled orders be excluded at staging or mart layer?
- [ ] How to handle multi-currency orders — convert to USD at load time?
```

---

## Reference Files

For deep-dive details, load:
- `references/sql-transformations.md` — SQL patterns for common analytics engineering tasks
- `references/testing-patterns.md` — complete test suites, reconciliation patterns, anomaly detection
- `references/dbt-advanced.md` — advanced dbt: hooks, operations, snapshots, analyses, packages
- `references/semantic-layer.md` — full MetricFlow semantic model patterns and dimension types
