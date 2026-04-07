import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { Send, X, Bot, User, Play, Activity, Plus, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { mcpClient } from '../api/mcpClient';
import type { ChatModel } from '../types';

type ProcedureLanguage = 'SQL' | 'JAVASCRIPT' | 'PYTHON';

type ProcedurePreferences = {
  language: ProcedureLanguage;
  executeAs: 'CALLER' | 'OWNER';
  includeLogging: boolean;
  returnStyle: 'TEXT' | 'TABLE';
};

type PendingProcedureContext = {
  originalPrompt: string;
  resolvedTable: string;
};

type GuidedFeedbackStep = {
  id: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
};

type GuidedFeedbackState = {
  basePrompt: string;
  skill: string;
  stepIndex: number;
  selections: Record<string, string[]>;
};

type OptimizerRewriteCandidate = {
  originalSql: string;
  optimizedSql: string;
  feedback: string;
};

type DiffLine = {
  kind: 'context' | 'add' | 'remove';
  text: string;
};

const DEFAULT_PROCEDURE_PREFERENCES: ProcedurePreferences = {
  language: 'SQL',
  executeAs: 'CALLER',
  includeLogging: true,
  returnStyle: 'TEXT',
};

const GUIDED_FEEDBACK_STEPS: Record<string, GuidedFeedbackStep[]> = {
  'Data Architect': [
    {
      id: 'objective',
      question: 'What should this help with?',
      options: [
        'Design data models from requirements',
        'Review existing schemas critically',
        'Design warehouse or data marts',
        'Define naming standards',
      ],
      multiSelect: true,
    },
    {
      id: 'scope',
      question: 'What scope should be prioritized?',
      options: ['Core entities first', 'End-to-end domain', 'Quick MVP first', 'Production-grade design'],
      multiSelect: false,
    },
    {
      id: 'output',
      question: 'What output do you want first?',
      options: ['ERD-style structure', 'DDL-ready schema', 'Review findings', 'Action plan with phases'],
      multiSelect: false,
    },
  ],
  'SQL Writer': [
    {
      id: 'goal',
      question: 'What type of query is needed?',
      options: ['Analytical summary', 'Top-N ranking', 'Trend by time', 'Data quality check'],
      multiSelect: false,
    },
    {
      id: 'filters',
      question: 'Which constraints should be applied?',
      options: ['Last 30 days', 'Current quarter', 'By selected schema', 'Safe LIMIT required'],
      multiSelect: true,
    },
    {
      id: 'format',
      question: 'How should output be optimized?',
      options: ['Readable SQL first', 'Performance first', 'Explain assumptions too', 'Include verification query'],
      multiSelect: true,
    },
  ],
  'Query Optimizer': [
    {
      id: 'pain',
      question: 'Where is the biggest pain?',
      options: ['Slow runtime', 'High credits', 'High bytes scanned', 'Spill to disk'],
      multiSelect: true,
    },
    {
      id: 'focus',
      question: 'Which optimization focus should be first?',
      options: ['Pruning & filters', 'Join strategy', 'Aggregation rewrite', 'Clustering / materialization'],
      multiSelect: false,
    },
    {
      id: 'validation',
      question: 'How should we verify improvement?',
      options: ['Execution time delta', 'Partitions pruned', 'Bytes scanned', 'Query profile hotspots'],
      multiSelect: true,
    },
  ],
};

const MODEL_OPTIONS: Array<{ group: string; models: Array<{ value: ChatModel; label: string }> }> = [
  {
    group: 'Gemini (AI Studio)',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (free)' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    group: 'OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o-mini' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1-mini' },
      { value: 'o3-mini', label: 'o3-mini' },
    ],
  },
];

const SQL_START_PATTERN = /^(select|with|describe|desc)\b/i;
const SQL_SHOW_PATTERN = /^show\s+(databases|schemas|tables|views|warehouses|roles|users|grants|columns|parameters|tasks|functions|procedures)\b/i;

function isLikelySql(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }
  if (SQL_START_PATTERN.test(trimmed) || SQL_SHOW_PATTERN.test(trimmed)) {
    return true;
  }

  const hasSqlStructure = /\bfrom\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\blimit\b/i.test(trimmed);
  return /;\s*$/.test(trimmed) && hasSqlStructure;
}

function extractTopN(prompt: string): number {
  // Try multiple patterns, in priority order
  
  // Pattern 1: "top N" (e.g., "top 10")
  let match = prompt.match(/\btop\s+(\d+)\b/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 1000);
    }
  }

  // Pattern 2: "only N records/rows/entries" (e.g., "only 10 records", "only 5 rows")
  match = prompt.match(/\bonly\s+(\d+)\s+(?:records?|rows?|entries?)\b/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 1000);
    }
  }

  // Pattern 3: "N records/rows/entries" without "only" (e.g., "10 records", "5 rows")
  match = prompt.match(/\b(\d+)\s+(?:records?|rows?|entries?)\b/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 1000);
    }
  }

  // Pattern 4: "limit N" (e.g., "limit 10")
  match = prompt.match(/\blimit\s+(\d+)\b/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 1000);
    }
  }

  // Default fallback
  return 20;
}

function extractLookbackDays(prompt: string): number {
  const match = prompt.match(/\blast\s+(\d+)\s+days?\b/i);
  if (!match) {
    return 30;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }
  return Math.min(parsed, 3650);
}

function resolveTableName(prompt: string, selectedTables: string[], selectedSchema: string): string {
  if (selectedTables.length > 0) {
    const qualified = splitQualifiedName(selectedTables[0]);
    const preferredSchema = selectedSchema !== 'AUTO' ? selectedSchema : qualified.schema;
    return `${qualified.database}.${preferredSchema}.${qualified.table}`;
  }

  const fromMatch = prompt.match(/\bfrom\s+([a-zA-Z0-9_$.]+)/i);
  if (fromMatch && fromMatch[1]) {
    const fromTable = fromMatch[1].replace(/[;,.]+$/, '');
    const qualified = splitQualifiedName(fromTable);
    const preferredSchema = selectedSchema !== 'AUTO' ? selectedSchema : qualified.schema;
    return `${qualified.database}.${preferredSchema}.${qualified.table}`;
  }

  const fallbackSchema = selectedSchema !== 'AUTO' ? selectedSchema : 'BRONZE';
  return `BANKING.${fallbackSchema}.ACCOUNT`;
}

function splitQualifiedName(name: string): { database: string; schema: string; table: string } {
  const raw = name.replace(/[;\s]+$/, '');
  const parts = raw.split('.').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      database: parts[0],
      schema: parts[1],
      table: parts[2],
    };
  }
  if (parts.length === 2) {
    return {
      database: 'BANKING',
      schema: parts[0],
      table: parts[1],
    };
  }
  return {
    database: 'BANKING',
    schema: 'BRONZE',
    table: parts[0] || 'ACCOUNT',
  };
}

function inferMetricColumn(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  const directMappings: Array<{ pattern: RegExp; column: string }> = [
    { pattern: /\bloan\s+amount\b/, column: 'loan_amount' },
    { pattern: /\brevenue\b|\bsales\b/, column: 'revenue' },
    { pattern: /\bbalance\b/, column: 'balance' },
    { pattern: /\binterest\b/, column: 'interest_amount' },
    { pattern: /\bpayment\b/, column: 'payment_amount' },
    { pattern: /\bamount\b/, column: 'amount' },
    { pattern: /\bscore\b/, column: 'score' },
  ];

  for (const mapping of directMappings) {
    if (mapping.pattern.test(normalized)) {
      return mapping.column;
    }
  }

  const topPhrase = prompt.match(/\btop(?:\s+\d+)?\s+([a-zA-Z0-9_ ]+?)(?:\s+by|\s+from|\s+in|$)/i);
  if (!topPhrase || !topPhrase[1]) {
    return null;
  }

  const candidate = topPhrase[1].trim().toLowerCase().replace(/\s+/g, '_');
  if (!candidate || /^(row|rows|record|records|customer|customers|loan|loans|account|accounts)$/.test(candidate)) {
    return null;
  }
  return candidate;
}

