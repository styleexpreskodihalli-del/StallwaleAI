import { auth } from '../firebase';
import { SubscriptionRecord, CreditActionKey } from '../types';

export class CreditGateError extends Error {
  public status = 402;
  public errorCode: string;
  public subscription?: SubscriptionRecord;

  constructor(
    message: string,
    errorCode = 'TRIAL_EXPIRED',
    subscription?: SubscriptionRecord
  ) {
    super(message);
    this.name = 'CreditGateError';
    this.errorCode = errorCode;
    this.subscription = subscription;
  }
}

export function isCreditGateError(err: unknown): err is CreditGateError {
  return (
    err instanceof CreditGateError ||
    (typeof err === 'object' &&
      err !== null &&
      ((err as { name?: string }).name === 'CreditGateError' ||
        (err as { status?: number }).status === 402))
  );
}

export function dispatchSubscriptionUpdated(subscription: SubscriptionRecord) {
  if (typeof window !== 'undefined' && subscription) {
    window.dispatchEvent(
      new CustomEvent('stallwale-subscription-updated', {
        detail: { subscription },
      })
    );
  }
}

export function dispatchCreditGateBlocked(detail: {
  message: string;
  errorCode?: string;
  subscription?: SubscriptionRecord;
}) {
  if (typeof window !== 'undefined') {
    if (detail.subscription) {
      dispatchSubscriptionUpdated(detail.subscription);
    }
    window.dispatchEvent(
      new CustomEvent('stallwale-credit-gate-blocked', {
        detail,
      })
    );
  }
}

/**
 * Helper to call credit-consuming AI endpoints with automatic user context,
 * real-time credit counter synchronization, and strict 402 blocking when trial/credits expire.
 */
export async function callCreditGatedAiEndpoint<T = Record<string, unknown>>(
  endpoint: string,
  payload: Record<string, unknown>,
  options?: {
    storeId?: string;
    creditAction?: CreditActionKey;
  }
): Promise<T> {
  const currentUser = auth.currentUser;
  const userId = String(payload.userId || currentUser?.uid || '').trim();
  const userEmail = String(
    payload.userEmail || payload.email || currentUser?.email || ''
  ).trim();
  const storeId = String(
    options?.storeId || payload.storeId || 'default-store'
  ).trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (userId) headers['x-stallwale-user-id'] = userId;
  if (userEmail) headers['x-stallwale-user-email'] = userEmail;
  if (storeId) headers['x-stallwale-store-id'] = storeId;

  const bodyPayload: Record<string, unknown> = {
    ...payload,
    userId,
    userEmail,
    storeId,
  };
  if (options?.creditAction) {
    bodyPayload.creditAction = options.creditAction;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(bodyPayload),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (data.subscription && typeof data.subscription === 'object') {
    dispatchSubscriptionUpdated(data.subscription as SubscriptionRecord);
  }

  if (res.status === 402) {
    const errMsg = String(
      data.error ||
        'Your 7-day trial or 50 AI-credit allowance has been used. Upgrade to continue using AI-powered STall features.'
    );
    const errCode = String(data.errorCode || 'TRIAL_EXPIRED');
    const sub = data.subscription as SubscriptionRecord | undefined;
    dispatchCreditGateBlocked({
      message: errMsg,
      errorCode: errCode,
      subscription: sub,
    });
    throw new CreditGateError(errMsg, errCode, sub);
  }

  if (!res.ok) {
    throw new Error(String(data.error || `AI request failed (${res.status})`));
  }

  return data as T;
}
