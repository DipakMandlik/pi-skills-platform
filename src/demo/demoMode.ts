export function isDemoMode(): boolean {
  const value = String((import.meta as any).env?.VITE_DEMO_MODE ?? '').trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

export function demoLatencyMs(defaultMs = 150): number {
  const raw = String((import.meta as any).env?.VITE_DEMO_LATENCY_MS ?? '').trim();
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMs;
  return parsed;
}

export async function demoDelay(ms?: number): Promise<void> {
  const delayMs = ms ?? demoLatencyMs();
  if (!delayMs) return;
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), delayMs);
  });
}

