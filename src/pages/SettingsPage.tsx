import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Key, Bell, Palette, Sun, Moon, Monitor, Globe, Save, Database, Webhook, AlertTriangle, Loader2 } from 'lucide-react';
import { Button, Card, CardHeader, Tabs, Input, Select, Skeleton, useToast, Badge } from '../components/ui';
import { cn } from '../lib/cn';
import { fetchSettings, updateSettings, type OrgSettings } from '../services/backendApi';

type ThemeMode = 'light' | 'dark' | 'system';

interface IntegrationService {
  name: string;
  status: string;
  configurable: boolean;
}

interface ApiKeyItem {
  name: string;
  status: string;
  masked_value: string;
}

const defaultNotifications = {
  email: true,
  skillCreated: true,
  skillAssigned: true,
  skillEdited: false,
  userJoined: true,
  errors: true,
};

export function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState('Pi Skills Platform');
  const [orgDomain, setOrgDomain] = useState('example.com');
  const [defaultRegion, setDefaultRegion] = useState('us-east-1');
  const [notifications, setNotifications] = useState<Record<string, boolean>>(defaultNotifications);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [language, setLanguage] = useState('en');
  const [services, setServices] = useState<IntegrationService[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);

  const applyTheme = useCallback((newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    const root = document.documentElement;
    if (newTheme === 'dark') root.classList.add('dark');
    else if (newTheme === 'light') root.classList.remove('dark');
    else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const settings = await fetchSettings();
      setOrgName(settings.org_name);
      setOrgDomain(settings.org_domain);
      setDefaultRegion(settings.default_region);
      setNotifications(settings.notifications || defaultNotifications);
      const appearance = settings.appearance || {};
      applyTheme((appearance.theme as ThemeMode) || (localStorage.getItem('theme') as ThemeMode) || 'system');
      setLanguage((appearance.language as string) || 'en');
      const integrations = settings.integrations || {};
      setServices(Array.isArray((integrations as { services?: unknown }).services)
        ? ((integrations as { services?: IntegrationService[] }).services || [])
        : []);
      setApiKeys(Array.isArray((integrations as { api_keys?: unknown }).api_keys)
        ? ((integrations as { api_keys?: ApiKeyItem[] }).api_keys || [])
        : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const persistSettings = useCallback(async (payload: Partial<OrgSettings>) => {
    setSaving(true);
    try {
      await updateSettings(payload);
      toast('success', 'Settings saved successfully');
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Failed to save settings');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [toast]);

  const currentIntegrations = useMemo(() => ({
    services,
    api_keys: apiKeys,
  }), [services, apiKeys]);

  const handleGeneralSave = useCallback(async () => {
    await persistSettings({
      org_name: orgName.trim(),
      org_domain: orgDomain.trim(),
      default_region: defaultRegion,
      notifications,
      appearance: { theme, language },
      integrations: currentIntegrations,
    });
  }, [persistSettings, orgName, orgDomain, defaultRegion, notifications, theme, language, currentIntegrations]);

  const handleNotificationSave = useCallback(async () => {
    await persistSettings({
      notifications,
      appearance: { theme, language },
      integrations: currentIntegrations,
    });
  }, [persistSettings, notifications, theme, language, currentIntegrations]);

  const handleThemeSave = useCallback(async (newTheme?: ThemeMode, newLanguage?: string) => {
    await persistSettings({
      appearance: { theme: newTheme || theme, language: newLanguage || language },
      integrations: currentIntegrations,
    });
  }, [persistSettings, theme, language, currentIntegrations]);

  const handleServiceAction = useCallback(async (serviceName: string) => {
    const nextServices = services.map((service) => (
      service.name === serviceName
        ? {
          ...service,
          status: service.status === 'Connected' ? 'Configured' : 'Connected',
        }
        : service
    ));
    setServices(nextServices);
    try {
      await persistSettings({
        appearance: { theme, language },
        integrations: { services: nextServices, api_keys: apiKeys },
      });
    } catch {
      setServices(services);
    }
  }, [services, apiKeys, persistSettings, theme, language]);

  const handleGenerateKey = useCallback(async () => {
    const newKey: ApiKeyItem = {
      name: `Generated Key ${apiKeys.length + 1}`,
      status: 'Active',
      masked_value: `sk-${Math.random().toString(36).slice(2, 6)}••••••••••••••••••••`,
    };
    const nextKeys = [newKey, ...apiKeys];
    setApiKeys(nextKeys);
    try {
      await persistSettings({
        appearance: { theme, language },
        integrations: { services, api_keys: nextKeys },
      });
    } catch {
      setApiKeys(apiKeys);
    }
  }, [apiKeys, persistSettings, theme, language, services]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" width={120} height={28} />
        <Skeleton variant="rectangular" height={200} className="rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex items-center gap-2 text-error">
          <AlertTriangle className="w-5 h-5" />
          <p className="text-sm font-medium">{error}</p>
        </div>
        <Button variant="secondary" onClick={() => void loadSettings()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your organization preferences</p>
      </div>

      <Tabs
        tabs={[
          { key: 'general', label: 'General', icon: <Building2 className="w-4 h-4" /> },
          { key: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
          { key: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
          { key: 'integrations', label: 'Integrations', icon: <Webhook className="w-4 h-4" /> },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'general' && (
        <Card>
          <CardHeader title="Organization Profile" subtitle="Basic information about your organization" />
          <div className="space-y-4 mt-4">
            <Input label="Organization Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <Input label="Domain" value={orgDomain} onChange={(e) => setOrgDomain(e.target.value)} hint="Your organization's primary domain" />
            <Select
              label="Default Region"
              options={[
                { value: 'us-east-1', label: 'US East (N. Virginia)' },
                { value: 'us-west-2', label: 'US West (Oregon)' },
                { value: 'eu-west-1', label: 'EU (Ireland)' },
                { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
              ]}
              value={defaultRegion}
              onChange={(e) => setDefaultRegion(e.target.value)}
              placeholder="Select region"
            />
            <div className="flex justify-end pt-2">
              <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} disabled={saving} onClick={() => void handleGeneralSave()}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader title="Notification Preferences" subtitle="Choose what notifications you receive" />
          <div className="space-y-4 mt-4">
            {Object.entries({
              email: 'Email Notifications',
              skillCreated: 'Skill Created',
              skillAssigned: 'Skill Assigned to Me',
              skillEdited: 'Skill Modified',
              userJoined: 'New User Joined',
              errors: 'Error Alerts',
            }).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-2">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <button
                  onClick={() => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }))}
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    notifications[key] ? 'bg-primary' : 'bg-surface',
                  )}
                  role="switch"
                  aria-checked={notifications[key]}
                  aria-label={label}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-foreground shadow ring-0 transition duration-200',
                      notifications[key] ? 'translate-x-5' : 'translate-x-0',
                    )}
                  />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} disabled={saving} onClick={() => void handleNotificationSave()}>
                {saving ? 'Saving...' : 'Save Preferences'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'appearance' && (
        <Card>
          <CardHeader title="Appearance" subtitle="Customize the look and feel" />
          <div className="space-y-6 mt-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-3 block">Theme</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'light' as const, label: 'Light', icon: <Sun className="w-5 h-5" /> },
                  { value: 'dark' as const, label: 'Dark', icon: <Moon className="w-5 h-5" /> },
                  { value: 'system' as const, label: 'System', icon: <Monitor className="w-5 h-5" /> },
                ]).map((t) => (
                  <button
                    key={t.value}
                    onClick={() => applyTheme(t.value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors',
                      theme === t.value
                        ? 'border-primary bg-primary-lighter text-primary'
                        : 'border-border bg-surface text-muted hover:border-border-hover',
                    )}
                  >
                    {t.icon}
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-3 block">Language</label>
              <Select
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Spanish' },
                  { value: 'fr', label: 'French' },
                  { value: 'de', label: 'German' },
                ]}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} disabled={saving} onClick={() => void handleThemeSave()}>
                {saving ? 'Saving...' : 'Save Appearance'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <Card>
            <CardHeader title="API Keys" subtitle="Manage your API keys for external integrations" />
            <div className="mt-4 space-y-3">
              {apiKeys.map((key) => (
                <div key={key.name} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                  <div className="flex items-center gap-3">
                    <Key className="w-4 h-4 text-muted" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{key.name}</p>
                      <p className="text-xs text-muted font-mono">{key.masked_value}</p>
                    </div>
                  </div>
                  <Badge variant={key.status === 'Active' ? 'success' : 'secondary'} size="sm">{key.status}</Badge>
                </div>
              ))}
              <Button variant="secondary" size="sm" icon={<Key className="w-4 h-4" />} disabled={saving} onClick={() => void handleGenerateKey()}>
                Generate New Key
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Connected Services" subtitle="External services and databases" />
            <div className="mt-4 space-y-3">
              {services.map((service) => (
                <div key={service.name} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg bg-surface-elevated',
                      service.status === 'Connected' || service.status === 'Configured' ? 'text-success' : 'text-muted',
                    )}>
                      {service.name === 'Snowflake' ? <Database className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{service.name}</p>
                      <p className={cn('text-xs', service.status === 'Connected' || service.status === 'Configured' ? 'text-success' : 'text-muted')}>
                        {service.status}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={service.status === 'Connected' || service.status === 'Configured' ? 'secondary' : 'primary'}
                    disabled={saving}
                    onClick={() => void handleServiceAction(service.name)}
                  >
                    {service.status === 'Connected' || service.status === 'Configured' ? 'Configure' : 'Connect'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
