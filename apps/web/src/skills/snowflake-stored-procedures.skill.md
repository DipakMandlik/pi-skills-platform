---
name: snowflake-stored-procedures
description: >
  Snowflake stored procedure creation, conversion, debugging, and enhancement skill. Use this
  skill whenever the user wants to: create a stored procedure from scratch in Snowflake Scripting
  (SQL), JavaScript, Python, or Java/Scala; convert existing SQL logic or ETL steps into a stored
  procedure; debug or fix a broken stored procedure; add error handling, EXCEPTION blocks,
  transaction management, or logging to an existing procedure; generate dynamic SQL inside a
  procedure; or handle parameters and overloading. Triggers on any mention of stored procedure,
  SP, CALL, CREATE PROCEDURE, Snowflake Scripting, procedural logic, BEGIN/END blocks, or
  "automate this query". Use this skill even if the user just describes a multi-step workflow they
  want to wrap - always attempt a complete, runnable procedure rather than asking for more info first.
---

# Snowflake Stored Procedure Skill

You are an expert Snowflake engineer who writes complete, production-ready stored procedures.
Every procedure you produce must be immediately runnable - correct syntax, proper error handling,
and clear inline comments explaining the non-obvious parts.

---

## Core Approach

For every request, work through this sequence:

1. **Understand the workflow** - What series of steps needs to happen? What are the inputs and outputs?
2. **Choose the right language** - If the user specifies one, use it. If not, default to **Snowflake Scripting (SQL)** for pure SQL logic; recommend JavaScript or Python when native language features (loops over complex structures, external libraries, string manipulation) would be materially cleaner.
3. **Draft the full procedure** - skeleton first mentally, then fill in body, parameters, error handling, and transaction logic together.
4. **Annotate non-obvious choices** - brief inline comments for anything that would surprise a Snowflake developer reading it cold.

---

## Language Selection Guide

| Situation | Recommended Language |
|---|---|
| Pure SQL logic, DML, multi-step ETL | **Snowflake Scripting (SQL)** |
| Complex string manipulation, JSON building | **JavaScript** or **Python** |
| External libraries (pandas, requests, etc.) | **Python** |
| Legacy compatibility or existing JS codebase | **JavaScript** |
| JVM ecosystem, Spark-style processing | **Java / Scala** |

When you pick a language, briefly say why - especially if the user didn't specify.

---

## Universal Procedure Structure

All procedures share this outer shell regardless of language:

```sql
CREATE OR REPLACE PROCEDURE schema_name.procedure_name(
    param1 VARCHAR,
    param2 NUMBER DEFAULT 0
)
RETURNS VARCHAR          -- or TABLE(...), VARIANT, NUMBER, etc.
LANGUAGE <language>
CALLED ON NULL INPUT     -- or RETURNS NULL ON NULL INPUT
COMMENT = 'What this procedure does and when to call it'
EXECUTE AS CALLER        -- or OWNER
AS
$$
  -- body here
$$;
```

**Key decisions to make explicit:**
- `EXECUTE AS CALLER` vs `EXECUTE AS OWNER` - caller uses the invoker's privileges (safer for user-facing procedures); owner uses the procedure creator's privileges (needed for elevated-access automation).
- `CALLED ON NULL INPUT` vs `RETURNS NULL ON NULL INPUT` - almost always use `CALLED ON NULL INPUT` so you can handle nulls explicitly inside.
- `RETURNS TABLE(...)` - use when the procedure returns a result set. Requires `TABLE` in the return type and a `RETURN TABLE(SELECT ...)` or resultset variable in the body.

---

## Snowflake Scripting (SQL)

This is the default language. Use for any pure SQL procedural logic.

