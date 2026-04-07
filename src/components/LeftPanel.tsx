import React, { useState } from 'react';
import { useStore } from '../store';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import sqlGenerationSkillMd from '../skills/sql-generation.skill.md?raw';
import storedProcedureSkillMd from '../skills/snowflake-stored-procedures.skill.md?raw';
import queryOptimizerSkillMd from '../skills/snowflake-query-optimizer.skill.md?raw';
import dataArchitectSkillMd from '../skills/data-architect.skill.md?raw';
import analyticsEngineerSkillMd from '../skills/analytics-engineer.skill.md?raw';
import requirementsAnalystMd from '../skills/requirements-analyst.skill.md?raw';
import dataContractWriterMd from '../skills/data-contract-writer.skill.md?raw';
import sourceSystemSurveyorMd from '../skills/source-system-surveyor.skill.md?raw';
import metadataExplorerMd from '../skills/metadata-explorer.skill.md?raw';
import queryProfilerMd from '../skills/query-profiler.skill.md?raw';
import lineageAnalystMd from '../skills/lineage-analyst.skill.md?raw';
import dataQualityEngineerMd from '../skills/data-quality-engineer.skill.md?raw';
import costOptimizationMd from '../skills/cost-optimization.skill.md?raw';
import cortexAiFunctionsMd from '../skills/cortex-ai-functions.skill.md?raw';
import cortexAnalystBuilderMd from '../skills/cortex-analyst-builder.skill.md?raw';
import semanticLayerDesignerMd from '../skills/semantic-layer-designer.skill.md?raw';
import dbtDeveloperMd from '../skills/dbt-developer.skill.md?raw';
import dbtTestEngineerMd from '../skills/dbt-test-engineer.skill.md?raw';
import rbacManagerMd from '../skills/rbac-manager.skill.md?raw';
import securityAnalystMd from '../skills/security-analyst.skill.md?raw';
import mlEngineerMd from '../skills/ml-engineer.skill.md?raw';
import streamlitDeveloperMd from '../skills/streamlit-developer.skill.md?raw';
import notebookDeveloperMd from '../skills/notebook-developer.skill.md?raw';
import marketplaceAdvisorMd from '../skills/marketplace-advisor.skill.md?raw';
import taskPlannerMd from '../skills/task-planner.skill.md?raw';
import workflowOrchestratorMd from '../skills/workflow-orchestrator.skill.md?raw';
import codeReviewerMd from '../skills/code-reviewer.skill.md?raw';
import snowflakeDocsLookupMd from '../skills/snowflake-docs-lookup.skill.md?raw';

type SkillTemplate = {
  objective: string;
  responsibilities: string[];
  workflow: string[];
  checks: string[];
  outputs: string[];
  prompts: string[];
};