function inferEntityColumns(prompt: string): string[] {
  const normalized = prompt.toLowerCase();
  if (normalized.includes('customer')) {
    return ['customer_id'];
  }
  if (normalized.includes('loan')) {
    return ['loan_id', 'customer_id'];
  }
  if (normalized.includes('account')) {
    return ['account_id', 'customer_id'];
  }
  return [];
}

function extractWhereConditions(prompt: string): string | null {
  const normalized = prompt.toLowerCase();
  const conditions: string[] = [];

  // Extract "column greater than value" patterns
  const gtMatches = prompt.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)[\s]*(?:greater\s+than|>|gt)[\s]*(\d+(?:\.\d+)?)/gi);
  if (gtMatches) {
    gtMatches.forEach((match) => {
      const parts = match.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:greater\s+than|>|gt)\s*(\d+(?:\.\d+)?)/i);
      if (parts) {
        conditions.push(`${parts[1]} > ${parts[2]}`);
      }
    });
  }

  // Extract "column less than value" patterns
  const ltMatches = prompt.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)[\s]*(?:less\s+than|<|lt)[\s]*(\d+(?:\.\d+)?)/gi);
  if (ltMatches) {
    ltMatches.forEach((match) => {
      const parts = match.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:less\s+than|<|lt)\s*(\d+(?:\.\d+)?)/i);
      if (parts) {
        conditions.push(`${parts[1]} < ${parts[2]}`);
      }
    });
  }

  // Extract "column equals/is/as value" patterns (e.g., "status is active", "account_status as closed")
  const eqMatches = prompt.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:equals?|is|as|=)\s+([a-zA-Z0-9_'-]+)/gi);
  if (eqMatches) {
    eqMatches.forEach((match) => {
      const parts = match.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:equals?|is|as|=)\s+([a-zA-Z0-9_'-]+)$/i);
      if (parts) {
        const value = /^[0-9]/.test(parts[2]) ? parts[2] : `'${parts[2]}'`;
        conditions.push(`${parts[1]} = ${value}`);
      }
    });
  }

  // Extract "column >= value" patterns
  const gteMatches = prompt.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)[\s]*(?:greater\s+than\s+or\s+equals?|>=|gte)[\s]*(\d+(?:\.\d+)?)/gi);
  if (gteMatches) {
    gteMatches.forEach((match) => {
      const parts = match.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:greater\s+than\s+or\s+equals?|>=|gte)\s*(\d+(?:\.\d+)?)/i);
      if (parts) {
        conditions.push(`${parts[1]} >= ${parts[2]}`);
      }
    });
  }

  // Extract "column <= value" patterns
  const lteMatches = prompt.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)[\s]*(?:less\s+than\s+or\s+equals?|<=|lte)[\s]*(\d+(?:\.\d+)?)/gi);
  if (lteMatches) {
    lteMatches.forEach((match) => {
      const parts = match.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:less\s+than\s+or\s+equals?|<=|lte)\s*(\d+(?:\.\d+)?)/i);
      if (parts) {
        conditions.push(`${parts[1]} <= ${parts[2]}`);
      }
    });
  }

  if (conditions.length === 0) {
    return null;
  }

  return conditions.join(' AND ');
}

function isStoredProcedureRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return (
    /\bstored\s+proc[a-z]*\b/.test(normalized)
    || /\bcreate\s+(or\s+replace\s+)?proc(?:edure)?\b/.test(normalized)
    || /\bproc(?:edure)?\b/.test(normalized)
    || /\bsp\b/.test(normalized)
    || /\bcall\b/.test(normalized)
  );
}

function detectProcedureLanguage(text: string): ProcedureLanguage | null {
  const normalized = text.toLowerCase();
  if (normalized.includes('javascript') || normalized.includes('js procedure')) {
    return 'JAVASCRIPT';
  }
  if (normalized.includes('python')) {
    return 'PYTHON';
  }
  if (normalized.includes('snowflake scripting') || normalized.includes('language sql') || normalized.includes('sql procedure')) {
    return 'SQL';
  }
  return null;
}

function parseProcedurePreferences(input: string, fallbackLanguage: ProcedureLanguage = 'SQL'): ProcedurePreferences {
  const normalized = input.toLowerCase();
  const detectedLanguage = detectProcedureLanguage(input) || fallbackLanguage;
  const executeAs = normalized.includes('owner') ? 'OWNER' : 'CALLER';
  const includeLogging = /\blogging\b|\baudit\b|\bfeedback\s*loop\b/.test(normalized) && !/\bno\s+logging\b/.test(normalized);
  const returnStyle = /\breturns?\s+table\b|\breturn\s+table\b|\btable\s+result\b|\bcolumns\b|\bmetadata\b/.test(normalized)
    ? 'TABLE'
    : 'TEXT';

  return {
    language: detectedLanguage,
    executeAs,
    includeLogging,
    returnStyle,
  };
}

function buildProcedureQuestionPrompt(context: PendingProcedureContext, defaults?: ProcedurePreferences): string {
  const detected = defaults
    ? `Detected from prompt: language=${defaults.language.toLowerCase()}, execute_as=${defaults.executeAs.toLowerCase()}, logging=${defaults.includeLogging ? 'yes' : 'no'}, return=${defaults.returnStyle.toLowerCase()}`
    : null;

  return [
    'Stored procedure request detected. I will generate a production-ready procedure after these choices.',
    ...(detected ? [detected] : []),
    `1. Language: SQL, JavaScript, or Python?`,
    '2. Execution mode: EXECUTE AS CALLER or OWNER?',
    '3. Include audit logging / feedback loop table updates? (yes/no)',
    '4. Return type: TEXT status or TABLE output?',
    `Current table context: ${context.resolvedTable}`,
    'Reply in one line, for example: language=sql; execute_as=caller; logging=yes; return=table',
  ].join('\n');
}

function buildProcedureConfigLine(preferences: ProcedurePreferences): string {
  return [
    `language=${preferences.language.toLowerCase()}`,
    `execute_as=${preferences.executeAs.toLowerCase()}`,
    `logging=${preferences.includeLogging ? 'yes' : 'no'}`,
    `return=${preferences.returnStyle.toLowerCase()}`,
  ].join('; ');
}

function getPrimaryGuidedSkill(activeSkills: string[]): string | null {
  for (const skill of activeSkills) {
    if (skill in GUIDED_FEEDBACK_STEPS && skill !== 'Stored Procedure Writer') {
      return skill;
    }
  }
  return null;
}

function shouldStartGuidedFeedback(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 6) {
    return true;
  }
  return /\bsimple\b|\boptimize\b|\bhelp\b|\bcreate\b|\bbuild\b|\bwrite\b/.test(normalized);
}

