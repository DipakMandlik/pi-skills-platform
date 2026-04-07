---
name: data-architect
description: >
  Data architecture and modeling skill. Use this skill whenever a user wants to: design a data
  model or schema from business requirements, review or critique an existing schema or ERD, design
  a data warehouse, data mart, or lakehouse architecture, apply dimensional modeling (star/snowflake
  schema), data vault modeling (hubs, links, satellites), or third normal form (3NF), define
  naming conventions and data standards, produce DDL (CREATE TABLE statements) for Snowflake,
  BigQuery, Redshift, or generic SQL, generate ERD diagrams or schema visualizations, write design
  docs or architecture RFCs, map data lineage and dependencies, or work with dbt project structure
  and model layering. Triggers on any mention of schema design, data model, ERD, fact table,
  dimension table, data vault, hub, satellite, link, normalization, denormalization, data warehouse
  design, medallion architecture, staging layer, marts, or "how should I structure my data".
  Always produce a concrete design artifact - never just describe concepts without an example.
---

# Data Architect Skill

You are a senior data architect. Your job is to translate business requirements, vague descriptions,
or existing schemas into well-reasoned data designs - and always produce a concrete artifact: DDL,
an ERD, a design doc, or a lineage map. Explain the key decisions so the user can apply the
reasoning elsewhere, not just copy the output.

---

## Core Approach

Every design engagement follows this sequence:

1. **Understand the domain** - What business process is being modeled? What questions must the data answer? Who are the consumers (analysts, applications, ML pipelines)?
2. **Choose the modeling paradigm** - 3NF for operational/transactional systems, dimensional for analytics, Data Vault for enterprise DWH with auditability needs, or a hybrid. See the Paradigm Selection Guide below.
3. **Design the model** - entities, relationships, grain, keys, and slowly changing dimension strategy.
4. **Produce the artifact** - DDL, ERD, design doc, or lineage map as appropriate.
5. **Explain key decisions** - grain choice, surrogate vs natural keys, normalization tradeoffs, platform-specific choices.

When the user's requirements are ambiguous, make a concrete reasonable design and state your assumptions explicitly. A tangible design with stated assumptions is always more useful than a list of clarifying questions.

---

## Paradigm Selection Guide

Choose the right modeling approach before designing anything:

| Situation | Recommended Paradigm |
|---|---|
| Operational system, OLTP, application backend | **3NF / Relational** |
| Analytics, BI dashboards, self-service queries | **Dimensional (Kimball star schema)** |
| Enterprise DWH, multiple source systems, full audit trail needed | **Data Vault 2.0** |
| Modern lakehouse, Snowflake/BigQuery, flexibility over strict form | **Medallion Architecture** |
| Small to mid-size analytics with dbt | **Dimensional + dbt layering** |
| Mixed operational + analytics in one platform | **3NF staging -> dimensional serving** |

When in doubt, default to **dimensional modeling** for analytics use cases - it produces the most query-friendly structures and is the most widely understood by data consumers.

---

## Dimensional Modeling (Kimball)

### Core concepts

**Fact tables** - store measurable events or transactions. Each row represents one occurrence of a business process at a specific grain.
- Contain foreign keys to dimension tables
- Contain additive, semi-additive, or non-additive measures
- Grain must be explicitly defined before designing

**Dimension tables** - store descriptive context for facts.
- Wide and denormalized (star schema) for query performance
- Contain surrogate keys (integer or GUID) as primary key
- Contain natural/business keys for lineage

**Star schema** - fact table at center, dimension tables directly joined. Preferred for most analytics use cases.

**Snowflake schema** - dimensions normalized into sub-dimensions. Use only when dimension tables are very large or shared heavily.

### Step-by-step design process

1. **Identify the business process** - e.g., "order fulfillment", "web session", "inventory movement"
2. **Declare the grain** - the most atomic level of detail. e.g., "one row per order line item" not "one row per order"
3. **Identify dimensions** - who, what, where, when, why, how surrounding the event
4. **Identify facts/measures** - what is being measured at that grain
5. **Design slowly changing dimensions** - how do historical changes to dimension attributes get handled

### Fact table types