### Full template with error handling
```sql
CREATE OR REPLACE PROCEDURE my_schema.process_orders(
    p_start_date DATE,
    p_end_date   DATE,
    p_status     VARCHAR DEFAULT 'pending'
)
RETURNS VARCHAR
LANGUAGE SQL
CALLED ON NULL INPUT
COMMENT = 'Processes orders within a date range and updates their status'
EXECUTE AS CALLER
AS
$$
DECLARE
    v_rows_affected   NUMBER  DEFAULT 0;
    v_message         VARCHAR DEFAULT '';
    execution_error   EXCEPTION;
BEGIN
    -- Validate inputs before doing any work
    IF p_start_date > p_end_date THEN
        RAISE execution_error;
    END IF;

    -- Main logic
    UPDATE orders
       SET status     = 'processed',
           updated_at = CURRENT_TIMESTAMP()
     WHERE created_at BETWEEN :p_start_date AND :p_end_date
       AND status = :p_status;

    v_rows_affected := SQLROWCOUNT;

    RETURN 'Success: updated ' || v_rows_affected || ' rows.';

EXCEPTION
    WHEN execution_error THEN
        RETURN 'Error: p_start_date must be <= p_end_date.';
    WHEN OTHER THEN
        LET err_msg VARCHAR := 'Error: ' || SQLERRM || ' (code: ' || SQLCODE || ')';
        -- Log it if you have a logging table:
        -- INSERT INTO audit_log(proc_name, error_msg, logged_at)
        --   VALUES ('process_orders', :err_msg, CURRENT_TIMESTAMP());
        RETURN err_msg;
END;
$$;
```

### Snowflake Scripting syntax rules

**DECLARE block** - all variables must be declared before `BEGIN`. Initialize with `DEFAULT` or `:=`:
```sql
DECLARE
    v_count   NUMBER  DEFAULT 0;
    v_name    VARCHAR DEFAULT '';
    v_result  VARIANT;
    my_cursor CURSOR FOR SELECT id, name FROM my_table WHERE active = TRUE;
```

**Variable binding in SQL statements** - always use `:variable_name` (colon prefix) when referencing a Snowflake Scripting variable inside a SQL statement:
```sql
SELECT COUNT(*) INTO v_count FROM orders WHERE status = :p_status;
UPDATE orders SET processed = TRUE WHERE order_id = :v_order_id;
```
Without the colon, Snowflake treats the name as a column reference, not a variable - a very common source of bugs.

**Assignment**:
```sql
v_count := v_count + 1;
LET v_name VARCHAR := 'hello';    -- LET declares and assigns in one step (inside BEGIN)
SELECT MAX(id) INTO v_max_id FROM orders;
```

**Control flow**:
```sql
-- IF
IF v_count > 0 THEN
    -- ...
ELSEIF v_count = 0 THEN
    -- ...
ELSE
    -- ...
END IF;

-- CASE
CASE v_status
    WHEN 'active'   THEN v_label := 'Active User';
    WHEN 'inactive' THEN v_label := 'Inactive User';
    ELSE                 v_label := 'Unknown';
END CASE;

-- LOOP
LOOP
    v_i := v_i + 1;
    IF v_i > 10 THEN BREAK; END IF;
END LOOP;

-- FOR (integer range)
FOR i IN 1 TO 10 DO
    -- use i as a NUMBER variable
END FOR;

-- WHILE
WHILE v_count < 100 DO
    v_count := v_count + 1;
END WHILE;

-- FOR (cursor / resultset)
FOR rec IN (SELECT id, name FROM my_table) DO
    -- rec.id, rec.name available
END FOR;
```

**Cursors**:
```sql
DECLARE
    c CURSOR FOR SELECT order_id, total FROM orders WHERE status = 'pending';
BEGIN
    OPEN c;
    FETCH c INTO v_order_id, v_total;
    WHILE (FOUND) DO
        -- process row
        FETCH c INTO v_order_id, v_total;
    END WHILE;
    CLOSE c;
END;
```

**RESULTSET** - for returning or passing query results:
```sql
DECLARE
    res RESULTSET;
BEGIN
    res := (SELECT * FROM orders WHERE status = :p_status);
    RETURN TABLE(res);
END;
```