const SKILL_TEMPLATES: Record<string, SkillTemplate> = {
  'Data Architect': {
    objective: 'Design reliable analytical data models and domain boundaries for Snowflake workloads.',
    responsibilities: ['Define subject areas and source-to-model lineage.', 'Recommend star/snowflake schemas for BI and ML workloads.', 'Set naming conventions for databases, schemas, tables, and views.', 'Align grain strategy for facts and dimensions.'],
    workflow: ['Gather business entities, KPIs, and source systems.', 'Define model grain, keys, and SCD strategy.', 'Design conformed dimensions and reusable marts.', 'Review query performance and clustering opportunities.'],
    checks: ['No ambiguous primary business key definitions.', 'Fact table grain is explicit and testable.', 'Slowly changing attributes have a declared policy.', 'Model supports both exploration and governed reporting.'],
    outputs: ['Domain model blueprint.', 'Table-by-table logical model contract.', 'Migration/rollout sequencing plan.'],
    prompts: ['Design a customer 360 mart across payments and accounts.', 'Define an events model for daily KPI reporting.'],
  },
  'Analytics Engineer': {
    objective: 'Transform raw data into analytics-ready models with strong testing and documentation.',
    responsibilities: ['Create clean intermediate and mart layers.', 'Implement data quality tests and freshness checks.', 'Document metric logic and semantic assumptions.', 'Optimize transformation SQL for predictable runtimes.'],
    workflow: ['Profile raw source columns and null distributions.', 'Build staging models with deterministic renaming.', 'Create metric-ready marts with repeatable tests.', 'Validate outputs against stakeholder KPI definitions.'],
    checks: ['Critical columns are tested for null/uniqueness.', 'Business filters are applied consistently across marts.', 'Late-arriving records are handled explicitly.', 'Versioned model contracts are maintained.'],
    outputs: ['Transformation SQL artifacts.', 'Data tests and accepted thresholds.', 'Model-level data dictionary.'],
    prompts: ['Build a daily revenue mart with source reconciliation.', 'Create tests for duplicate account identifiers.'],
  },
  'ML Engineer': {
    objective: 'Prepare trustworthy feature datasets and evaluate model-ready signal quality.',
    responsibilities: ['Define feature windows and leakage-safe joins.', 'Create training snapshots with clear as-of timestamps.', 'Track feature drift and distribution shifts.', 'Document model-serving feature contracts.'],
    workflow: ['Identify target variable and scoring cadence.', 'Build feature extraction queries with point-in-time correctness.', 'Evaluate missingness, outliers, and drift metrics.', 'Publish reusable feature views for scoring.'],
    checks: ['No target leakage across training windows.', 'Feature definitions are deterministic and reproducible.', 'Drift checks include both mean and distribution shifts.', 'Serving path uses same transformations as training.'],
    outputs: ['Feature dataset SQL.', 'Data quality and drift report.', 'Scoring-ready view contract.'],
    prompts: ['Create churn prediction features from transactions.', 'Build point-in-time features for fraud scoring.'],
  },
  'SQL Writer': {
    objective: 'Generate correct, readable, and optimized Snowflake SQL for analysis and reporting.',
    responsibilities: ['Translate natural language into executable SQL.', 'Apply safe defaults for filters, ordering, and limits.', 'Use explicit aliases and stable grouping semantics.', 'Prefer maintainable query structure over clever syntax.'],
    workflow: ['Parse business intent, metrics, and grain.', 'Map to selected tables and required joins.', 'Generate SQL with transparent assumptions.', 'Return validation notes for quick human review.'],
    checks: ['Query has deterministic ORDER BY when using LIMIT.', 'Date filters are explicit and timezone-safe.', 'Aggregations and GROUP BY columns are aligned.', 'No destructive SQL in dev/prod safety modes.'],
    outputs: ['Executable SQL draft.', 'Assumption notes for reviewer confirmation.', 'Optional alternative query variants.'],
    prompts: ['Show top 20 customers by revenue in last 30 days.', 'Count active accounts by segment for this quarter.'],
  },
  'Query Optimizer': {
    objective: 'Improve query runtime, cost, and stability without changing business results.',
    responsibilities: ['Identify expensive scans, skewed joins, and spill risks.', 'Recommend predicate pushdown and projection pruning.', 'Refactor CTEs/subqueries for planner efficiency.', 'Suggest clustering/materialization opportunities.'],
    workflow: ['Inspect baseline SQL and expected row cardinality.', 'Remove nonessential columns and intermediate sorts.', 'Rewrite joins and aggregations with lower scan cost.', 'Compare before/after execution characteristics.'],
    checks: ['Result set semantics remain unchanged.', 'Filters are sargable and pushed early.', 'High-cardinality joins are constrained.', 'Warehouse size recommendation matches workload.'],
    outputs: ['Optimized SQL version.', 'Performance rationale and trade-offs.', 'Operational tuning checklist.'],
    prompts: ['Optimize this monthly KPI query for faster runtime.', 'Reduce warehouse cost for daily dashboard refresh.'],
  },
  'Data Explorer': {
    objective: 'Discover relevant datasets quickly and map user intent to the right tables.',
    responsibilities: ['List databases, schemas, and candidate tables.', 'Surface joinable entities and naming signals.', 'Guide users to minimal table set for a question.', 'Promote trusted sources over raw duplicates.'],
    workflow: ['Start from business question and domain context.', 'Traverse database->schema->table hierarchy.', 'Shortlist tables and verify key columns.', 'Pass selected tables to SQL generation stage.'],
    checks: ['Selected table set is complete but minimal.', 'Ambiguous similarly named tables are clarified.', 'Schema ownership and freshness are understood.', 'Selected tables align with requested grain.'],
    outputs: ['Table shortlist and rationale.', 'Suggested join path.', 'Prompt-ready context for SQL drafting.'],
    prompts: ['Find tables needed for loan default trend by month.', 'Which schema has customer-account relationship tables?'],
  },
  'Warehouse Monitor': {
    objective: 'Monitor Snowflake consumption and identify practical efficiency improvements.',
    responsibilities: ['Track warehouse utilization and credit trends.', 'Detect idle time, queueing, and burst patterns.', 'Flag unusually expensive query windows.', 'Recommend sizing and schedule adjustments.'],
    workflow: ['Collect warehouse usage windows and query volume.', 'Compare utilization against SLA thresholds.', 'Correlate spikes with workload classes.', 'Propose operational changes and validation plan.'],
    checks: ['Recommendations include measurable KPIs.', 'Cost reductions do not violate SLA.', 'Peak windows are explicitly protected.', 'Changes are reversible with rollback criteria.'],
    outputs: ['Usage summary report.', 'Top cost drivers with evidence.', 'Tuning action plan with expected impact.'],
    prompts: ['Summarize warehouse credits used in last 14 days.', 'Find high-cost hours and recommend right-sizing.'],
  },
  'Metadata Inspector': {
    objective: 'Expose schema details and structural context for reliable SQL generation and governance.',
    responsibilities: ['Inspect column types, nullability, and defaults.', 'Highlight naming anomalies and type mismatches.', 'Identify keys and likely join columns.', 'Document table contracts for downstream users.'],
    workflow: ['Describe table structures and key fields.', 'Validate business-critical columns and formats.', 'Compare related tables for compatibility.', 'Publish metadata notes for query authors.'],
    checks: ['Data types align with expected aggregations.', 'Nullable fields are handled in query logic.', 'Join keys have compatible types and semantics.', 'Schema changes are captured in documentation.'],
    outputs: ['Column-level metadata summary.', 'Join and compatibility notes.', 'Schema quality observations.'],
    prompts: ['Describe ACCOUNT table and identify join keys.', 'Compare column compatibility between ACCOUNT and TRANSACTION.'],
  },
  'Requirements Analyst': {
    objective: 'Capture business requirements, convert them to testable data stories, and generate project canvas documents.',
    responsibilities: ['Extract KPIs from business goals with specific formulas and targets.', 'Map requirements to source systems and flag data gaps.', 'Generate user stories with acceptance criteria.', 'Produce project canvas documents for downstream phases.'],
    workflow: ['Gather business context and stakeholder needs.', 'Extract measurable KPIs with formulas and targets.', 'Inventory source systems and assess readiness.', 'Generate structured user stories and project canvas.'],
    checks: ['Every KPI has a formula and measurable target.', 'All source systems are inventoried with owners.', 'User stories have clear acceptance criteria.', 'PII and compliance requirements are flagged.'],
    outputs: ['Project canvas document.', 'User story cards with acceptance criteria.', 'Source system inventory.', 'KPI definitions with formulas.'],
    prompts: ['Help me scope a customer churn prediction project.', 'Define KPIs for our sales performance dashboard.'],
  },
  'Data Contract Writer': {
    objective: 'Draft source-to-consumer data contracts with schema, SLAs, PII classification, and ownership.',
    responsibilities: ['Define column-level schemas with types, nullability, and descriptions.', 'Set freshness SLAs and availability requirements.', 'Classify PII fields and set governance rules.', 'Generate machine-readable YAML contract definitions.'],
    workflow: ['Identify producer, consumer, and grain of the dataset.', 'Document schema with full column metadata.', 'Define SLAs for freshness, availability, and quality.', 'Generate versioned data contract in YAML format.'],
    checks: ['Every column has type, nullable, and description.', 'PII fields are explicitly classified.', 'SLAs are specific and measurable.', 'Quality rules are testable and automated.'],
    outputs: ['YAML data contract definition.', 'Schema documentation.', 'Quality rules specification.'],
    prompts: ['Create a data contract for our orders table.', 'Define SLAs for the customer analytics mart.'],
  },
  'Source System Surveyor': {
    objective: 'Inventory source systems, document schemas, assess connectivity, and evaluate data readiness.',
    responsibilities: ['Map every data requirement to its originating system.', 'Document system connectivity, ownership, and SLAs.', 'Assess source readiness with scoring methodology.', 'Recommend ingestion patterns for each source.'],
    workflow: ['Trace data requirements to source systems.', 'Inventory system details and access patterns.', 'Score readiness across connectivity, docs, reliability.', 'Recommend ingestion patterns and flag risks.'],
    checks: ['Every requirement has a traced source.', 'PII fields are identified at the source level.', 'Connectivity is confirmed or flagged as blocked.', 'Ingestion patterns match source characteristics.'],
    outputs: ['Source system inventory.', 'Readiness assessment scores.', 'Gap analysis report.'],
    prompts: ['Survey the data sources for our customer 360 project.', 'Assess readiness of our commerce platform data.'],
  },
};

