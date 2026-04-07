export function normalizeErrorMessage(status: number, fallback: string): string {
  if (status === 0) {
    const low = fallback.toLowerCase();
    if (low.includes('timed out') || low.includes('timeout')) {
      return 'Request timed out. Please try again.';
    }
    return 'Unable to reach the service. Check network or server status, then retry.';
  }
  if (status === 401) {
    return 'Session expired. Please sign in again.';
  }
  if (status === 403) {
    return 'You do not have permission to access this resource.';
  }
  return fallback;
}

export function getUserFacingError(err: unknown, fallback = 'Request failed'): string {
  if (err && typeof err === 'object') {
    const maybeStatus = (err as { status?: unknown }).status;
    const maybeMessage = (err as { message?: unknown }).message;
    if (typeof maybeStatus === 'number') {
      return normalizeErrorMessage(
        maybeStatus,
        typeof maybeMessage === 'string' && maybeMessage.trim() ? maybeMessage : fallback,
      );
    }
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return fallback;
}
