type AnalyticsValue = string | number | boolean;

declare global {
  interface Window {
    stallTrackEvent?: (
      eventName: string,
      params?: Record<string, AnalyticsValue>
    ) => void;
  }
}

export function trackStallEvent(
  eventName: string,
  params?: Record<string, AnalyticsValue>
): void {
  if (typeof window === 'undefined') return;
  window.stallTrackEvent?.(eventName, params);
}

export function trackStallEventOncePerSession(
  storageKey: string,
  eventName: string,
  params?: Record<string, AnalyticsValue>
): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Storage may be disabled; allow the event rather than failing app startup.
  }
  window.stallTrackEvent?.(eventName, params);
}