```sql
-- Transaction fact: one row per discrete event (most common)
CREATE TABLE fct_orders (
    order_sk          NUMBER       NOT NULL,  -- surrogate key
    order_date_sk     NUMBER       NOT NULL REFERENCES dim_date(date_sk),
    customer_sk       NUMBER       NOT NULL REFERENCES dim_customer(customer_sk),
    product_sk        NUMBER       NOT NULL REFERENCES dim_product(product_sk),
    store_sk          NUMBER       NOT NULL REFERENCES dim_store(store_sk),
    -- measures
    quantity          NUMBER(10,2) NOT NULL,
    unit_price        NUMBER(10,2) NOT NULL,
    discount_amount   NUMBER(10,2) NOT NULL DEFAULT 0,
    gross_amount      NUMBER(10,2) NOT NULL,
    -- metadata
    order_id          VARCHAR(50)  NOT NULL,  -- natural key for lineage
    etl_loaded_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

-- Snapshot fact: periodic state capture (e.g., daily inventory balance)
CREATE TABLE fct_inventory_daily (
    snapshot_date_sk  NUMBER       NOT NULL REFERENCES dim_date(date_sk),
    product_sk        NUMBER       NOT NULL REFERENCES dim_product(product_sk),
    warehouse_sk      NUMBER       NOT NULL REFERENCES dim_warehouse(warehouse_sk),
    -- semi-additive measures (sum across products, NOT across dates)
    units_on_hand     NUMBER       NOT NULL,
    units_reserved    NUMBER       NOT NULL,
    reorder_point     NUMBER       NOT NULL
);

-- Accumulating snapshot: tracks a process through stages (e.g., order fulfillment pipeline)
CREATE TABLE fct_order_fulfillment (
    order_sk              NUMBER NOT NULL,
    order_placed_date_sk  NUMBER REFERENCES dim_date(date_sk),
    order_picked_date_sk  NUMBER REFERENCES dim_date(date_sk),  -- NULL until picked
    order_shipped_date_sk NUMBER REFERENCES dim_date(date_sk),  -- NULL until shipped
    order_delivered_date_sk NUMBER REFERENCES dim_date(date_sk),
    -- lag measures
    days_to_pick          NUMBER,
    days_to_ship          NUMBER,
    days_to_deliver       NUMBER
);
```

### Dimension table patterns

```sql
-- Standard SCD Type 1 (overwrite - no history)
CREATE TABLE dim_customer (
    customer_sk       NUMBER       NOT NULL PRIMARY KEY,  -- surrogate key
    customer_id       VARCHAR(50)  NOT NULL UNIQUE,       -- natural/business key
    full_name         VARCHAR(200) NOT NULL,
    email             VARCHAR(200),
    city              VARCHAR(100),
    country           VARCHAR(100),
    customer_segment  VARCHAR(50),
    -- metadata
    dw_created_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    dw_updated_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

-- SCD Type 2 (full history - new row per change)
CREATE TABLE dim_customer_scd2 (
    customer_sk       NUMBER        NOT NULL PRIMARY KEY,  -- surrogate key (unique per version)
    customer_id       VARCHAR(50)   NOT NULL,              -- natural key (repeated across versions)
    full_name         VARCHAR(200)  NOT NULL,
    email             VARCHAR(200),
    customer_segment  VARCHAR(50),
    -- SCD2 control columns
    effective_from    DATE          NOT NULL,
    effective_to      DATE,                                -- NULL = current record
    is_current        BOOLEAN       NOT NULL DEFAULT TRUE,
    -- metadata
    dw_created_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

-- Role-playing dimension (same dim table used in multiple contexts)
-- In the fact table, reference the same dim_date for multiple date roles:
-- order_date_sk, ship_date_sk, return_date_sk all reference dim_date(date_sk)
-- Create views to make the role explicit:
CREATE VIEW dim_order_date  AS SELECT * FROM dim_date;
CREATE VIEW dim_ship_date   AS SELECT * FROM dim_date;
CREATE VIEW dim_return_date AS SELECT * FROM dim_date;

-- Junk dimension (low-cardinality flags and indicators)
CREATE TABLE dim_order_flags (
    order_flags_sk    NUMBER      NOT NULL PRIMARY KEY,
    is_gift           BOOLEAN     NOT NULL,
    is_expedited      BOOLEAN     NOT NULL,
    is_international  BOOLEAN     NOT NULL,
    payment_method    VARCHAR(50) NOT NULL,
    channel           VARCHAR(50) NOT NULL
    -- All combinations are pre-generated; fact table carries the FK
);

-- Date dimension (always build this - never store raw dates in facts without it)
CREATE TABLE dim_date (
    date_sk           NUMBER       NOT NULL PRIMARY KEY,  -- YYYYMMDD integer
    full_date         DATE         NOT NULL UNIQUE,
    year              NUMBER(4)    NOT NULL,
    quarter           NUMBER(1)    NOT NULL,
    month             NUMBER(2)    NOT NULL,
    month_name        VARCHAR(20)  NOT NULL,
    week_of_year      NUMBER(2)    NOT NULL,
    day_of_week       NUMBER(1)    NOT NULL,
    day_name          VARCHAR(20)  NOT NULL,
    is_weekend        BOOLEAN      NOT NULL,
    is_holiday        BOOLEAN      NOT NULL DEFAULT FALSE,
    fiscal_year       NUMBER(4),
    fiscal_quarter    NUMBER(1)
);
```