// Icon backgrounds for skill cards - more vibrant
const SKILL_STYLES: Record<string, { bg: string; iconBg: string; text: string; border: string; hoverBg: string }> = {
  'Data Architect': { bg: 'bg-blue-900/20', iconBg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hoverBg: 'hover:bg-blue-900/40' },
  'Analytics Engineer': { bg: 'bg-emerald-900/20', iconBg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', hoverBg: 'hover:bg-emerald-900/40' },
  'ML Engineer': { bg: 'bg-purple-900/20', iconBg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hoverBg: 'hover:bg-purple-900/40' },
  'SQL Writer': { bg: 'bg-cyan-900/20', iconBg: 'bg-primary/20', text: 'text-primary', border: 'border-primary/30', hoverBg: 'hover:bg-cyan-900/40' },
  'Query Optimizer': { bg: 'bg-amber-900/20', iconBg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', hoverBg: 'hover:bg-amber-900/40' },
  'Data Explorer': { bg: 'bg-teal-900/20', iconBg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', hoverBg: 'hover:bg-teal-900/40' },
  'Warehouse Monitor': { bg: 'bg-indigo-900/20', iconBg: 'bg-indigo-500/20', text: 'text-accent', border: 'border-indigo-500/30', hoverBg: 'hover:bg-indigo-900/40' },
  'Metadata Inspector': { bg: 'bg-surface-hover/40', iconBg: 'bg-surface-active', text: 'text-foreground', border: 'border-slate-700', hoverBg: 'hover:bg-surface-hover/60' },
  'Requirements Analyst': { bg: 'bg-orange-900/20', iconBg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hoverBg: 'hover:bg-orange-900/40' },
  'Data Contract Writer': { bg: 'bg-rose-900/20', iconBg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', hoverBg: 'hover:bg-rose-900/40' },
  'Source System Surveyor': { bg: 'bg-sky-900/20', iconBg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/30', hoverBg: 'hover:bg-sky-900/40' },
  'Metadata Explorer': { bg: 'bg-violet-900/20', iconBg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30', hoverBg: 'hover:bg-violet-900/40' },
  'Query Profiler': { bg: 'bg-pink-900/20', iconBg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', hoverBg: 'hover:bg-pink-900/40' },
  'Lineage Analyst': { bg: 'bg-indigo-900/20', iconBg: 'bg-indigo-500/20', text: 'text-accent', border: 'border-indigo-500/30', hoverBg: 'hover:bg-indigo-900/40' },
  'Data Quality Engineer': { bg: 'bg-green-900/20', iconBg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', hoverBg: 'hover:bg-green-900/40' },
  'Cost Optimization': { bg: 'bg-yellow-900/20', iconBg: 'bg-yellow-500/20', text: 'text-yellow-500', border: 'border-yellow-500/30', hoverBg: 'hover:bg-yellow-900/40' },
  'Cortex AI Functions': { bg: 'bg-fuchsia-900/20', iconBg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', hoverBg: 'hover:bg-fuchsia-900/40' },
  'Cortex Analyst Builder': { bg: 'bg-fuchsia-900/20', iconBg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', hoverBg: 'hover:bg-fuchsia-900/40' },
  'Semantic Layer Designer': { bg: 'bg-violet-900/20', iconBg: 'bg-violet-500/20', text: 'text-violet-400', border: 'border-violet-500/30', hoverBg: 'hover:bg-violet-900/40' },
  'dbt Developer': { bg: 'bg-orange-900/20', iconBg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hoverBg: 'hover:bg-orange-900/40' },
  'dbt Test Engineer': { bg: 'bg-orange-900/20', iconBg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', hoverBg: 'hover:bg-orange-900/40' },
  'RBAC Manager': { bg: 'bg-red-900/20', iconBg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', hoverBg: 'hover:bg-red-900/40' },
  'Security Analyst': { bg: 'bg-red-900/20', iconBg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', hoverBg: 'hover:bg-red-900/40' },
  'Streamlit Developer': { bg: 'bg-cyan-900/20', iconBg: 'bg-primary/20', text: 'text-primary', border: 'border-primary/30', hoverBg: 'hover:bg-cyan-900/40' },
  'Notebook Developer': { bg: 'bg-blue-900/20', iconBg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', hoverBg: 'hover:bg-blue-900/40' },
  'Marketplace Advisor': { bg: 'bg-emerald-900/20', iconBg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', hoverBg: 'hover:bg-emerald-900/40' },
  'Task Planner': { bg: 'bg-purple-900/20', iconBg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hoverBg: 'hover:bg-purple-900/40' },
  'Workflow Orchestrator': { bg: 'bg-purple-900/20', iconBg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', hoverBg: 'hover:bg-purple-900/40' },
  'Code Reviewer': { bg: 'bg-surface-hover/40', iconBg: 'bg-surface-active', text: 'text-foreground', border: 'border-slate-700', hoverBg: 'hover:bg-surface-hover/60' },
  'Snowflake Docs Lookup': { bg: 'bg-sky-900/20', iconBg: 'bg-sky-500/20', text: 'text-sky-400', border: 'border-sky-500/30', hoverBg: 'hover:bg-sky-900/40' },
};

const buildDetailedSkillMarkdown = (skill: any) => {
  const skillMap: Record<string, string> = {
    'Data Architect': dataArchitectSkillMd,
    'SQL Writer': sqlGenerationSkillMd,
    'Stored Procedure Writer': storedProcedureSkillMd,
    'Query Optimizer': queryOptimizerSkillMd,
    'Analytics Engineer': analyticsEngineerSkillMd,
    'Requirements Analyst': requirementsAnalystMd,
    'Data Contract Writer': dataContractWriterMd,
    'Source System Surveyor': sourceSystemSurveyorMd,
    'Metadata Explorer': metadataExplorerMd,
    'Query Profiler': queryProfilerMd,
    'Lineage Analyst': lineageAnalystMd,
    'Data Quality Engineer': dataQualityEngineerMd,
    'Cost Optimization': costOptimizationMd,
    'Cortex AI Functions': cortexAiFunctionsMd,
    'Cortex Analyst Builder': cortexAnalystBuilderMd,
    'Semantic Layer Designer': semanticLayerDesignerMd,
    'dbt Developer': dbtDeveloperMd,
    'dbt Test Engineer': dbtTestEngineerMd,
    'RBAC Manager': rbacManagerMd,
    'Security Analyst': securityAnalystMd,
    'ML Engineer': mlEngineerMd,
    'Streamlit Developer': streamlitDeveloperMd,
    'Notebook Developer': notebookDeveloperMd,
    'Marketplace Advisor': marketplaceAdvisorMd,
    'Task Planner': taskPlannerMd,
    'Workflow Orchestrator': workflowOrchestratorMd,
    'Code Reviewer': codeReviewerMd,
    'Snowflake Docs Lookup': snowflakeDocsLookupMd,
  };

  if (skillMap[skill.name]) return skillMap[skill.name];

  const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
  const template = SKILL_TEMPLATES[skill.name] || {
    objective: skill.description || `Execute tasks related to ${skill.name}.`,
    responsibilities: [`Handle requests in the ${skill.name} domain.`, 'Provide clear recommendations.'],
    workflow: ['Understand request.', 'Prepare output.', 'Return result.'],
    checks: ['Output is complete.', 'Assumptions explicit.'],
    outputs: ['Task-ready guidance.'],
    prompts: [`Help me with ${skill.name.toLowerCase()}.`],
  };

  return `---\nname: ${slug}\ndescription: ${skill.description}\n---\n\n# ${skill.name}\n\n## Objective\n${template.objective}\n\n## Responsibilities\n${template.responsibilities.map(i => `- ${i}`).join('\n')}\n\n## Workflow\n${template.workflow.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}\n`;
};

const getIcon = (name: string) => {
  const Icon = (Icons as any)[name] || Icons.Wrench;
  return <Icon className="w-4 h-4" />;
};

export function LeftPanel() {
  const { skills, activeSkills, toggleSkill, addSkill, updateSkill, deleteSkill, projects, activeProjectId, setActiveProject, createProject, selectedModel, setSelectedModel } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const handleAddSave = () => {
    if (!editName.trim()) return;
    addSkill({ id: `custom-${Date.now()}`, name: editName, description: editDesc, iconName: 'Wrench', isCustom: true });
    setIsAdding(false);
    setEditName('');
    setEditDesc('');
  };

  const handleEditSave = (id: string) => {
    if (!editName.trim()) return;
    updateSkill(id, { name: editName, description: editDesc });
    setEditingId(null);
  };

  const startEdit = (skill: any) => {
    setEditingId(skill.id);
    setEditName(skill.name);
    setEditDesc(skill.description);
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    createProject({
      name: newProjectName.trim(),
      description: '',
      businessGoals: [],
      stakeholders: [],
      kpis: [],
      sourceSystems: [],
      userStories: [],
      currentPhase: 'discovery',
    });
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleDownloadSkill = (skill: any) => {
    const slug = skill.name.toLowerCase().replace(/\s+/g, '-');
    const mdContent = buildDetailedSkillMarkdown(skill);
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full bg-transparent flex flex-col shrink-0 text-foreground">

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Projects Section */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-widest">Projects</span>
             <button onClick={() => setShowNewProject(!showNewProject)} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-muted hover:text-primary transition-colors">
              <Icons.Plus className="w-4 h-4" />
            </button>
          </div>

          <AnimatePresence>
            {showNewProject && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-2">
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={e => setNewProjectName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
                    placeholder="Project name..."
                    className="flex-1 bg-surface border border-slate-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary/50 focus:bg-surface-elevated placeholder:text-muted text-white transition-colors"
                  />
                  <button onClick={handleCreateProject} disabled={!newProjectName.trim()} className="px-3 py-1.5 bg-cyan-600 text-white text-sm font-medium rounded-lg hover:bg-cyan-500 disabled:opacity-30 transition-colors shadow-sm">
                    Add
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {projects.length > 0 ? (
            <div className="space-y-1">
              {projects.map(project => {
                const isActive = project.id === activeProjectId;
                return (
                  <button
                    key={project.id}
                    onClick={() => setActiveProject(project.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
                      isActive
                          ? 'bg-primary/10 text-primary shadow-sm border border-primary/20'
                        : 'text-muted hover:bg-surface-hover hover:text-foreground border border-transparent'
                    }`}
                  >
                    <Icons.FolderKanban className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted'}`} />
                    <span className="truncate text-sm font-medium">{project.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              onClick={() => setShowNewProject(true)}
               className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-700/50 rounded-lg text-sm text-muted hover:text-primary hover:border-primary/50 transition-colors bg-surface/30 hover:bg-surface/50"
            >
              <Icons.Plus className="w-4 h-4" />
              Create first project
            </button>
          )}
        </div>

        {/* Skills Section */}
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-widest">AI Skills</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-primary bg-cyan-950/50 border border-cyan-900 px-1.5 py-0.5 rounded">{activeSkills.length}/3 active</span>
                <button onClick={() => { setIsAdding(true); setEditName(''); setEditDesc(''); }} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover text-muted hover:text-primary transition-colors">
                <Icons.Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {isAdding && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-surface p-3 rounded-xl border border-slate-700 mb-3 overflow-hidden">
                <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} placeholder="Skill name" className="w-full bg-surface-elevated border border-slate-700 text-white rounded-lg px-2.5 py-2 text-sm mb-2 outline-none focus:border-primary/50 placeholder:text-muted" />
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="w-full bg-surface-elevated border border-slate-700 text-white rounded-lg px-2.5 py-2 text-xs mb-2 outline-none focus:border-primary/50 resize-none placeholder:text-muted" rows={2} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsAdding(false)} className="text-xs text-muted hover:text-foreground px-2 py-1">Cancel</button>
                  <button onClick={handleAddSave} className="text-xs bg-cyan-600 text-white px-3 py-1 rounded-lg hover:bg-cyan-500 font-medium">Save</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-2">
            {skills.map((skill) => {
              const isActive = activeSkills.includes(skill.name);
              const isEditing = editingId === skill.id;
              const isExpanded = expandedSkill === skill.id;
              const style = SKILL_STYLES[skill.name] || { bg: 'bg-gray-50', iconBg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', hoverBg: 'hover:bg-gray-50' };

              if (isEditing) {
                return (
                  <div key={skill.id} className="bg-surface p-3 rounded-xl border border-slate-700">
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-surface-elevated border border-slate-700 text-white rounded-lg px-2.5 py-2 text-sm mb-2 outline-none focus:border-primary/50" />
                    <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-surface-elevated border border-slate-700 text-white rounded-lg px-2.5 py-2 text-xs mb-2 outline-none focus:border-primary/50 resize-none" rows={2} />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="text-xs text-muted hover:text-foreground px-2 py-1">Cancel</button>
                      <button onClick={() => handleEditSave(skill.id)} className="text-xs bg-cyan-600 text-white px-3 py-1 rounded-lg hover:bg-cyan-500 font-medium">Save</button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={skill.id}
                  className={`rounded-xl border transition-all cursor-pointer group ${
                    isActive
                      ? `${style.bg} ${style.border} shadow-[0_0_15px_rgba(6,182,212,0.05)]`
                      : 'border-transparent hover:border-border hover:bg-surface/40 hover:shadow-sm'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 p-3"
                    onClick={() => toggleSkill(skill.name)}
                  >
                    {/* Icon container */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isActive ? style.iconBg : 'bg-surface border border-border'}`}>
                      <div className={isActive ? style.text : 'text-muted'}>
                        {getIcon(skill.iconName)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold break-words whitespace-normal leading-tight ${isActive ? style.text : 'text-foreground'}`}>
                          {skill.name}
                        </div>
                        <div className="text-xs text-foreground/55 mt-0.5 line-clamp-2">
                          {skill.description}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isActive && (
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${style.iconBg}`}>
                          <Icons.Check className={`w-3 h-3 ${style.text}`} />
                        </div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedSkill(isExpanded ? null : skill.id); }}
                        className="w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-surface-hover transition-all"
                      >
                        <Icons.ChevronRight className={`w-4 h-4 text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 pt-0">
                          <div className="border-t border-border pt-3 mt-1">
                            <p className="text-xs text-muted leading-relaxed mb-3">{skill.description}</p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={(e) => { e.stopPropagation(); handleDownloadSkill(skill); }} className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-primary px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors">
                                  <Icons.Download className="w-3 h-3" />
                                  Export
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); startEdit(skill); }} className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-primary px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors">
                                <Icons.Edit2 className="w-3 h-3" />
                                Edit
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); deleteSkill(skill.id); }} className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-red-400 px-2 py-1.5 rounded-md hover:bg-red-950/30 transition-colors">
                                <Icons.Trash2 className="w-3 h-3" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-4 border-t border-border">
          <span className="text-[11px] font-bold text-muted uppercase tracking-widest block mb-3">Quick Actions</span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                const store = useStore.getState();
                if (store.activeProjectId) {
                  // Find the project panel button in the header and click it
                  const event = new CustomEvent('open-project-panel', { detail: { tab: 'canvas' } });
                  window.dispatchEvent(event);
                }
              }}
               className="flex flex-col items-center gap-2 p-3 bg-surface border border-transparent hover:border-primary/30 hover:bg-cyan-950/20 rounded-xl transition-all group"
            >
              <Icons.LayoutDashboard className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
              <span className="text-[11px] font-semibold text-muted group-hover:text-primary transition-colors">Canvas</span>
            </button>
            <button
              onClick={() => {
                const store = useStore.getState();
                if (store.activeProjectId) {
                  const event = new CustomEvent('open-project-panel', { detail: { tab: 'stories' } });
                  window.dispatchEvent(event);
                }
              }}
              className="flex flex-col items-center gap-2 p-3 bg-surface border border-transparent hover:border-emerald-500/30 hover:bg-emerald-950/20 rounded-xl transition-all group"
            >
              <Icons.ListChecks className="w-5 h-5 text-muted group-hover:text-emerald-400 transition-colors" />
              <span className="text-[11px] font-semibold text-muted group-hover:text-emerald-400 transition-colors">Stories</span>
            </button>
            <button
              onClick={() => {
                const store = useStore.getState();
                if (store.activeProjectId) {
                  const event = new CustomEvent('open-project-panel', { detail: { tab: 'workflow' } });
                  window.dispatchEvent(event);
                }
              }}
              className="flex flex-col items-center gap-2 p-3 bg-surface border border-transparent hover:border-purple-500/30 hover:bg-purple-950/20 rounded-xl transition-all group"
            >
              <Icons.GitBranch className="w-5 h-5 text-muted group-hover:text-purple-400 transition-colors" />
              <span className="text-[11px] font-semibold text-muted group-hover:text-purple-400 transition-colors">Workflow</span>
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('open-monitor');
                window.dispatchEvent(event);
              }}
              className="flex flex-col items-center gap-2 p-3 bg-surface border border-transparent hover:border-amber-500/30 hover:bg-amber-950/20 rounded-xl transition-all group"
            >
              <Icons.Activity className="w-5 h-5 text-muted group-hover:text-amber-400 transition-colors" />
              <span className="text-[11px] font-semibold text-muted group-hover:text-amber-400 transition-colors">Monitor</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom status */}
      <div className="px-4 py-3 border-t border-border shrink-0 bg-surface-elevated">
        <div className="flex items-center justify-between text-[10px] text-muted">
          <span className="font-mono tracking-wider">{skills.length} skills</span>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="font-mono tracking-wider text-primary">Snowflake</span>
          </div>
        </div>
      </div>
    </div>
  );
}