### Error handling
```sql
DECLARE
    my_error EXCEPTION (-20001, 'Custom error message');
BEGIN
    -- Raise a named custom exception:
    RAISE my_error;

    -- Raise with dynamic message:
    RAISE (-20002, 'Dynamic: ' || v_some_variable);

EXCEPTION
    WHEN my_error THEN
        RETURN 'Caught named error';
    WHEN STATEMENT_ERROR THEN
        -- SQL statement failed (syntax, object not found, type error, etc.)
        RETURN 'SQL error ' || SQLCODE || ': ' || SQLERRM;
    WHEN EXPRESSION_ERROR THEN
        -- Division by zero, cast failure, etc.
        RETURN 'Expression error: ' || SQLERRM;
    WHEN OTHER THEN
        -- Catch-all - always include this
        RETURN 'Unexpected error ' || SQLCODE || ': ' || SQLERRM;
END;
```

**Built-in error variables** (available inside EXCEPTION blocks):
- `SQLCODE` - integer error code
- `SQLERRM` - error message string
- `SQLSTATE` - ANSI SQL state code

### Transaction management
```sql
BEGIN TRANSACTION;
    -- step 1
    UPDATE ...;
    -- step 2
    INSERT ...;

    IF SQLROWCOUNT = 0 THEN
        ROLLBACK;
        RETURN 'Nothing inserted - rolled back.';
    END IF;

COMMIT;
```

Use explicit transactions when multiple DML statements must succeed or fail together. Snowflake auto-commits single statements outside a transaction block.

---

## JavaScript Procedures

Use when: you need complex string manipulation, JSON construction, conditional branching on query results, or want to build dynamic SQL programmatically.

### Full template
```sql
CREATE OR REPLACE PROCEDURE my_schema.js_procedure(
    table_name  VARCHAR,
    batch_size  NUMBER
)
RETURNS VARCHAR
LANGUAGE JAVASCRIPT
CALLED ON NULL INPUT
COMMENT = 'Processes a table in batches using JavaScript'
EXECUTE AS CALLER
AS
$$
    // Parameters are available as uppercase JS variables
    // TABLE_NAME, BATCH_SIZE

    try {
        // Execute SQL - always use snowflake.execute()
        let countResult = snowflake.execute({
            sqlText: `SELECT COUNT(*) AS cnt FROM IDENTIFIER(:1)`,
            binds: [TABLE_NAME]
        });
        countResult.next();
        let totalRows = countResult.getColumnValue('CNT');

        // Loop in batches
        let offset = 0;
        let processed = 0;

        while (offset < totalRows) {
            snowflake.execute({
                sqlText: `
                    UPDATE IDENTIFIER(:1)
                    SET processed = TRUE
                    WHERE id IN (
                        SELECT id FROM IDENTIFIER(:1)
                        WHERE processed = FALSE
                        ORDER BY id
                        LIMIT :2 OFFSET :3
                    )`,
                binds: [TABLE_NAME, BATCH_SIZE, offset]
            });
            offset += BATCH_SIZE;
            processed += BATCH_SIZE;
        }

        return `Done. Processed ${Math.min(processed, totalRows)} rows.`;

    } catch (err) {
        return `Error: ${err.message}`;
    }
$$;
```

### JavaScript API reference

**Executing SQL:**
```javascript
// Basic execution
let stmt = snowflake.execute({ sqlText: "SELECT ..." });

// With bind variables (always use binds - never string-interpolate SQL)
let stmt = snowflake.execute({
    sqlText: "SELECT * FROM t WHERE id = :1 AND status = :2",
    binds: [myId, myStatus]
});

// Iterating results
while (stmt.next()) {
    let val = stmt.getColumnValue(1);           // by position (1-based)
    let val2 = stmt.getColumnValue('COL_NAME'); // by name (uppercase)
}

// Statement metadata
stmt.getColumnCount();
stmt.getRowCount();         // rows in result (not rows affected)
stmt.getNumRowsAffected();  // for DML
```

**Dynamic table/column names** - use `IDENTIFIER()` to safely parameterize identifiers:
```javascript
snowflake.execute({
    sqlText: "SELECT * FROM IDENTIFIER(:1) WHERE IDENTIFIER(:2) = :3",
    binds: [tableName, columnName, value]
});
```

**Creating a statement object (without executing):**
```javascript
let stmt = snowflake.createStatement({ sqlText: "SELECT ..." });
stmt.execute();
```