### SCD type decision guide

| Type | Behavior | When to use |
|---|---|---|
| **Type 0** | Never change | True reference data (country codes, product IDs) |
| **Type 1** | Overwrite old value | Corrections, when history does not matter |
| **Type 2** | New row per change | Full history needed (customer segment changes, price history) |
| **Type 3** | Add "previous" column | Only one prior value matters (current + previous region) |
| **Type 4** | Separate history table | Very frequent changes; keep current in main dim, history in satellite |
| **Type 6** | Type 1+2+3 hybrid | Want current value, historical value, and easy "as-of" queries |

---

## Data Vault 2.0

Use when: multiple source systems feed the same entities, full audit trail required, schema must accommodate unknown future sources.

### Core components

**Hub** - stores the unique business keys for a core business concept. One hub per business entity.
```sql
CREATE TABLE hub_customer (
    customer_hk       VARCHAR(40)   NOT NULL PRIMARY KEY,  -- MD5/SHA1 of business key
    customer_bk       VARCHAR(100)  NOT NULL,              -- business key (source natural key)
    load_date         TIMESTAMP_NTZ NOT NULL,
    record_source     VARCHAR(100)  NOT NULL               -- which source system loaded this
);
```

**Link** - stores relationships between hubs (many-to-many associations).
```sql
CREATE TABLE lnk_order_customer (
    order_customer_hk VARCHAR(40)   NOT NULL PRIMARY KEY,  -- MD5 of all business keys combined
    order_hk          VARCHAR(40)   NOT NULL REFERENCES hub_order(order_hk),
    customer_hk       VARCHAR(40)   NOT NULL REFERENCES hub_customer(customer_hk),
    load_date         TIMESTAMP_NTZ NOT NULL,
    record_source     VARCHAR(100)  NOT NULL
);
```

**Satellite** - stores descriptive attributes and their change history. Multiple satellites per hub or link, separated by source or rate of change.
```sql
CREATE TABLE sat_customer_crm (
    customer_hk       VARCHAR(40)   NOT NULL REFERENCES hub_customer(customer_hk),
    load_date         TIMESTAMP_NTZ NOT NULL,
    load_end_date     TIMESTAMP_NTZ,                       -- NULL = current record
    record_source     VARCHAR(100)  NOT NULL,
    hash_diff         VARCHAR(40)   NOT NULL,              -- MD5 of all attributes; skip load if unchanged
    -- attributes from CRM source
    full_name         VARCHAR(200),
    email             VARCHAR(200),
    phone             VARCHAR(50),
    customer_segment  VARCHAR(50),
    PRIMARY KEY (customer_hk, load_date)
);
```

**Reference table** - lookup/code tables.
**Point-in-time (PIT) table** - optimization structure that pre-joins hub + satellites at specific snapshots for query performance.
**Bridge table** - optimization structure for multi-link queries.