function formatGuidedFeedbackContext(skill: string, selections: Record<string, string[]>): string {
  const steps = GUIDED_FEEDBACK_STEPS[skill] || [];
  const lines: string[] = [];
  for (const step of steps) {
    const chosen = selections[step.id] || [];
    if (chosen.length > 0) {
      lines.push(`${step.question}: ${chosen.join(', ')}`);
    }
  }

  if (lines.length === 0) {
    return '';
  }

  return [
    '',
    `Guided feedback (${skill}):`,
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

function extractSqlFromPrompt(prompt: string): string | null {
  const sqlStart = prompt.match(/(?:^|\n)\s*(create|select|with|call|show|describe|desc)\b[\s\S]*/i);
  if (!sqlStart) {
    return null;
  }
  return sqlStart[0].trim();
}

function optimizeSqlForSnowflake(sql: string): { optimizedSql: string; changes: string[] } {
  let optimized = sql.trim();
  const changes: string[] = [];

  const boundedSelectPattern = /SELECT\s+COUNT\(\*\)\s+INTO\s+v_rows\s+FROM\s+TMP_PROC_RESULT\s*;/i;
  const tempTablePattern = /CREATE\s+TEMP\s+TABLE\s+TMP_PROC_RESULT\s+AS\s+SELECT\s+\*\s+FROM\s+([A-Za-z0-9_.]+)\s+LIMIT\s*:p_limit\s*;/i;
  const tempMatch = optimized.match(tempTablePattern);

  if (tempMatch && boundedSelectPattern.test(optimized)) {
    const sourceTable = tempMatch[1];
    optimized = optimized.replace(
      /CREATE\s+TEMP\s+TABLE\s+TMP_PROC_RESULT\s+AS\s+SELECT\s+\*\s+FROM\s+[A-Za-z0-9_.]+\s+LIMIT\s*:p_limit\s*;\s*SELECT\s+COUNT\(\*\)\s+INTO\s+v_rows\s+FROM\s+TMP_PROC_RESULT\s*;/i,
      `SELECT COUNT(*) INTO v_rows\n  FROM (\n    SELECT 1\n    FROM ${sourceTable}\n    LIMIT :p_limit\n  ) bounded_rows;`,
    );
    changes.push('Removed temporary table materialization and replaced it with bounded inline counting.');
  }

  const hasSqlProcedure = /LANGUAGE\s+SQL/i.test(optimized) && /CREATE\s+OR\s+REPLACE\s+PROCEDURE/i.test(optimized);
  const hasExceptionBlock = /\bEXCEPTION\b/i.test(optimized);
  if (hasSqlProcedure && !hasExceptionBlock && /END;\s*\$\$;\s*$/i.test(optimized)) {
    optimized = optimized.replace(
      /END;\s*\$\$;\s*$/i,
      `EXCEPTION\n  WHEN OTHER THEN\n    RETURN 'Error: ' || SQLERRM || ' (code: ' || SQLCODE || ')';\nEND;\n$$;`,
    );
    changes.push('Added explicit EXCEPTION handler for safer operational behavior.');
  }

  if (changes.length === 0) {
    const trimmed = optimized.replace(/;\s*$/, '');
    const selectLike = /^(with|select)\b/i.test(trimmed);
    const ctasMatch = trimmed.match(/^create\s+or\s+replace\s+table\s+([A-Za-z0-9_."$]+)\s+as\s+([\s\S]+)$/i);

    if (ctasMatch) {
      const targetTable = ctasMatch[1];
      const selectBody = ctasMatch[2].trim().replace(/;\s*$/, '');
      optimized = `CREATE OR REPLACE TABLE ${targetTable} AS\nWITH optimizer_base AS (\n${selectBody}\n)\nSELECT *\nFROM optimizer_base;`;
      changes.push('Applied a concrete CTE-based rewrite so further projection/filter tuning can be layered safely.');
    } else if (selectLike) {
      optimized = `WITH optimizer_base AS (\n${trimmed}\n)\nSELECT *\nFROM optimizer_base;`;
      changes.push('Applied a concrete CTE-based rewrite to create a stable optimization baseline.');
    } else {
      // Fallback still provides a concrete, executable rewrite marker for command-style statements.
      optimized = `/* optimizer rewrite marker */\n${trimmed};`;
      changes.push('Added a concrete rewrite marker for command-style SQL where structural rewrite is limited.');
    }
  }

  return { optimizedSql: optimized, changes };
}

function buildOptimizerFeedback(changes: string[], hadSql: boolean): string {
  if (!hadSql) {
    return [
      'Query Optimizer feedback:',
      '1. I could not find a runnable SQL block in your prompt.',
      '2. Please paste the SQL (or start with CREATE/SELECT/WITH) and I will optimize it with detailed feedback.',
    ].join('\n');
  }

  const changeLines = changes.length > 0
    ? changes.map((change, index) => `${index + 1}. ${change}`).join('\n')
    : '1. Preserved logic and formatting because no safe structural optimization was required.';

  return [
    'Query Optimizer feedback:',
    'Diagnosis: The query can be made more execution-friendly while preserving behavior.',
    'What changed:',
    changeLines,
    'How to verify:',
    '1. Run the optimized SQL and compare execution time, bytes scanned, and spill indicators in query profile.',
    '2. Confirm returned results match expected business output before production use.',
    '3. No query is auto-executed. Review and run manually in SQL Editor.',
  ].join('\n');
}

function buildInlineDiffLines(originalSql: string, optimizedSql: string): DiffLine[] {
  const originalLines = originalSql.replace(/\r\n/g, '\n').split('\n');
  const optimizedLines = optimizedSql.replace(/\r\n/g, '\n').split('\n');
  const n = originalLines.length;
  const m = optimizedLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (originalLines[i] === optimizedLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (originalLines[i] === optimizedLines[j]) {
      diff.push({ kind: 'context', text: originalLines[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ kind: 'remove', text: originalLines[i] });
      i += 1;
    } else {
      diff.push({ kind: 'add', text: optimizedLines[j] });
      j += 1;
    }
  }

  while (i < n) {
    diff.push({ kind: 'remove', text: originalLines[i] });
    i += 1;
  }

  while (j < m) {
    diff.push({ kind: 'add', text: optimizedLines[j] });
    j += 1;
  }

  return diff;
}

function buildProcedureName(prompt: string, tableName: string): string {
  const qualified = splitQualifiedName(tableName);
  const base = qualified.table.toUpperCase();
  if (/\bcolumn\b|\bmetadata\b/i.test(prompt)) {
    return `SP_${base}_COLUMNS`;
  }
  if (/\bduplicate\b|\bsame\s+account\s+id\b/i.test(prompt)) {
    return `SP_${base}_DUPLICATE_ACCOUNTS`;
  }
  return `SP_${base}_PROCESS`;
}

function buildStoredProcedureSql(prompt: string, tableName: string, preferences: ProcedurePreferences): string {
  const qualified = splitQualifiedName(tableName);
  const schemaRef = `${qualified.database}.${qualified.schema}`;
  const procedureName = `${schemaRef}.${buildProcedureName(prompt, tableName)}`;
  const needsColumnsOutput = /\bcolumn\b|\bmetadata\b/i.test(prompt);

  if (preferences.language === 'JAVASCRIPT') {
    return `CREATE OR REPLACE PROCEDURE ${procedureName}(p_limit NUMBER DEFAULT 100)\nRETURNS VARCHAR\nLANGUAGE JAVASCRIPT\nCALLED ON NULL INPUT\nCOMMENT = 'Generated JavaScript stored procedure'\nEXECUTE AS ${preferences.executeAs}\nAS\n$$\ntry {\n  var sqlText = \`SELECT * FROM ${tableName} LIMIT \${P_LIMIT}\`;\n  var stmt = snowflake.execute({ sqlText: sqlText });\n  var rows = stmt.getRowCount();\n  ${preferences.includeLogging ? `snowflake.execute({ sqlText: "INSERT INTO ${schemaRef}.PROC_AUDIT_LOG(PROC_NAME, STATUS, MESSAGE, LOGGED_AT) VALUES ('${buildProcedureName(prompt, tableName)}', 'SUCCESS', 'Rows processed: ' || :1, CURRENT_TIMESTAMP())", binds: [rows] });` : ''}\n  return 'Success: processed rows for ${tableName}';\n} catch (err) {\n  return 'Error: ' + err.message;\n}\n$$;`;
  }

  if (preferences.language === 'PYTHON') {
    return `CREATE OR REPLACE PROCEDURE ${procedureName}(p_limit NUMBER DEFAULT 100)\nRETURNS VARCHAR\nLANGUAGE PYTHON\nRUNTIME_VERSION = '3.11'\nPACKAGES = ('snowflake-snowpark-python')\nHANDLER = 'run'\nCALLED ON NULL INPUT\nCOMMENT = 'Generated Python stored procedure'\nEXECUTE AS ${preferences.executeAs}\nAS\n$$\nimport snowflake.snowpark as snowpark\n\ndef run(session: snowpark.Session, p_limit: int = 100) -> str:\n    try:\n        df = session.table('${tableName}').limit(p_limit)\n        row_count = df.count()\n        ${preferences.includeLogging ? `session.sql("INSERT INTO ${schemaRef}.PROC_AUDIT_LOG(PROC_NAME, STATUS, MESSAGE, LOGGED_AT) VALUES ('${buildProcedureName(prompt, tableName)}', 'SUCCESS', 'Rows processed: ' || ${'row_count'}, CURRENT_TIMESTAMP())").collect()` : ''}\n        return f'Success: processed {row_count} rows'\n    except Exception as exc:\n        return f'Error: {str(exc)}'\n$$;`;
  }

  if (needsColumnsOutput || preferences.returnStyle === 'TABLE') {
    return `CREATE OR REPLACE PROCEDURE ${procedureName}(p_table_name VARCHAR DEFAULT '${qualified.table.toUpperCase()}')\nRETURNS TABLE(column_name VARCHAR, data_type VARCHAR, is_nullable VARCHAR, ordinal_position NUMBER)\nLANGUAGE SQL\nCALLED ON NULL INPUT\nCOMMENT = 'Returns table column metadata from information schema'\nEXECUTE AS ${preferences.executeAs}\nAS\n$$\nBEGIN\n  ${preferences.includeLogging ? `INSERT INTO ${schemaRef}.PROC_AUDIT_LOG(PROC_NAME, STATUS, MESSAGE, LOGGED_AT)\n  VALUES ('${buildProcedureName(prompt, tableName)}', 'START', 'Metadata extraction started', CURRENT_TIMESTAMP());` : ''}\n\n  RETURN TABLE(\n    SELECT\n      COLUMN_NAME,\n      DATA_TYPE,\n      IS_NULLABLE,\n      ORDINAL_POSITION\n    FROM ${qualified.database}.INFORMATION_SCHEMA.COLUMNS\n    WHERE TABLE_SCHEMA = '${qualified.schema.toUpperCase()}'\n      AND TABLE_NAME = UPPER(:p_table_name)\n    ORDER BY ORDINAL_POSITION\n  );\nEND;\n$$;`;
  }

  return `CREATE OR REPLACE PROCEDURE ${procedureName}(p_limit NUMBER DEFAULT 100)\nRETURNS VARCHAR\nLANGUAGE SQL\nCALLED ON NULL INPUT\nCOMMENT = 'Generated SQL stored procedure for ${tableName}'\nEXECUTE AS ${preferences.executeAs}\nAS\n$$\nDECLARE\n  v_rows NUMBER DEFAULT 0;\nBEGIN\n  CREATE TEMP TABLE TMP_PROC_RESULT AS\n  SELECT *\n  FROM ${tableName}\n  LIMIT :p_limit;\n\n  SELECT COUNT(*) INTO v_rows FROM TMP_PROC_RESULT;\n\n  ${preferences.includeLogging ? `INSERT INTO ${schemaRef}.PROC_AUDIT_LOG(PROC_NAME, STATUS, MESSAGE, LOGGED_AT)\n  VALUES ('${buildProcedureName(prompt, tableName)}', 'SUCCESS', 'Rows processed: ' || v_rows, CURRENT_TIMESTAMP());` : ''}\n\n  RETURN 'Success: processed ' || v_rows || ' rows from ${tableName}';\nEXCEPTION\n  WHEN OTHER THEN\n    RETURN 'Error: ' || SQLERRM || ' (code: ' || SQLCODE || ')';\nEND;\n$$;`;
}

function getSchemaOptions(selectedTables: string[]): string[] {
  const discoveredSchemas = selectedTables
    .map((table) => splitQualifiedName(table).schema.toUpperCase())
    .filter(Boolean);
  const defaults = ['BRONZE', 'SILVER', 'GOLD'];
  return ['AUTO', ...Array.from(new Set([...discoveredSchemas, ...defaults]))];
}

function inferCreateTableName(prompt: string, sourceTable: string): string {
  const explicit = prompt.match(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([A-Za-z0-9_$.]+)/i);
  if (explicit && explicit[1]) {
    const explicitTable = explicit[1].replace(/[;,.]+$/, '');
    if (explicitTable.split('.').length >= 3) {
      return explicitTable;
    }
    const source = splitQualifiedName(sourceTable);
    if (explicitTable.split('.').length === 2) {
      return `${source.database}.${explicitTable}`;
    }
    return `${source.database}.${source.schema}.${explicitTable}`;
  }

  const source = splitQualifiedName(sourceTable);
  const sameAccountPattern = /\bsame\s+account\s+id\b|\bduplicate\s+account\b|\bduplicate\s+account_id\b|\bsame\s+id\b/i;
  if (sameAccountPattern.test(prompt)) {
    return `${source.database}.${source.schema}.${source.table}_DUP_ACCOUNT_ID`;
  }
  return `${source.database}.${source.schema}.${source.table}_DERIVED`;
}

function buildCreateTableSql(prompt: string, sourceTable: string): string {
  const targetTable = inferCreateTableName(prompt, sourceTable);
  const normalized = prompt.toLowerCase();

  if (/\bsame\s+account\s+id\b|\bduplicate\s+account\b|\bduplicate\s+account_id\b/.test(normalized)) {
    return `CREATE OR REPLACE TABLE ${targetTable} AS\nSELECT *\nFROM ${sourceTable}\nQUALIFY COUNT(*) OVER (PARTITION BY ACCOUNT_ID) > 1;`;
  }

  if (/\bsummary\b|\baggregate\b|\bgroup\b/.test(normalized)) {
    return `CREATE OR REPLACE TABLE ${targetTable} AS\nSELECT ACCOUNT_ID, COUNT(*) AS row_count\nFROM ${sourceTable}\nGROUP BY ACCOUNT_ID;`;
  }

  return `CREATE OR REPLACE TABLE ${targetTable} AS\nSELECT *\nFROM ${sourceTable};`;
}

function buildThinkingText(prompt: string, tableName: string, model: ChatModel): string {
  const objective = prompt.trim().replace(/\s+/g, ' ');
  return [
    'Analytical Thinking Trace',
    `Model: ${model}`,
    `Step 1 - Objective: ${objective}`,
    `Step 2 - Context Binding: using ${tableName}`,
    'Step 3 - Query Blueprint: choose aggregation/filter/order strategy from prompt intent.',
    'Step 4 - Safety Check: enforce read-only shape with deterministic constraints.',
    'Step 5 - Execution Handoff: place SQL in editor for final review and run.',
  ].join('\n');
}

function getThinkingDelayMs(prompt: string, sqlFromUser: boolean): number {
  const base = sqlFromUser ? 2200 : 3200;
  const lengthFactor = Math.min(Math.floor(prompt.trim().length / 24) * 160, 1600);
  const complexityBoost = /\b(join|trend|cohort|window|partition|procedure|metadata|columns?|feedback|loop)\b/i.test(prompt) ? 1000 : 0;
  return Math.min(base + lengthFactor + complexityBoost, 5200);
}

function buildSuggestedSql(prompt: string, selectedTables: string[], model: ChatModel, selectedSchema: string): string | null {
  const tableName = resolveTableName(prompt, selectedTables, selectedSchema);
  const normalized = prompt.toLowerCase();
  const topN = extractTopN(prompt);
  const lookbackDays = extractLookbackDays(prompt);
  const defaultLimit = model === 'o3-mini' ? Math.min(topN, 50) : topN;

  if (normalized.includes('create table') || normalized.includes('table creation') || normalized.includes('build table')) {
    return buildCreateTableSql(prompt, tableName);
  }

  if (normalized.includes('column') || normalized.includes('schema') || normalized.includes('metadata')) {
    const qualified = splitQualifiedName(tableName);
    return `SELECT\n  COLUMN_NAME,\n  DATA_TYPE,\n  IS_NULLABLE,\n  ORDINAL_POSITION\nFROM ${qualified.database}.INFORMATION_SCHEMA.COLUMNS\nWHERE TABLE_SCHEMA = '${qualified.schema.toUpperCase()}'\n  AND TABLE_NAME = '${qualified.table.toUpperCase()}'\nORDER BY ORDINAL_POSITION;`;
  }

  if (normalized.includes('stored procedure') || normalized.includes('procedure')) {
    const listIntent = /\blist\b|\bshow\b|\bavailable\b|\bexisting\b/.test(normalized);
    if (listIntent) {
      const defaultDb = tableName.includes('.') ? tableName.split('.')[0] : 'BANKING';
      return `SELECT\n  PROCEDURE_CATALOG,\n  PROCEDURE_SCHEMA,\n  PROCEDURE_NAME,\n  DATA_TYPE\nFROM ${defaultDb}.INFORMATION_SCHEMA.PROCEDURES\nORDER BY PROCEDURE_SCHEMA, PROCEDURE_NAME\nLIMIT ${defaultLimit};`;
    }
    return buildStoredProcedureSql(prompt, tableName, {
      language: 'SQL',
      executeAs: 'CALLER',
      includeLogging: false,
      returnStyle: normalized.includes('column') ? 'TABLE' : 'TEXT',
    });
  }

  if (normalized.includes('top') && (normalized.includes('record') || normalized.includes('row') || normalized.includes('entry'))) {
    return `SELECT *\nFROM ${tableName}\nLIMIT ${defaultLimit};`;
  }

  if (normalized.includes('top')) {
    const metricColumn = inferMetricColumn(prompt);
    if (metricColumn) {
      const entityColumns = inferEntityColumns(prompt);
      const selectColumns = entityColumns.length > 0
        ? `${entityColumns.join(', ')},\n  ${metricColumn}`
        : metricColumn;
      return `SELECT\n  ${selectColumns}\nFROM ${tableName}\nWHERE ${metricColumn} IS NOT NULL\nORDER BY TRY_TO_DECIMAL(${metricColumn}) DESC NULLS LAST\nLIMIT ${defaultLimit};`;
    }
  }

  if (normalized.includes('top') && (normalized.includes('customer') || normalized.includes('users'))) {
    return `SELECT customer_id, SUM(revenue) AS total_revenue\nFROM ${tableName}\nWHERE date >= DATEADD(day, -${lookbackDays}, CURRENT_DATE())\nGROUP BY customer_id\nORDER BY total_revenue DESC\nLIMIT ${defaultLimit};`;
  }

  if (normalized.includes('revenue') || normalized.includes('sales')) {
    return `SELECT customer_id, SUM(revenue) AS total_revenue\nFROM ${tableName}\nWHERE date >= DATEADD(day, -${lookbackDays}, CURRENT_DATE())\nGROUP BY customer_id\nORDER BY total_revenue DESC\nLIMIT ${defaultLimit};`;
  }

  // Check for WHERE conditions first (e.g., "current_balance greater than 50000")
  const whereCondition = extractWhereConditions(prompt);
  if (whereCondition) {
    return `SELECT *\nFROM ${tableName}\nWHERE ${whereCondition}\nLIMIT ${defaultLimit};`;
  }

  // Explicit "show me/give me records/rows" request with or without WHERE
  if (normalized.includes('record') || normalized.includes('give me') || normalized.includes('show me')) {
    return `SELECT *\nFROM ${tableName}\nLIMIT ${defaultLimit};`;
  }

  if (normalized.includes('count') || normalized.includes('how many')) {
    return `SELECT COUNT(*) AS row_count\nFROM ${tableName};`;
  }

  if (normalized.includes('trend') || normalized.includes('daily') || normalized.includes('by day')) {
    return `SELECT DATE_TRUNC('day', date) AS day, SUM(revenue) AS total_revenue\nFROM ${tableName}\nWHERE date >= DATEADD(day, -${lookbackDays}, CURRENT_DATE())\nGROUP BY DATE_TRUNC('day', date)\nORDER BY day;`;
  }

  if (normalized.includes('sample') || normalized.includes('preview') || normalized.includes('show data')) {
    return `SELECT *\nFROM ${tableName}\nLIMIT 100;`;
  }

  if (normalized.includes('show') && normalized.includes('table')) {
    return `SELECT *\nFROM ${tableName}\nLIMIT ${defaultLimit};`;
  }

  // Fallback query so SQL Generator always produces an executable draft.
  return `SELECT *\nFROM ${tableName}\nLIMIT ${defaultLimit};`;
}

function buildSqlGeneratorReply(
  prompt: string,
  tableName: string,
  sqlFromUser: boolean,
  thinkingEnabled: boolean,
): string {
  if (!thinkingEnabled) {
    return sqlFromUser
      ? 'Received your SQL. Review it and click Run Query when you are ready to execute in Snowflake.'
      : 'Drafted SQL from your prompt. Verify it below, edit if needed, then click Run Query to execute in Snowflake.';
  }

  return [
    'Analysis complete.',
    `1. Objective captured: ${prompt.trim()}`,
    `2. Context chosen: ${tableName}`,
    '3. SQL design: selected projection, applied intent-based ordering/filtering, and bounded result size.',
    '4. Validation: read-only structure and Snowflake-compatible syntax verified.',
    '5. Output: query is now loaded into SQL Editor for immediate execution.',
  ].join('\n');
}

export function CenterPanel({ projectButton }: { projectButton?: React.ReactNode } = {}) {
  const {
    chatHistory,
    activeSkills,
    toggleSkill,
    selectedTables,
    toggleTable,
    selectedSchema,
    setSelectedSchema,
    addMessage,
    updateMessage,
    setGeneratedSQL,
    setIsMonitorOpen,
    setMcpServerStatus,
    setMcpError,
    mcpServerStatus,
    selectedModel,
    setSelectedModel,
    thinkingEnabled,
    setThinkingEnabled,
    composerDraft,
    setComposerDraft,
  } = useStore();
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingProcedureContext, setPendingProcedureContext] = useState<PendingProcedureContext | null>(null);
  const [lastProcedureContext, setLastProcedureContext] = useState<PendingProcedureContext | null>(null);
  const [procedureQuickConfig, setProcedureQuickConfig] = useState<ProcedurePreferences>(DEFAULT_PROCEDURE_PREFERENCES);
  const [guidedFeedback, setGuidedFeedback] = useState<GuidedFeedbackState | null>(null);
  const [optimizerRewrite, setOptimizerRewrite] = useState<OptimizerRewriteCandidate | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSubmissionRef = useRef<{ text: string; at: number } | null>(null);
  const schemaOptions = useMemo(() => getSchemaOptions(selectedTables), [selectedTables]);
  const guidedSteps = guidedFeedback ? (GUIDED_FEEDBACK_STEPS[guidedFeedback.skill] || []) : [];
  const guidedCurrentStep = guidedFeedback ? guidedSteps[guidedFeedback.stepIndex] : null;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const getTypewriterCharDelay = (char: string, baseDelay: number): number => {
    if (char === '\n') {
      return Math.min(220, baseDelay + 120);
    }
    if (char === '.' || char === '!' || char === '?') {
      return Math.min(320, baseDelay + 180);
    }
    if (char === ',' || char === ';' || char === ':') {
      return Math.min(240, baseDelay + 110);
    }
    if (char === ')') {
      return Math.min(190, baseDelay + 70);
    }
    if (char === ' ') {
      return Math.max(6, Math.floor(baseDelay * 0.6));
    }

    // Slightly faster flow inside words to mimic streamed model output.
    const fastFlow = Math.max(6, Math.floor(baseDelay * 0.82));
    const jitter = Math.floor(Math.random() * 4); // 0..3ms
    return fastFlow + jitter;
  };

  const typewriterTransition = async (
    messageId: string,
    fromText: string,
    toText: string,
    budgetMs: number,
  ) => {
    if (toText.length <= fromText.length) {
      updateMessage(messageId, { content: toText });
      return;
    }

    const append = toText.slice(fromText.length);
    const baseDelay = Math.max(10, Math.min(34, Math.floor(budgetMs / Math.max(append.length, 1))));
    let current = fromText;

    for (const char of append) {
      current += char;
      updateMessage(messageId, { content: current });
      await wait(getTypewriterCharDelay(char, baseDelay));
    }
  };

  const streamStoredProcedureGeneration = async (
    objective: string,
    resolvedTable: string,
    preferences: ProcedurePreferences,
    sql: string,
    mode: 'configured' | 'direct' | 'refine',
  ) => {
    const assistantId = (Date.now() + 1).toString();
    const totalDelay = Math.min(getThinkingDelayMs(objective, false) + 2000, 7800);

    const modeLabel = mode === 'refine'
      ? 'Applying refinement feedback...'
      : mode === 'configured'
        ? 'Applying provided procedure configuration...'
        : 'Building stored procedure from prompt details...';

    const stage1 = [
      modeLabel,
      '- Skill activated: Stored Procedure Writer',
      `- Objective: ${objective}`,
      `- Context: ${resolvedTable}`,
    ].join('\n');
    const stage2 = [
      stage1,
      `- Language: ${preferences.language}`,
      `- Execute as: ${preferences.executeAs}`,
      `- Logging / feedback loop: ${preferences.includeLogging ? 'Enabled' : 'Disabled'}`,
      `- Return style: ${preferences.returnStyle}`,
    ].join('\n');
    const stage3 = [
      stage2,
      '- Drafting complete CREATE PROCEDURE statement with safe defaults...',
      '- Adding validation and operational guidance...',
    ].join('\n');

    addMessage({ id: assistantId, role: 'assistant', content: '' });

    await typewriterTransition(assistantId, '', stage1, Math.round(totalDelay * 0.34));
    await typewriterTransition(assistantId, stage1, stage2, Math.round(totalDelay * 0.28));
    await typewriterTransition(assistantId, stage2, stage3, Math.round(totalDelay * 0.24));

    setGeneratedSQL(sql);

    const finalMessage = [
      stage3,
      '',
      'Stored procedure generation completed with skill-guided validation.',
      `1. Language: ${preferences.language}`,
      `2. Execution mode: EXECUTE AS ${preferences.executeAs}`,
      `3. Logging/feedback loop: ${preferences.includeLogging ? 'Enabled' : 'Disabled'}`,
      `4. Return style: ${preferences.returnStyle}`,
      '5. No SQL was executed automatically. Review in SQL Editor and click Run Query only when ready.',
      '6. Feedback loop: reply with "refine: ..." to regenerate with additional constraints.',
    ].join('\n');

    await typewriterTransition(assistantId, stage3, finalMessage, Math.round(totalDelay * 0.14));
    updateMessage(assistantId, { sql: thinkingEnabled ? undefined : sql });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  useEffect(() => {
    if (!composerDraft) {
      return;
    }
    setInput(composerDraft);
    setComposerDraft(null);
  }, [composerDraft, setComposerDraft]);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const health = await mcpClient.getHealth({ timeoutMs: 10000 });
        if (!isMounted) {
          return;
        }
        setMcpServerStatus(health.status === 'ok' ? 'ok' : 'degraded');
        if (health.status !== 'ok') {
          setMcpError(`Missing environment variables: ${health.missing_env.join(', ')}`);
        } else {
          setMcpError(null);
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        setMcpServerStatus('error');
        setMcpError(error instanceof Error ? error.message : 'MCP server not reachable');
      }
    };

    checkHealth();
    const timer = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [setMcpError, setMcpServerStatus]);

  const submitMessage = async (rawInput: string, clearComposer: boolean = true, bypassGuidedFeedback: boolean = false) => {
    if (isGenerating) return;

    const trimmedInput = rawInput.trim();
    if (!trimmedInput) return;

    const now = Date.now();
    const last = lastSubmissionRef.current;
    if (last && last.text === trimmedInput && now - last.at < 2500) {
      return;
    }
    lastSubmissionRef.current = { text: trimmedInput, at: now };

    const userMsg = trimmedInput;
    if (clearComposer) {
      setInput('');
    }
    
    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: userMsg,
    });

    setIsGenerating(true);
    try {
      const resolvedTable = resolveTableName(userMsg, selectedTables, selectedSchema);
      const sqlFromUser = isLikelySql(userMsg) ? userMsg.trim() : null;
      const storedProcedureIntent = isStoredProcedureRequest(userMsg);
      const refineInstruction = userMsg.match(/^refine\s*:\s*(.+)$/i);
      const optimizerActive = activeSkills.includes('Query Optimizer');
      const optimizationRequested = /\boptimi[sz]e\b|\bfaster\b|\bperformance\b|\bcost\b|\bbytes\s+scanned\b|\bquery\s+profile\b/i.test(userMsg);
      const optimizerSql = sqlFromUser || (optimizationRequested ? extractSqlFromPrompt(userMsg) : null);

      const primaryGuidedSkill = getPrimaryGuidedSkill(activeSkills);
      if (
        !bypassGuidedFeedback
        && !sqlFromUser
        && !storedProcedureIntent
        && !refineInstruction
        && !pendingProcedureContext
        && !guidedFeedback
        && primaryGuidedSkill
        && shouldStartGuidedFeedback(userMsg)
      ) {
        setGuidedFeedback({
          basePrompt: userMsg,
          skill: primaryGuidedSkill,
          stepIndex: 0,
          selections: {},
        });
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Guided feedback mode started for ${primaryGuidedSkill}. Answer quick questions below, then generate refined output.`,
        });
        return;
      }

      if ((storedProcedureIntent || refineInstruction) && !activeSkills.includes('Stored Procedure Writer')) {
        toggleSkill('Stored Procedure Writer');
      }

      if (optimizerActive && optimizationRequested && optimizerSql && !pendingProcedureContext) {
        const assistantId = (Date.now() + 1).toString();
        const thinkingDelay = Math.round(getThinkingDelayMs(userMsg, Boolean(sqlFromUser)) * 1.1);

        if (thinkingEnabled) {
          addMessage({ id: assistantId, role: 'assistant', content: '' });
          await typewriterTransition(
            assistantId,
            '',
            [
              'Skill activated: Query Optimizer',
              '- Parsing provided SQL...',
              '- Checking anti-patterns (scan volume, temp objects, exception safety)...',
              '- Building optimized rewrite and feedback summary...',
            ].join('\n'),
            thinkingDelay,
          );
        }

        const { optimizedSql, changes } = optimizeSqlForSnowflake(optimizerSql);
        const feedbackText = buildOptimizerFeedback(changes, Boolean(optimizerSql));
        setOptimizerRewrite({
          originalSql: optimizerSql,
          optimizedSql,
          feedback: feedbackText,
        });

        if (thinkingEnabled) {
          if (assistantId) {
            await typewriterTransition(
              assistantId,
              '',
              `${feedbackText}\n\nSuggested rewrite is ready below. Click Apply Suggested Rewrite to place it in SQL Editor.`,
              1000,
            );
            updateMessage(assistantId, { sql: undefined });
          }
        } else {
          addMessage({
            id: assistantId,
            role: 'assistant',
            content: `${feedbackText}\n\nSuggested rewrite is ready below. Click Apply Suggested Rewrite to place it in SQL Editor.`,
          });
        }
        return;
      }

      if (optimizerActive && optimizationRequested && !optimizerSql && !pendingProcedureContext) {
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: [
            'Query Optimizer needs an executable SQL block to optimize.',
            'Paste SQL starting with CREATE/SELECT/WITH/CALL and I will return:',
            '1. Diagnosis',
            '2. Concrete rewrite',
            '3. Inline diff review with Apply Suggested Rewrite',
            '',
            'Example:',
            'optimize =>',
            'CREATE OR REPLACE TABLE BANKING.BRONZE.CUSTOMER_SUMMARY AS',
            'SELECT ACCOUNT_ID, COUNT(*) AS row_count',
            'FROM BANKING.BRONZE.CUSTOMER',
            'GROUP BY ACCOUNT_ID;',
          ].join('\n'),
        });
        return;
      }

      if (refineInstruction && lastProcedureContext && !sqlFromUser) {
        const refinedPrompt = `${lastProcedureContext.originalPrompt}. ${refineInstruction[1]}`;
        const refinedPreferences = parseProcedurePreferences(refineInstruction[1], 'SQL');
        const refinedSql = buildStoredProcedureSql(
          refinedPrompt,
          lastProcedureContext.resolvedTable,
          refinedPreferences,
        );

        await streamStoredProcedureGeneration(
          refinedPrompt,
          lastProcedureContext.resolvedTable,
          refinedPreferences,
          refinedSql,
          'refine',
        );
        setLastProcedureContext({
          originalPrompt: refinedPrompt,
          resolvedTable: lastProcedureContext.resolvedTable,
        });
        return;
      }

      if (pendingProcedureContext && !sqlFromUser) {
        const refinedPreferences = parseProcedurePreferences(userMsg, 'SQL');
        const refinedSql = buildStoredProcedureSql(
          pendingProcedureContext.originalPrompt,
          pendingProcedureContext.resolvedTable,
          refinedPreferences,
        );

        await streamStoredProcedureGeneration(
          pendingProcedureContext.originalPrompt,
          pendingProcedureContext.resolvedTable,
          refinedPreferences,
          refinedSql,
          'configured',
        );
        setLastProcedureContext(pendingProcedureContext);
        setPendingProcedureContext(null);
        return;
      }

      if (storedProcedureIntent && !sqlFromUser) {
        const context: PendingProcedureContext = {
          originalPrompt: userMsg,
          resolvedTable,
        };
        const inferredDefaults = parseProcedurePreferences(userMsg, 'SQL');
        setPendingProcedureContext(context);
        setProcedureQuickConfig(inferredDefaults);
        const questionBlock = buildProcedureQuestionPrompt(context, inferredDefaults);

        const assistantId = (Date.now() + 1).toString();
        addMessage({ id: assistantId, role: 'assistant', content: '' });
        await typewriterTransition(
          assistantId,
          '',
          `Skill activated: Stored Procedure Writer\n\n${questionBlock}`,
          Math.round(getThinkingDelayMs(userMsg, false) * 1.2),
        );
        return;
      }

      const sql = sqlFromUser || buildSuggestedSql(userMsg, selectedTables, selectedModel, selectedSchema);
      let currentThinkingContent = '';
      const thought = thinkingEnabled
        ? buildThinkingText(userMsg, resolvedTable, selectedModel)
        : undefined;

      const assistantId = (Date.now() + 1).toString();

      if (thinkingEnabled) {
        const thinkingDelay = getThinkingDelayMs(userMsg, Boolean(sqlFromUser));
        const stage1 = [
          'Analyzing request...',
          `- Objective: ${userMsg}`,
          `- Context: ${resolvedTable}`,
        ].join('\n');
        const stage2 = [
          stage1,
          '- Building SQL strategy: projection -> filter -> order -> limit',
        ].join('\n');
        const stage3 = [
          stage2,
          '- Running read-only and Snowflake compatibility checks...',
        ].join('\n');

        addMessage({
          id: assistantId,
          role: 'assistant',
          content: '',
          thinking: thought,
        });

        await typewriterTransition(assistantId, '', stage1, Math.round(thinkingDelay * 0.42));
        currentThinkingContent = stage1;
        await typewriterTransition(assistantId, currentThinkingContent, stage2, Math.round(thinkingDelay * 0.33));
        currentThinkingContent = stage2;
        await typewriterTransition(assistantId, currentThinkingContent, stage3, Math.round(thinkingDelay * 0.25));
        currentThinkingContent = stage3;
      }

      if (!sql) {
        if (thinkingEnabled) {
          const fallback = `${currentThinkingContent}\n\nUnable to infer SQL for this prompt. Please specify a table or objective.`;
          await typewriterTransition(assistantId, currentThinkingContent, fallback, 900);
        } else {
          addMessage({
            id: assistantId,
            role: 'assistant',
            content: 'Unable to infer SQL for this prompt. Please specify a table or objective.',
            thinking: thought,
          });
        }
        return;
      }

      setGeneratedSQL(sql);
      if (thinkingEnabled) {
        const finalReply = `${currentThinkingContent}\n\n${buildSqlGeneratorReply(userMsg, resolvedTable, Boolean(sqlFromUser), true)}`;
        await typewriterTransition(assistantId, currentThinkingContent, finalReply, 1100);
        updateMessage(assistantId, { thinking: thought });
      } else {
        addMessage({
          id: assistantId,
          role: 'assistant',
          content: buildSqlGeneratorReply(userMsg, resolvedTable, Boolean(sqlFromUser), false),
          sql,
          thinking: thought,
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage(input, true);
  };

  const toggleGuidedSelection = (option: string) => {
    if (!guidedFeedback || !guidedCurrentStep) return;

    const current = guidedFeedback.selections[guidedCurrentStep.id] || [];
    let nextValues: string[];

    if (guidedCurrentStep.multiSelect) {
      nextValues = current.includes(option)
        ? current.filter((value) => value !== option)
        : [...current, option];
    } else {
      nextValues = current.includes(option) ? [] : [option];
    }

    setGuidedFeedback({
      ...guidedFeedback,
      selections: {
        ...guidedFeedback.selections,
        [guidedCurrentStep.id]: nextValues,
      },
    });
  };

  const handleGuidedNext = () => {
    if (!guidedFeedback || !guidedCurrentStep) return;
    if (guidedFeedback.stepIndex >= guidedSteps.length - 1) {
      return;
    }
    setGuidedFeedback({ ...guidedFeedback, stepIndex: guidedFeedback.stepIndex + 1 });
  };

  const handleGuidedBack = () => {
    if (!guidedFeedback) return;
    if (guidedFeedback.stepIndex <= 0) {
      return;
    }
    setGuidedFeedback({ ...guidedFeedback, stepIndex: guidedFeedback.stepIndex - 1 });
  };

  const handleGuidedSkip = () => {
    setGuidedFeedback(null);
  };

  const handleGuidedGenerate = async () => {
    if (!guidedFeedback) return;
    const enrichedPrompt = `${guidedFeedback.basePrompt}${formatGuidedFeedbackContext(guidedFeedback.skill, guidedFeedback.selections)}`;
    setGuidedFeedback(null);
    await submitMessage(enrichedPrompt, false, true);
  };

  const handleApplyOptimizerRewrite = () => {
    if (!optimizerRewrite) {
      return;
    }

    setGeneratedSQL(optimizerRewrite.optimizedSql);
    addMessage({
      id: (Date.now() + 2).toString(),
      role: 'assistant',
      content: 'Applied suggested rewrite to SQL Editor. Review and run when ready.',
    });
    setOptimizerRewrite(null);
  };

  const handleDiscardOptimizerRewrite = () => {
    setOptimizerRewrite(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full relative bg-bg-base">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-bg-base to-bg-base pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] pointer-events-none mix-blend-overlay" />

      <div className="h-12 border-b border-gray-200 flex items-center justify-between px-4 relative z-10 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-800">Chat</h2>
          {projectButton}
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg ${
            mcpServerStatus === 'ok'
              ? 'text-emerald-600 bg-emerald-50'
              : mcpServerStatus === 'degraded'
                ? 'text-amber-600 bg-amber-50'
                : mcpServerStatus === 'error'
                  ? 'text-red-600 bg-red-50'
                  : 'text-gray-400 bg-gray-50'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              mcpServerStatus === 'ok' ? 'bg-emerald-400' :
              mcpServerStatus === 'degraded' ? 'bg-amber-400' :
              mcpServerStatus === 'error' ? 'bg-red-400' : 'bg-gray-300'
            }`} />
            MCP
          </div>
          <button
            onClick={() => setIsMonitorOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] rounded-lg transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Monitor
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-10">
        {chatHistory.map((msg) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id} 
            className={`flex gap-4 max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              msg.role === 'user' 
                ? 'bg-accent text-white shadow-md' 
                : 'bg-white border border-border text-accent shadow-sm'
            }`}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            
            <div className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-accent text-white rounded-tr-sm' 
                  : 'bg-panel border border-border text-text-main rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              
              {msg.sql && (
                <div className="w-full max-w-2xl bg-slate-50 border border-border rounded-xl overflow-hidden mt-2 shadow-sm">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-white">
                    <span className="text-xs font-mono text-text-muted">Generated SQL</span>
                    <button 
                      onClick={() => setGeneratedSQL(msg.sql || null)}
                      className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-secondary transition-colors font-medium"
                    >
                      <Play className="w-3 h-3" />
                      View in Editor
                    </button>
                  </div>
                  <pre className="p-4 text-sm font-mono text-slate-800 overflow-x-auto">
                    <code>{msg.sql}</code>
                  </pre>
                </div>
              )}

              {msg.thinking && (
                <details className="w-full max-w-2xl bg-white border border-border rounded-xl p-3 text-xs text-text-muted">
                  <summary className="cursor-pointer font-medium text-text-main">Thinking</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px]">{msg.thinking}</pre>
                </details>
              )}
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-6 pt-4 pb-2 relative z-10">
        <div className="max-w-3xl mx-auto relative">
          {(pendingProcedureContext || (guidedFeedback && guidedCurrentStep) || optimizerRewrite) && (
            <div className="mb-3 max-h-[38vh] overflow-y-auto space-y-3">
              {optimizerRewrite && (
                <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-text-main">Suggested Rewrite Review</div>
                    <div className="text-xs text-text-muted">Query Optimizer</div>
                  </div>
                  <div className="text-xs text-text-muted mb-3">Inline diff (+ added, - removed, unchanged context) before applying to SQL Editor.</div>

                  <div className="border border-border rounded-lg overflow-hidden mb-3">
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-text-muted bg-slate-50 border-b border-border">Inline Diff</div>
                    <div className="max-h-56 overflow-auto bg-white font-mono text-[11px]">
                      {buildInlineDiffLines(optimizerRewrite.originalSql, optimizerRewrite.optimizedSql).map((line, idx) => (
                        <div
                          key={`diff-${idx}`}
                          className={`px-3 py-0.5 whitespace-pre-wrap break-words ${line.kind === 'add' ? 'bg-emerald-50 text-emerald-800' : line.kind === 'remove' ? 'bg-red-50 text-red-800' : 'text-slate-700'}`}
                        >
                          <span className="inline-block w-4 select-none">{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
                          {line.text}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-text-muted bg-slate-50 border border-border rounded-md p-2 whitespace-pre-wrap mb-3">
                    {optimizerRewrite.feedback}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApplyOptimizerRewrite}
                      className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent/90"
                    >
                      Apply Suggested Rewrite
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscardOptimizerRewrite}
                      className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-text-main hover:bg-slate-50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {pendingProcedureContext && (
                <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-text-main mb-3">Quick Procedure Configuration</div>
                  <div className="text-xs text-text-muted mb-3">Select options and generate immediately.</div>

                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Language</div>
                    <div className="flex flex-wrap gap-2">
                      {(['SQL', 'JAVASCRIPT', 'PYTHON'] as ProcedureLanguage[]).map((language) => (
                        <button
                          key={`lang-${language}`}
                          type="button"
                          onClick={() => setProcedureQuickConfig((prev) => ({ ...prev, language }))}
                           className={`px-2.5 py-1 rounded-md border text-xs font-medium ${procedureQuickConfig.language === language ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                        >
                          {language}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Execute As</div>
                    <div className="flex flex-wrap gap-2">
                      {(['CALLER', 'OWNER'] as Array<'CALLER' | 'OWNER'>).map((mode) => (
                        <button
                          key={`execute-${mode}`}
                          type="button"
                          onClick={() => setProcedureQuickConfig((prev) => ({ ...prev, executeAs: mode }))}
                           className={`px-2.5 py-1 rounded-md border text-xs font-medium ${procedureQuickConfig.executeAs === mode ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Logging / Feedback Loop</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setProcedureQuickConfig((prev) => ({ ...prev, includeLogging: true }))}
                         className={`px-2.5 py-1 rounded-md border text-xs font-medium ${procedureQuickConfig.includeLogging ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setProcedureQuickConfig((prev) => ({ ...prev, includeLogging: false }))}
                         className={`px-2.5 py-1 rounded-md border text-xs font-medium ${!procedureQuickConfig.includeLogging ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Return Type</div>
                    <div className="flex flex-wrap gap-2">
                      {(['TEXT', 'TABLE'] as Array<'TEXT' | 'TABLE'>).map((returnType) => (
                        <button
                          key={`return-${returnType}`}
                          type="button"
                          onClick={() => setProcedureQuickConfig((prev) => ({ ...prev, returnStyle: returnType }))}
                           className={`px-2.5 py-1 rounded-md border text-xs font-medium ${procedureQuickConfig.returnStyle === returnType ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                        >
                          {returnType}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-text-muted font-mono bg-slate-50 border border-border rounded-md px-2 py-1 mb-3">
                    {buildProcedureConfigLine(procedureQuickConfig)}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const quickLine = buildProcedureConfigLine(procedureQuickConfig);
                        setInput(quickLine);
                        void submitMessage(quickLine, true);
                      }}
                      disabled={isGenerating}
                      className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50"
                    >
                      Generate from Quick Config
                    </button>
                    <button
                      type="button"
                      onClick={() => setInput(buildProcedureConfigLine(procedureQuickConfig))}
                      className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-text-main hover:bg-slate-50"
                    >
                      Fill Composer Only
                    </button>
                  </div>
                </div>
              )}

              {guidedFeedback && guidedCurrentStep && (
                <div className="bg-white border border-border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-semibold text-text-main">{guidedFeedback.skill} Feedback Loop</div>
                    <div className="text-xs text-text-muted">{guidedFeedback.stepIndex + 1} of {guidedSteps.length}</div>
                  </div>

                  <div className="text-sm font-medium text-text-main mb-2">{guidedCurrentStep.question}</div>
                  <div className="text-xs text-text-muted mb-3">
                    {guidedCurrentStep.multiSelect ? 'Select one or more options' : 'Select one option'}
                  </div>

                  <div className="space-y-2 mb-4">
                    {guidedCurrentStep.options.map((option) => {
                      const selected = (guidedFeedback.selections[guidedCurrentStep.id] || []).includes(option);
                      return (
                        <button
                          key={`${guidedCurrentStep.id}-${option}`}
                          type="button"
                          onClick={() => toggleGuidedSelection(option)}
                           className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${selected ? 'bg-[var(--color-accent-light)] border-[var(--color-accent)] text-[var(--color-accent)]' : 'bg-white border-border text-text-main hover:bg-slate-50'}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGuidedBack}
                        disabled={guidedFeedback.stepIndex === 0}
                        className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-text-main hover:bg-slate-50 disabled:opacity-40"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleGuidedNext}
                        disabled={guidedFeedback.stepIndex >= guidedSteps.length - 1}
                        className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-text-main hover:bg-slate-50 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGuidedSkip}
                        className="px-3 py-1.5 rounded-md border border-border text-xs font-medium text-text-main hover:bg-slate-50"
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGuidedGenerate()}
                        className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-semibold hover:bg-accent/90"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <form 
            onSubmit={handleSubmit}
            className="bg-panel border border-border rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden focus-within:border-accent/50 focus-within:shadow-[0_8px_30px_rgba(37,99,235,0.08)] transition-all duration-300"
          >
            <div className="flex flex-wrap gap-2 px-4 pt-3">
              <AnimatePresence>
                {activeSkills.map(skill => (
                  <motion.div 
                    key={`skill-${skill}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 bg-accent/10 text-accent px-2.5 py-1 rounded-md text-xs font-medium border border-accent/20"
                  >
                    @{skill.replace(/\s+/g, '')}
                    <button 
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className="hover:bg-accent/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
                {selectedTables.map(table => (
                  <motion.div 
                    key={`table-${table}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 px-2.5 py-1 rounded-md text-xs font-medium border border-emerald-500/20"
                  >
                    #{table}
                    <button 
                      type="button"
                      onClick={() => toggleTable(table)}
                      className="hover:bg-emerald-500/20 rounded-full p-0.5 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            
            <div className="flex items-end gap-2 p-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isGenerating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask anything about your data..."
                className="w-full bg-transparent text-text-main placeholder-text-muted resize-none outline-none px-3 py-2 max-h-32 min-h-[44px] text-sm"
                rows={1}
              />
              <button 
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="p-2.5 rounded-xl bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:hover:bg-accent transition-colors shrink-0 mb-1 mr-1 shadow-sm"
              >
                {isGenerating ? (
                  <span className="text-[10px] font-semibold tracking-wide">...</span>
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 bg-white/80">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      // Simple file upload trigger
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.sql,.txt,.csv,.json';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const content = ev.target?.result as string;
                            setInput(content);
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    title="Upload file"
                     className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent-light)] transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-gray-300 text-xs">/</span>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as ChatModel)}
                   className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
                  title="Model"
                >
                  {MODEL_OPTIONS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.models.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setThinkingEnabled(!thinkingEnabled)}
                   className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${thinkingEnabled ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-[var(--color-accent-light)]'}`}
                  title="Thinking"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Think
                </button>
              </div>
              <div className="text-[11px] text-gray-400 font-medium pr-1">
                {isGenerating && thinkingEnabled ? 'Thinking...' : ''}
              </div>
            </div>
          </form>
          <div className="text-center mt-2 text-[10px] text-text-muted font-medium tracking-wide uppercase">
            π-Optimized can make mistakes. Verify queries before executing in production.
          </div>
        </div>
      </div>
    </div>
  );
}