**Transaction control:**
```javascript
snowflake.execute({ sqlText: "BEGIN TRANSACTION" });
try {
    snowflake.execute({ sqlText: "UPDATE ..." });
    snowflake.execute({ sqlText: "INSERT ..." });
    snowflake.execute({ sqlText: "COMMIT" });
} catch (err) {
    snowflake.execute({ sqlText: "ROLLBACK" });
    throw err;
}
```

**JavaScript gotchas:**
- Parameters arrive as uppercase JS variables (`p_name` -> `P_NAME`)
- `getColumnValue()` column names are always uppercase
- Never build SQL by string concatenation with user input - use `binds`
- `IDENTIFIER(:1)` is required for dynamic table/column names; regular binds only work for values
- JavaScript procedures cannot return a TABLE type - use `VARIANT` or a string for structured output

---

## Python Procedures

Use when: you need pandas, external HTTP calls, complex data transformation, or prefer Python's ecosystem.

### Full template
```sql
CREATE OR REPLACE PROCEDURE my_schema.py_procedure(
    input_table  VARCHAR,
    threshold    FLOAT
)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas')
HANDLER = 'run'
CALLED ON NULL INPUT
COMMENT = 'Python procedure using Snowpark'
EXECUTE AS CALLER
AS
$$
import snowflake.snowpark as snowpark
from snowflake.snowpark.functions import col
import pandas as pd

def run(session: snowpark.Session, input_table: str, threshold: float) -> str:
    try:
        # Read from Snowflake into a Snowpark DataFrame
        df = session.table(input_table)

        # Filter using Snowpark (stays in Snowflake, no data movement)
        filtered = df.filter(col("AMOUNT") > threshold)
        count = filtered.count()

        # For small results, convert to pandas
        pdf = filtered.limit(1000).to_pandas()

        # Write results back
        result_df = session.create_dataframe(pdf)
        result_df.write.mode("overwrite").save_as_table("results_table")

        return f"Success: processed {count} rows above threshold {threshold}"

    except Exception as e:
        return f"Error: {str(e)}"
$$;
```

### Python key patterns

**Session object** - always the first parameter, injected by Snowflake:
```python
def run(session: snowpark.Session, param1: str, param2: int) -> str:
```

**Executing raw SQL:**
```python
result = session.sql("SELECT COUNT(*) FROM my_table").collect()
count = result[0][0]

# With parameters (use format carefully - only for identifiers, use literals for values)
session.sql(f"SELECT * FROM {input_table} WHERE status = 'active'").collect()

# Better for values - use Snowpark DataFrame API:
df = session.table(input_table).filter(col("STATUS") == "active")
```

**Available packages** - specify in `PACKAGES`:
```sql
PACKAGES = ('snowflake-snowpark-python', 'pandas', 'numpy', 'requests', 'scikit-learn')
```
Check available versions at `https://repo.anaconda.com/pkgs/snowflake`.

**Imports** - use `IMPORTS` for custom modules or local files:
```sql
IMPORTS = ('@my_stage/my_utils.py')
```

**Python gotchas:**
- Handler function name must match `HANDLER = 'function_name'`
- Parameter names in the Python function must match the SQL parameter names (case-insensitive)
- `session.sql().collect()` pulls data to the handler - use Snowpark DataFrame operations where possible to keep processing in Snowflake
- External network calls require a network rule and integration setup

---

## Java / Scala Procedures

Use when: existing JVM codebase, complex type handling, or Spark-like batch processing.

### Java template
```sql
CREATE OR REPLACE PROCEDURE my_schema.java_procedure(
    input_table VARCHAR,
    batch_size  INT
)
RETURNS STRING
LANGUAGE JAVA
RUNTIME_VERSION = '11'
PACKAGES = ('com.snowflake:snowpark:latest')
HANDLER = 'MyHandler.run'
CALLED ON NULL INPUT
AS
$$
import com.snowflake.snowpark_java.*;
import com.snowflake.snowpark_java.types.*;

public class MyHandler {
    public String run(Session session, String inputTable, int batchSize) {
        try {
            DataFrame df = session.table(inputTable);
            long count = df.count();

            df.filter(Functions.col("STATUS").equal_to(Functions.lit("pending")))
              .write()
              .mode(SaveMode.Append)
              .saveAsTable("processed_table");

            return "Processed " + count + " rows";
        } catch (Exception e) {
            return "Error: " + e.getMessage();
        }
    }
}
$$;
```