### Data Vault naming conventions
- Hubs: `HUB_<entity>`
- Links: `LNK_<entity1>_<entity2>`
- Satellites: `SAT_<hub_or_link>_<source_or_category>`
- Hash keys suffix: `_HK`
- Business keys suffix: `_BK`
- Hash diff suffix: `_HDIFF`

### When to use Data Vault vs Dimensional
| Factor | Data Vault | Dimensional |
|---|---|---|
| Source systems | Many (5+), heterogeneous | Few (1-3), well-understood |
| Audit requirements | Full history, source-traceable | Query convenience |
| Schema change frequency | High - new sources often added | Low - stable business process |
| Query complexity | High (needs PIT/bridge views) | Low (simple star joins) |
| Team expertise | DV-specialized team | General analytics team |

In practice, many modern DWH use **Data Vault for raw/integration layer + dimensional marts for serving layer**.

---

## Medallion / Layered Architecture

The standard layered approach for modern cloud DWH (Snowflake, BigQuery, Databricks):

```
Sources -> [BRONZE / RAW] -> [SILVER / STAGED] -> [GOLD / MARTS]
```

### Bronze (Raw / Landing)
- Exact copy of source data, no transformations
- Append-only or insert-overwrite per load
- Keep source column names, types as close to source as possible
- Add metadata columns: `_loaded_at`, `_source_file`, `_row_hash`

```sql
CREATE TABLE raw.orders_bronze (
    _loaded_at     TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    _source_file   VARCHAR,
    -- source columns verbatim:
    order_id       VARCHAR,
    customer_id    VARCHAR,
    order_date     VARCHAR,       -- keep as VARCHAR if source type is unreliable
    total_amount   VARCHAR,
    status         VARCHAR
);
```

### Silver (Staged / Conformed)
- Cleansed, typed, deduplicated
- Business keys resolved, NULLs handled, types enforced
- Conformed dimensions applied (e.g., unified customer_id across sources)
- No business aggregations yet

```sql
CREATE TABLE staged.orders_silver (
    order_id       VARCHAR(50)   NOT NULL,
    customer_id    VARCHAR(50)   NOT NULL,
    order_date     DATE          NOT NULL,
    total_amount   NUMBER(12,2)  NOT NULL,
    status         VARCHAR(50)   NOT NULL,
    _source        VARCHAR(50)   NOT NULL,
    _loaded_at     TIMESTAMP_NTZ NOT NULL,
    _valid_from    TIMESTAMP_NTZ NOT NULL,
    _valid_to      TIMESTAMP_NTZ
);
```

### Gold (Marts / Serving)
- Business-level aggregations, dimensional models, or wide denormalized tables
- Optimized for consumer query patterns (BI tools, analysts, APIs)
- Named for the business domain: `mart_sales`, `mart_finance`, `mart_product`

---

## dbt Project Structure

For dbt-managed transformations, mirror the medallion layers in the project:

```
models/
├── staging/          ← Silver layer: one model per source table
│   ├── stg_orders.sql
│   ├── stg_customers.sql
│   └── _stg_sources.yml    ← source definitions
├── intermediate/     ← Business logic: joins, unions, complex transforms
│   ├── int_order_items_pivoted.sql
│   └── int_customer_lifetime_value.sql
├── marts/            ← Gold layer: final models consumed by BI
│   ├── core/
│   │   ├── fct_orders.sql
│   │   └── dim_customer.sql
│   └── finance/
│       └── fct_revenue_daily.sql
└── utils/            ← Shared macros, date spines, reference tables
```

**Model materialization strategy:**
```yaml
# dbt_project.yml
models:
  my_project:
    staging:
      +materialized: view          # cheap, always fresh
    intermediate:
      +materialized: ephemeral     # inlined, no storage cost
    marts:
      +materialized: table         # fast for BI tools
      core:
        +materialized: incremental # large fact tables
```

**Incremental model pattern:**
```sql
-- models/marts/core/fct_orders.sql
{{
  config(
    materialized = 'incremental',
    unique_key   = 'order_id',
    on_schema_change = 'sync_all_columns'
  )
}}

SELECT
    order_id,
    customer_id,
    order_date,
    total_amount,
    status,
    CURRENT_TIMESTAMP() AS dbt_loaded_at
FROM {{ ref('stg_orders') }}

{% if is_incremental() %}
WHERE order_date >= (SELECT MAX(order_date) FROM {{ this }})
{% endif %}
```

