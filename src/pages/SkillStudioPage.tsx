import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft, Eye, Code, Sparkles, Send, Play,
  FileText, Settings, Paperclip, Download,
  Upload, X, ChevronDown, Check, AlertCircle,
  Loader2, Bot, Zap, AlertTriangle,
} from 'lucide-react';
import { Button, Badge, Card, Tabs, Input, useToast, Dropdown, DropdownItem, DropdownSeparator } from '../components/ui';
import { ROUTES } from '../constants/routes';
import {
  getSkill, createSkill, updateSkill, updateSkillState, executeModel, fetchModels,
  type SkillRegistryItem, type ModelItem,
} from '../services/backendApi';

interface SkillFrontmatter {
  name: string;
  description: string;
  category: string;
  version: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

interface Attachment {
  id: string;
  name: string;
  type: string;
  size: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-skill';
}

export function SkillStudioPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isNew = !skillId || skillId === 'new';

  const [loadingSkill, setLoadingSkill] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedSkillId, setSavedSkillId] = useState<string | null>(isNew ? null : skillId ?? null);

  const [frontmatter, setFrontmatter] = useState<SkillFrontmatter>({
    name: '',
    description: '',
    category: 'general',
    version: '1.0.0',
  });
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [models, setModels] = useState<ModelItem[]>([]);

  const [activeTab, setActiveTab] = useState('editor');
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const aiEndRef = useRef<HTMLDivElement>(null);

  // Load existing skill on mount
  useEffect(() => {
    fetchModels().then(setModels).catch(() => {});
    if (isNew) return;
    setLoadingSkill(true);
    getSkill(skillId!).then((skill: SkillRegistryItem) => {
      setFrontmatter({
        name: skill.display_name,
        description: skill.description,
        category: skill.domain || skill.skill_type || 'general',
        version: skill.version || '1.0.0',
      });
      setContent(skill.instructions || '');
      setSaveStatus('saved');
    }).catch((err: Error) => {
      setLoadError(err.message || 'Failed to load skill');
    }).finally(() => setLoadingSkill(false));
  }, [skillId, isNew]);

  // Auto-save with debounce (only after first save)
  useEffect(() => {
    if (isNew && !savedSkillId) return; // Don't auto-save new unsaved skills
    if (saveStatus === 'saved') return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('unsaved');
    saveTimerRef.current = setTimeout(() => {
      doSave();
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [content, frontmatter]);

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiLoading]);

  // Keyboard shortcut Ctrl/Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        doSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [frontmatter, content, savedSkillId, isNew]);

  const doSave = useCallback(async () => {
    if (!frontmatter.name.trim()) {
      toast('error', 'Skill name is required');
      setSaveStatus('error');
      return;
    }
    setIsSaving(true);
    setSaveStatus('saving');
    try {
      const payload = {
        display_name: frontmatter.name,
        description: frontmatter.description,
        domain: frontmatter.category,
        skill_type: 'ai',
        instructions: content,
        version: frontmatter.version || '1.0.0',
      };

      if (isNew && !savedSkillId) {
        // First save — create new skill
        const created = await createSkill({
          skill_id: slugify(frontmatter.name),
          ...payload,
          is_enabled: false,
        });
        setSavedSkillId(created.skill_id);
        setSaveStatus('saved');
        toast('success', 'Skill created');
        navigate(`/skills/${created.skill_id}/edit`, { replace: true });
      } else {
        // Update existing
        const id = savedSkillId || skillId!;
        await updateSkill(id, payload);
        setSaveStatus('saved');
        toast('success', 'Skill saved');
      }
    } catch (err: unknown) {
      setSaveStatus('error');
      toast('error', err instanceof Error ? err.message : 'Failed to save skill');
    } finally {
      setIsSaving(false);
    }
  }, [frontmatter, content, isNew, savedSkillId, skillId, navigate, toast]);

  const handlePublish = useCallback(async (action: 'published' | 'draft' | 'archived') => {
    const id = savedSkillId || skillId;
    if (!id) {
      // Save first, then publish
      await doSave();
      return;
    }
    setIsPublishing(true);
    try {
      if (action === 'archived') {
        await updateSkillState(id, false);
        toast('success', 'Skill archived');
      } else {
        await updateSkill(id, { is_enabled: action === 'published' });
        toast('success', action === 'published' ? 'Skill published' : 'Saved as draft');
      }
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to update skill');
    } finally {
      setIsPublishing(false);
    }
  }, [savedSkillId, skillId, doSave, toast]);

  const handleAiSend = useCallback(async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAiInput('');
    setAiLoading(true);

    // Use a suitable model — pick first available
    const modelId = models.find((m) => m.is_available)?.model_id;
    const id = savedSkillId || (isNew ? null : skillId);

    if (!modelId || !id) {
      // Fallback: inform user to save and assign a model
      setAiMessages((prev) => [...prev, {
        role: 'assistant',
        content: id
          ? 'No model available. Ask an admin to assign a model to your account.'
          : 'Save the skill first, then the AI assistant will be able to help you.',
        error: !modelId && !!id,
      }]);
      setAiLoading(false);
      return;
    }

    try {
      const contextPrompt = `You are an AI skill authoring assistant helping improve a skill called "${frontmatter.name}".

Current skill instructions:
---
${content.substring(0, 1500)}
---

User request: ${userMsg}`;
      const res = await executeModel(id, modelId, contextPrompt, 800);
      setAiMessages((prev) => [...prev, { role: 'assistant', content: res.result }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI assistant failed';
      setAiMessages((prev) => [...prev, { role: 'assistant', content: msg, error: true }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, models, savedSkillId, skillId, isNew, frontmatter.name, content]);

  const handleInsertAiSuggestion = useCallback((text: string) => {
    setContent((prev) => prev + '\n\n' + text);
    setSaveStatus('unsaved');
    toast('success', 'Inserted into editor');
  }, [toast]);

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    toast('success', 'Attachment removed');
  };

  const statusBadge = saveStatus === 'saved'
    ? <Badge variant="success" size="sm" dot>Saved</Badge>
    : saveStatus === 'saving'
    ? <Badge variant="info" size="sm"><Loader2 className="w-3 h-3 animate-spin mr-1" />Saving</Badge>
    : saveStatus === 'unsaved'
    ? <Badge variant="warning" size="sm" dot>Unsaved</Badge>
    : <Badge variant="error" size="sm" dot>Error</Badge>;

  if (loadingSkill) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm text-muted">Loading skill…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex items-center gap-2 text-error">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm font-medium">{loadError}</p>
        </div>
        <Button variant="secondary" onClick={() => navigate(ROUTES.SKILLS)}>Back to Skills</Button>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col animate-fade-in-up">
      {/* Studio Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.SKILLS)}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Back to skills"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">
                {isNew && !savedSkillId ? 'Create Skill' : frontmatter.name || 'Untitled Skill'}
              </h1>
              {statusBadge}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {isNew && !savedSkillId ? 'Building a new AI skill' : `Editing v${frontmatter.version}`}
              <span className="mx-1">·</span>
              <kbd className="px-1 py-0.5 bg-surface rounded text-[10px] border border-border">⌘S</kbd> to save
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={aiPanelOpen ? <X className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
          >
            AI Assistant
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={isSaving}
            icon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
            onClick={doSave}
          >
            Save
          </Button>
          <Dropdown
            trigger={
              <Button size="sm" disabled={isPublishing} iconRight={isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronDown className="w-3.5 h-3.5" />}>
                Publish
              </Button>
            }
            align="end"
          >
            <DropdownItem icon={<FileText className="w-4 h-4" />} onClick={() => handlePublish('draft')}>
              Save as Draft
            </DropdownItem>
            <DropdownItem icon={<Check className="w-4 h-4" />} onClick={() => handlePublish('published')}>
              Publish
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<AlertCircle className="w-4 h-4" />} destructive onClick={() => handlePublish('archived')}>
              Archive
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Editor Pane */}
        <div className="flex-1 flex flex-col min-w-0">
          <Card padding="none" className="flex-1 flex flex-col overflow-hidden">
            {/* Frontmatter */}
            <div className="border-b border-border p-4 shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Settings className="w-4 h-4 text-muted" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Properties</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Name"
                  value={frontmatter.name}
                  onChange={(e) => { setFrontmatter((prev) => ({ ...prev, name: e.target.value })); setSaveStatus('unsaved'); }}
                  placeholder="Skill name"
                />
                <Input
                  label="Category / Domain"
                  value={frontmatter.category}
                  onChange={(e) => { setFrontmatter((prev) => ({ ...prev, category: e.target.value })); setSaveStatus('unsaved'); }}
                  placeholder="e.g., sql, ml, analytics"
                />
                <Input
                  label="Version"
                  value={frontmatter.version}
                  onChange={(e) => { setFrontmatter((prev) => ({ ...prev, version: e.target.value })); setSaveStatus('unsaved'); }}
                  placeholder="1.0.0"
                />
                <Input
                  label="Description"
                  value={frontmatter.description}
                  onChange={(e) => { setFrontmatter((prev) => ({ ...prev, description: e.target.value })); setSaveStatus('unsaved'); }}
                  placeholder="Brief description"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-border px-4 shrink-0">
              <Tabs
                tabs={[
                  { key: 'editor', label: 'Editor', icon: <Code className="w-3.5 h-3.5" /> },
                  { key: 'preview', label: 'Preview', icon: <Eye className="w-3.5 h-3.5" /> },
                  { key: 'attachments', label: 'Files', icon: <Paperclip className="w-3.5 h-3.5" />, badge: attachments.length },
                ]}
                activeKey={activeTab}
                onChange={setActiveTab}
                size="sm"
              />
              <div className="flex items-center gap-1">
                <Button size="xs" variant="ghost" icon={<Download className="w-3.5 h-3.5" />} onClick={() => {
                  const blob = new Blob([content], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${slugify(frontmatter.name || 'skill')}.md`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>Export</Button>
                <Button size="xs" variant="ghost" icon={<Upload className="w-3.5 h-3.5" />} onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.md,.txt';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setContent(text);
                    setSaveStatus('unsaved');
                  };
                  input.click();
                }}>Import</Button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 overflow-hidden">
              {activeTab === 'editor' && (
                <textarea
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setSaveStatus('unsaved'); }}
                  className="w-full h-full p-4 text-sm font-mono text-foreground bg-background resize-none outline-none"
                  spellCheck={false}
                  aria-label="Skill instructions editor"
                  placeholder="Write skill instructions here (markdown supported)..."
                />
              )}

              {activeTab === 'preview' && (
                <div className="h-full overflow-y-auto p-6 prose prose-sm max-w-none">
                  {content.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{line.replace('## ', '')}</h2>;
                    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold text-foreground mt-3 mb-1.5">{line.replace('### ', '')}</h3>;
                    if (line.startsWith('- ')) return <li key={i} className="text-sm text-muted">{line.replace('- ', '')}</li>;
                    if (line.startsWith('```') || line.trim() === '') return <br key={i} />;
                    return <p key={i} className="text-sm text-muted leading-relaxed">{line}</p>;
                  })}
                </div>
              )}

              {activeTab === 'attachments' && (
                <div className="p-4">
                  {attachments.length === 0 ? (
                    <div className="text-center py-8">
                      <Paperclip className="w-8 h-8 text-muted mx-auto mb-2" />
                      <p className="text-sm text-muted">No attachments configured</p>
                      <p className="text-xs text-muted mt-1">Attachment uploads are not enabled for this workspace yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map((file) => (
                        <div key={file.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-surface">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{file.name}</p>
                              <p className="text-xs text-muted">{file.size} · {file.type}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveAttachment(file.id)}
                            className="p-1 rounded text-muted hover:text-error hover:bg-error-light/50 transition-colors"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* AI Assistant Panel */}
        {aiPanelOpen && (
          <motion.div
            initial={{ opacity: 0, x: 16, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 360 }}
            exit={{ opacity: 0, x: 16, width: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0"
          >
            <Card padding="none" className="h-full flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">AI Assistant</span>
                </div>
                <button
                  onClick={() => setAiPanelOpen(false)}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-surface transition-colors"
                  aria-label="Close AI assistant"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiMessages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">How can I help?</p>
                    <p className="text-xs text-muted mt-1">Ask me to improve your skill content</p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.error
                        ? 'bg-error/10 text-error border border-error/20'
                        : 'bg-surface text-foreground'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.role === 'assistant' && !msg.error && (
                        <div className="flex items-center gap-1 mt-2">
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={<Zap className="w-3 h-3" />}
                            onClick={() => handleInsertAiSuggestion(msg.content)}
                          >
                            Insert
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-surface rounded-xl px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={aiEndRef} />
              </div>

              <div className="border-t border-border p-3 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
                    placeholder="Ask AI for help..."
                    disabled={aiLoading}
                    className="flex-1 h-8 px-3 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:opacity-50"
                    aria-label="AI assistant input"
                  />
                  <Button size="icon-sm" onClick={handleAiSend} disabled={!aiInput.trim() || aiLoading}>
                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {['Write description', 'Suggest tests', 'Improve content', 'Add examples'].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setAiInput(suggestion)}
                      className="text-[10px] px-2 py-1 rounded-full bg-surface text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