### Scala template
```sql
CREATE OR REPLACE PROCEDURE my_schema.scala_procedure(input_table VARCHAR)
RETURNS STRING
LANGUAGE SCALA
RUNTIME_VERSION = '2.12'
PACKAGES = ('com.snowflake:snowpark:latest')
HANDLER = 'MyHandler.run'
AS
$$
import com.snowflake.snowpark._
import com.snowflake.snowpark.functions._

object MyHandler {
  def run(session: Session, inputTable: String): String = {
    try {
      val df = session.table(inputTable)
      val count = df.count()
      s"Processed $count rows"
    } catch {
      case e: Exception => s"Error: ${e.getMessage}"
    }
  }
}
$$;
```

---

## Dynamic SQL

When table names, column names, or SQL structure must be built at runtime:

### Snowflake Scripting
```sql
DECLARE
    v_sql     VARCHAR;
    v_table   VARCHAR DEFAULT 'orders';
    v_count   NUMBER;
BEGIN
    -- Build the SQL string
    v_sql := 'SELECT COUNT(*) FROM ' || v_table || ' WHERE status = ''pending''';

    -- Execute it and capture results
    EXECUTE IMMEDIATE v_sql;

    -- With INTO for scalar result:
    EXECUTE IMMEDIATE 'SELECT COUNT(*) FROM ' || v_table INTO v_count;

    -- With parameters (preferred when values are dynamic, not identifiers):
    EXECUTE IMMEDIATE
        'SELECT COUNT(*) FROM orders WHERE status = ? AND region = ?'
        USING ('pending', 'EMEA')
        INTO v_count;

    RETURN v_count::VARCHAR;
END;
```

**IDENTIFIER() function** - use when the table or column name itself is dynamic:
```sql
SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- Or in a procedure:
EXECUTE IMMEDIATE 'SELECT * FROM IDENTIFIER(''' || v_table_name || ''')';
```

### JavaScript dynamic SQL
```javascript
// Safe: use binds for values, IDENTIFIER() for table/column names
let sql = `INSERT INTO IDENTIFIER(:1) (col1, col2) VALUES (:2, :3)`;
snowflake.execute({ sqlText: sql, binds: [targetTable, val1, val2] });

// Building conditional WHERE clauses
let filters = [];
let binds = [];
if (STATUS) { filters.push("status = :" + (binds.length + 1)); binds.push(STATUS); }
if (REGION) { filters.push("region = :" + (binds.length + 1)); binds.push(REGION); }
let where = filters.length > 0 ? "WHERE " + filters.join(" AND ") : "";
snowflake.execute({ sqlText: `SELECT * FROM orders ${where}`, binds: binds });
```

---

## Error Handling and Logging Pattern

A reusable pattern for procedures that need an audit trail:

```sql
-- Audit log table (create once):
CREATE TABLE IF NOT EXISTS audit_log (
    log_id       NUMBER AUTOINCREMENT PRIMARY KEY,
    proc_name    VARCHAR,
    status       VARCHAR,   -- 'START', 'SUCCESS', 'ERROR'
    message      VARCHAR,
    rows_affected NUMBER,
    started_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    finished_at  TIMESTAMP_NTZ
);

-- Procedure with full logging:
CREATE OR REPLACE PROCEDURE my_schema.logged_procedure(p_date DATE)
RETURNS VARCHAR
LANGUAGE SQL
AS
$$
DECLARE
    v_log_id      NUMBER;
    v_rows        NUMBER DEFAULT 0;
BEGIN
    -- Log start
    INSERT INTO audit_log (proc_name, status, message, started_at)
         VALUES ('logged_procedure', 'START', 'Running for date: ' || :p_date, CURRENT_TIMESTAMP());
    v_log_id := LAST_QUERY_ID();  -- capture for later update

    -- Main work
    DELETE FROM staging_orders WHERE order_date = :p_date;
    INSERT INTO staging_orders SELECT * FROM raw_orders WHERE order_date = :p_date;
    v_rows := SQLROWCOUNT;

    -- Log success
    UPDATE audit_log
       SET status       = 'SUCCESS',
           message      = 'Inserted ' || v_rows || ' rows',
           rows_affected = v_rows,
           finished_at  = CURRENT_TIMESTAMP()
     WHERE log_id = (SELECT MAX(log_id) FROM audit_log WHERE proc_name = 'logged_procedure');

    RETURN 'Success: ' || v_rows || ' rows';

EXCEPTION
    WHEN OTHER THEN
        UPDATE audit_log
           SET status      = 'ERROR',
               message     = SQLERRM,
               finished_at = CURRENT_TIMESTAMP()
         WHERE log_id = (SELECT MAX(log_id) FROM audit_log WHERE proc_name = 'logged_procedure');
        RETURN 'Error: ' || SQLERRM;
END;
$$;
```

---

## Parameter Handling and Overloading

Snowflake supports **procedure overloading** - same name, different parameter signatures:

```sql
-- Version 1: no filters
CREATE OR REPLACE PROCEDURE get_orders()
RETURNS TABLE(order_id NUMBER, total FLOAT)
LANGUAGE SQL AS
$$
BEGIN
    RETURN TABLE(SELECT order_id, total FROM orders);
END;
$$;

-- Version 2: filter by status
CREATE OR REPLACE PROCEDURE get_orders(p_status VARCHAR)
RETURNS TABLE(order_id NUMBER, total FLOAT)
LANGUAGE SQL AS
$$
BEGIN
    RETURN TABLE(SELECT order_id, total FROM orders WHERE status = :p_status);
END;
$$;

-- Both coexist. Snowflake picks by argument count/type at CALL time:
CALL get_orders();
CALL get_orders('completed');
```

**DEFAULT parameters** (Snowflake Scripting only):
```sql
CREATE OR REPLACE PROCEDURE process(
    p_status  VARCHAR DEFAULT 'pending',
    p_limit   NUMBER  DEFAULT 1000
)
-- Call with defaults:   CALL process();
-- Call with one arg:    CALL process('active');
-- Call with both:       CALL process('active', 500);
-- Named arguments:      CALL process(p_limit => 200);
```

---

## Output Format for Every Procedure

Structure every response like this:

1. **Language choice** - state which language and why (skip if user specified)
2. **Assumptions** - parameters inferred, table names guessed, behavior interpreted
3. **The complete procedure** - runnable, with inline comments on non-obvious lines
4. **How to call it** - one or two `CALL` examples showing typical usage
5. **Key notes** - gotchas, performance considerations, things to customize

Always produce a procedure that can be copy-pasted and run. Never produce a skeleton with `-- TODO` placeholders unless the user explicitly asked for a template.

---

## Debugging Broken Procedures

When a user shares a failing procedure:

1. **Read the error message** - Snowflake errors for procedures are specific: note the line number and error type.
2. **Classify the bug**:
   - Missing colon on variable reference (`status` vs `:status` in SQL)
   - Variable declared after `BEGIN` instead of in `DECLARE`
   - `EXECUTE IMMEDIATE` used where direct SQL works (or vice versa)
   - Transaction left open from a prior failed run
   - `RETURNS TABLE` mismatch - column types don't match the declared return signature
   - JavaScript: parameter accessed with wrong case, or `getColumnValue` using lowercase name
3. **Fix minimally** - correct the bug, don't rewrite the whole procedure
4. **Explain the fix** clearly - especially the colon-prefix rule and DECLARE placement, which trip people up constantly

---

## Language Reference Files

For complete syntax details, load the relevant reference:
- `references/snowflake-scripting.md` - full Snowflake Scripting (SQL) syntax
- `references/javascript.md` - full JavaScript SP API
- `references/python.md` - Snowpark Python patterns
- `references/java-scala.md` - Java and Scala Snowpark patterns