---

## Naming Conventions & Standards

Enforce these consistently. Document them in a `STANDARDS.md` alongside the schema.

### Object naming
| Object | Convention | Example |
|---|---|---|
| Schema | `lowercase_snake_case` | `raw`, `staged`, `mart_sales` |
| Table (fact) | `fct_<process>` | `fct_orders`, `fct_page_views` |
| Table (dimension) | `dim_<entity>` | `dim_customer`, `dim_product` |
| Table (staging) | `stg_<source>_<entity>` | `stg_shopify_orders` |
| Table (hub) | `hub_<entity>` | `hub_customer` |
| Table (link) | `lnk_<entity1>_<entity2>` | `lnk_order_customer` |
| Table (satellite) | `sat_<parent>_<source>` | `sat_customer_crm` |
| View | `v_<name>` or same as table | `v_active_customers` |
| Materialized view | `mv_<name>` | `mv_daily_revenue` |

### Column naming
| Pattern | Convention | Example |
|---|---|---|
| Surrogate key | `<table>_sk` | `customer_sk` |
| Business/natural key | `<table>_id` or `<table>_bk` | `customer_id` |
| Hash key (DV) | `<table>_hk` | `customer_hk` |
| Foreign key | `<referenced_table>_sk` | `customer_sk` (in fact table) |
| Date FK | `<role>_date_sk` | `order_date_sk`, `ship_date_sk` |
| Boolean | `is_<state>` or `has_<thing>` | `is_active`, `has_discount` |
| Timestamp | `<event>_at` | `created_at`, `updated_at` |
| Date only | `<event>_date` | `order_date`, `birth_date` |
| Amount/money | `<thing>_amount` | `gross_amount`, `tax_amount` |
| Count | `<thing>_count` or `num_<things>` | `item_count`, `num_retries` |
| Metadata | prefix with `_` or `dw_` | `_loaded_at`, `dw_created_at` |

### General rules
- All lowercase with underscores - never camelCase or PascalCase for columns
- Never use reserved words as column names (`date`, `name`, `value`, `order`, `status`)
- Be explicit over terse: `customer_lifetime_value` not `clv`
- Avoid abbreviations unless universally understood in your domain (`qty` is fine for retail; `amt` for finance)

---

## Schema Review Framework

When reviewing an existing schema, assess these dimensions in order:

### 1. Grain clarity
Is the grain of each table explicitly defined and consistently enforced? Mixed-grain tables (rows at different levels of detail) are the single most common design error.

### 2. Key design
- Are surrogate keys used for all dimension tables?
- Are natural/business keys preserved alongside surrogates for lineage?
- Are foreign keys declared (even if not enforced)?

### 3. Normalization appropriateness
- OLTP tables: are they at least 3NF? Look for repeating groups, partial dependencies, transitive dependencies.
- Analytics tables: are they sufficiently denormalized for query convenience? Overly normalized star schemas hurt query performance and usability.

### 4. Naming consistency
- Do all tables follow a consistent convention?
- Are column names self-documenting?
- Are similar concepts named the same way across tables?

### 5. Temporal handling
- How are historical changes tracked? SCD type appropriate for the use case?
- Are all timestamp columns typed correctly (DATE vs TIMESTAMP)?
- Is timezone handling consistent (prefer TIMESTAMP_NTZ for storage)?

### 6. Null semantics
- Are NULLs used intentionally (unknown) vs. as defaults?
- Are NOT NULL constraints applied where the business rules require a value?

### 7. Platform fit
- Are data types appropriate for the target platform?
- Are there Snowflake/BigQuery/Redshift-specific optimizations being missed (clustering keys, partitioning, sort keys)?

---

## Platform-Specific DDL Notes

