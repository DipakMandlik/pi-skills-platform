import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft, Puzzle, Loader2, AlertCircle,
  Brain, Code2, Zap, Settings, Shield
} from 'lucide-react';
import { useAuth } from '../auth';
import { Card } from '../components/common';
import { useToast } from '../components/common';
import { skillsApi, type SkillRecord } from '../api/apiClient';

const SKILL_TYPE_ICONS: Record<string, React.ReactNode> = {
  ai:     <Brain className="w-4 h-4" />,
  sql:    <Code2 className="w-4 h-4" />,
  hybrid: <Zap className="w-4 h-4" />,
  system: <Settings className="w-4 h-4" />,
};

export function SkillDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { toast } = useToast();

  const [skill, setSkill] = useState<SkillRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!skillId) return;
    setLoading(true);
    skillsApi.get(token, skillId)
      .then(async (s) => {
        setSkill(s);
      })
      .catch(() => toast('error', 'Failed to load skill'))
      .finally(() => setLoading(false));
  }, [skillId, token, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-[var(--color-text-muted)]">Skill not found</p>
        <button onClick={() => navigate('/skills')} className="text-xs text-[var(--color-accent)] hover:underline">
          Back to skills
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => navigate('/skills')}
          className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Skills
        </button>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
            {SKILL_TYPE_ICONS[skill.skill_type] ?? <Puzzle className="w-6 h-6" />}
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--color-text-main)]">{skill.display_name}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{skill.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-lg border ${skill.is_enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {skill.is_enabled ? 'Active' : 'Disabled'}
            </span>
            <span className="text-xs font-mono text-[var(--color-text-light)] px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
              v{skill.version}
            </span>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: skill details */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card>
              <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-3">Details</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  { label: 'Skill ID', value: skill.skill_id, mono: true },
                  { label: 'Type', value: skill.skill_type },
                  { label: 'Domain', value: skill.domain },
                  { label: 'Assigned Users', value: String(skill.assignment_count) },
                ].map(({ label, value, mono }) => (
                  <div key={label}>
                    <p className="text-[var(--color-text-light)] mb-0.5">{label}</p>
                    <p className={`font-medium text-[var(--color-text-main)] ${mono ? 'font-mono' : ''}`}>{value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {skill.instructions && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-3">Instructions</h3>
                <p className="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap leading-relaxed">{skill.instructions}</p>
              </Card>
            </motion.div>
          )}

          {skill.required_models?.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <h3 className="text-sm font-semibold text-[var(--color-text-main)] mb-3">Required Models</h3>
                <div className="flex flex-wrap gap-2">
                  {skill.required_models.map((m) => (
                    <span key={m} className="text-xs font-mono px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-muted)]">
                      {m}
                    </span>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Right: execution context */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-[var(--color-text-main)]">Task Execution</h3>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                This skill runs directly through the AI execution pipeline with policy checks and audit logging.
              </p>
            </Card>
          </motion.div>

          {/* Execution path note */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card>
              <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Execution Flow</h3>
              <div className="space-y-1.5 text-[11px] text-[var(--color-text-muted)]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  Skill request validated
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Context + model checks applied
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Task executed + audit logged
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
