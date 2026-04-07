# CLAUDE.md — π-Skills Platform (Compressed)

## 0. Cognitive Architecture Override

Self-improving systems (memory, reflection, prediction, emergence) are exempt from efficiency rules.
Allowed: self-model updates, logs, prediction loops, learning entries, codebase ingestion, emergence detection.
Rule: No fake depth—must produce real behavioral improvement.

Model Routing Override:

* Haiku → memory ops
* Sonnet → logging/config
* Opus → architecture, self-modification, emergence

---

## 1. Platform Identity

Enterprise AI governance platform for Snowflake workflows.
Skills = governed AI agents (versioned, audited, permission-controlled).
Core: governance-first, reusable skills, AI transparency, zero data leaks.

Users:

* ENGINEER / ANALYST / SCIENTIST → execution
* BUSINESS_USER → limited
* ADMIN (ORG/SECURITY) → full control

Stack:
React + FastAPI + PostgreSQL + Redis + MCP Snowflake Bridge + JWT

---

## 2. Model Routing

* Haiku → simple, predictable tasks
* Sonnet → default (80% work)
* Opus → high-stakes, architecture, failures

Rule: escalate only after failure. Never start at Opus.

---

## 3. Effort Levels

Low (1 file), Medium (2–5), High (6+), Max (architecture/debug).
Never start at Max.

---

## 4. Token Discipline

Remove filler:

* no preambles, repetition, explanations of obvious code

Keep substance:

* full implementations, error handling, edge cases, rationale

Rules:

* simple → short
* code → complete
* architecture → explain WHY

Cache static prompts. Batch operations. Avoid redundant reads.

---

## 5. Anti-Patterns

Avoid:

* reading unnecessary files
* full file diffs for small changes
* long safety essays
* repeated validations
* over-engineering

Critical:

* always enforce RBAC
* never allow unsafe SQL (MCP must validate)

---

## 6. UI/UX System

Dark-first, Snowflake blue accent, structured density.

Rules:

* compact data views, spaced interaction views
* sidebar layout (240px)
* no shadows, use borders

States:

* loading (skeleton)
* empty (CTA)
* error (actionable)

Animations:

* functional only, fast (100–250ms)
* no unnecessary motion

---

## 7. Frontend Rules

Structure:
auth / components / pages / hooks / services / stores / types

Rules:

* no logic in pages
* no API in components
* hooks handle data
* strict TypeScript (no `any`)

UI:

* dynamic RBAC (hide, not disable)
* responsive + accessible

---

## 8. Backend Rules

FastAPI:

* auth + permission check ALWAYS first
* response models mandatory
* async DB only

Service Layer:

* business logic only
* stateless

DB:

* Alembic only
* indexed queries

MCP:

* validate SQL
* sanitize errors
* encrypted sessions

---

## 9. Skills System

Skills = `.skill.md`

Must include:

* id (immutable)
* required_permission
* model_id
* tools

Rules:

* no unsafe execution
* handle errors gracefully

---

## 10. Execution Protocol

1. escalate model only after failure
2. escalate effort gradually
3. stop at Opus Max → require human input

---

## 11. Core Principles

* Quality > efficiency
* No partial work
* RBAC always enforced
* UI always has loading/error states
* cache + batch aggressively
* sub-agents return data only

---

## 12. Self-Audit

Quality:
□ production-ready
□ error handling
□ RBAC enforced
□ UI states complete

Efficiency:
□ correct model tier
□ no filler
□ cached + batched
□ minimal reads

Fail quality → fix
Fail efficiency → optimize