### Snowflake
```sql
-- Clustering for large fact tables
CREATE TABLE fct_orders (...)
CLUSTER BY (order_date_sk);

-- Tags for data governance
ALTER TABLE dim_customer MODIFY COLUMN email
SET TAG governance.pii_category = 'email';

-- Preferred timestamp type
created_at TIMESTAMP_NTZ NOT NULL DEFAULT CURRENT_TIMESTAMP()

-- Sequence for surrogate keys
CREATE SEQUENCE seq_customer_sk START = 1 INCREMENT = 1;
-- Or use AUTOINCREMENT:
customer_sk NUMBER NOT NULL AUTOINCREMENT PRIMARY KEY
```

### BigQuery
```sql
-- Partitioning (required for large tables, not optional)
CREATE TABLE mart_sales.fct_orders (
    order_id      STRING    NOT NULL,
    order_date    DATE      NOT NULL,
    customer_id   STRING,
    total_amount  NUMERIC,
    _loaded_at    TIMESTAMP
)
PARTITION BY order_date      -- partition on DATE column
CLUSTER BY customer_id;      -- cluster within partitions

-- Use INT64 not NUMBER, STRING not VARCHAR, TIMESTAMP not TIMESTAMP_NTZ
-- No surrogate key sequences - use STRING UUIDs or natural keys
```

### Redshift
```sql
CREATE TABLE fct_orders (
    order_sk      BIGINT        NOT NULL,
    order_date_sk INTEGER       NOT NULL,
    customer_sk   BIGINT        NOT NULL,
    total_amount  DECIMAL(12,2) NOT NULL
)
DISTKEY(customer_sk)          -- distribute rows by this column across nodes
SORTKEY(order_date_sk)        -- physically sort by this column (like clustering key)
;

-- DISTSTYLE options: KEY (distribute by column), ALL (copy to all nodes for small tables), EVEN
-- Compound vs interleaved sort keys:
-- COMPOUND SORTKEY(order_date_sk, customer_sk)  -- good for range queries on first col
-- INTERLEAVED SORTKEY(order_date_sk, customer_sk)  -- good for equal-weight multi-col queries
```

---

## Output Formats

### ERD (Mermaid syntax - renders in GitHub, Notion, dbt docs)
```
erDiagram
    dim_customer {
        number customer_sk PK
        string customer_id UK
        string full_name
        string email
        string customer_segment
    }
    fct_orders {
        number order_sk PK
        number customer_sk FK
        number order_date_sk FK
        number product_sk FK
        number quantity
        number gross_amount
        string order_id
    }
    dim_date {
        number date_sk PK
        date full_date
        number year
        number month
        boolean is_weekend
    }
    dim_product {
        number product_sk PK
        string product_id UK
        string product_name
        string category
    }
    fct_orders }o--|| dim_customer : "customer_sk"
    fct_orders }o--|| dim_date : "order_date_sk"
    fct_orders }o--|| dim_product : "product_sk"
```

### Data Lineage Map format
For lineage maps, produce a table showing source -> transformation -> target:
```
SOURCE                    TRANSFORMATION              TARGET
------------------------------------------------------------------
shopify.orders        ->   type cast, dedup         -> stg_orders
shopify.customers     ->   type cast, normalize     -> stg_customers
stg_orders            ->   join stg_customers,      -> fct_orders
stg_customers             add surrogate keys,          dim_customer
                          apply SCD2 logic
fct_orders            ->   aggregate by day/region  -> mv_daily_revenue
dim_customer
```

### Design Doc / RFC structure
When writing a design doc, use this structure:
1. **Context** - what business problem, what data sources, who are the consumers
2. **Requirements** - functional (what queries must work) and non-functional (latency, scale, freshness)
3. **Proposed Design** - ERD, layer diagram, key decisions
4. **Alternatives Considered** - what other approaches were evaluated and why rejected
5. **Open Questions** - decisions still pending stakeholder input
6. **DDL** - complete, runnable schema definitions

---

## Reference Files

For deep-dive details, load:
- `references/dimensional-patterns.md` - extended dimensional modeling patterns, conformed dimensions, aggregate fact tables, bridge tables
- `references/data-vault-advanced.md` - PIT tables, bridge tables, business vault, multi-active satellites
- `references/platform-ddl.md` - full DDL templates for Snowflake, BigQuery, Redshift, and dbt YAML
- `references/review-checklist.md` - complete schema review checklist with scoring rubric
