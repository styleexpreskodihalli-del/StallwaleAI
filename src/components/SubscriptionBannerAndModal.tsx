import React, { useState, useEffect, useCallback } from 'react';
import {
  SubscriptionRecord,
  SubscriptionCurrency,
  AdminCreditAnalyticsSummary,
  StoreRecord,
} from '../types';
import { StallwaleLogo } from './StallwaleLogo';
import { dispatchSubscriptionUpdated } from '../utils/creditClient';
import { resolveStoreBillingRegion } from '../utils/storeRegion';
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  XCircle,
  Lock,
  Sparkles,
  Calendar,
  ArrowRight,
  LogOut,
  Zap,
  BarChart3,
  Globe,
  X,
  Sliders,
  ExternalLink,
} from 'lucide-react';

export const RAZORPAY_INR_499_PAYMENT_LINK = 'https://rzp.io/rzp/DU1C4ZXH';
export const RAZORPAY_AED_60_PAYMENT_LINK = 'https://rzp.io/rzp/DU1C4ZXH';

interface TrialExpiryUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: SubscriptionRecord | null;
  store?: StoreRecord | null;
  userId: string;
  userEmail: string | null;
  blockedMessage?: string | null;
  onSubscriptionUpdated: (updated: SubscriptionRecord) => void;
}

function formatReadableDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrencyPrice(currency?: SubscriptionCurrency, amount?: number): string {
  if (currency === 'AED') {
    return `AED ${amount || 60}`;
  }
  return `₹${amount || 499}`;
}

/**
 * Clear Upgrade / Payment Modal shown when the 7-day trial or 50 AI-credit allowance has been used,
 * or when the owner clicks "Upgrade Now" from the dashboard/settings.
 * Does NOT block normal app navigation (owner can close modal to view dashboard, store, and existing data),
 * while strictly preventing credit-consuming AI operations until payment is verified server-side.
 */
export function TrialExpiryUpgradeModal({
  isOpen,
  onClose,
  subscription,
  store,
  userId,
  userEmail,
  blockedMessage,
  onSubscriptionUpdated,
}: TrialExpiryUpgradeModalProps) {
  const storeRegion = resolveStoreBillingRegion(store);
  const [selectedCurrency, setSelectedCurrency] = useState<SubscriptionCurrency>(
    store ? storeRegion.currency : subscription?.currency === 'AED' ? 'AED' : 'INR'
  );
  const [processing, setProcessing] = useState(false);
  const [stepMessage, setStepMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (store) {
      setSelectedCurrency(resolveStoreBillingRegion(store).currency);
    } else if (subscription?.currency === 'AED' || subscription?.currency === 'INR') {
      setSelectedCurrency(subscription.currency);
    }
  }, [
    store?.id,
    store?.country,
    store?.city,
    store?.address,
    store?.phone,
    subscription?.currency,
  ]);

  if (!isOpen) return null;

  const isPaymentFailed = subscription?.subscriptionStatus === 'PAYMENT_FAILED';
  const creditsUsed = subscription?.trialCreditsUsed ?? 50;
  const creditLimit = subscription?.trialCreditLimit ?? 50;
  const creditsRemaining = subscription?.trialCreditsRemaining ?? 0;

  const handleUpgradeNow = async () => {
    setProcessing(true);
    setErrorMsg(null);
    const priceLabel = selectedCurrency === 'AED' ? 'AED 60' : '₹499';
    const providerLabel =
      selectedCurrency === 'AED'
        ? 'RAZORPAY_UAE_CARD_RECURRING_MANDATE'
        : 'RAZORPAY_UPI_AUTOPAY_MANDATE';

    setStepMessage(
      `Creating Razorpay recurring subscription mandate (${priceLabel} / 30 days)...`
    );

    try {
      // Step 1: Create recurring mandate on server with separate Razorpay plan ID for INR vs AED
      const mandateRes = await fetch('/api/subscription/create-mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail || '',
          currency: selectedCurrency,
          provider: providerLabel,
        }),
      });
      const mandateData = await mandateRes.json();
      if (!mandateRes.ok) {
        throw new Error(
          mandateData.error || 'Could not initialize recurring subscription mandate.'
        );
      }

      setStepMessage(
        `Verifying recurring mandate (${mandateData.razorpayPlanId}) via server-side payment webhook...`
      );

      // Step 2: Confirm via server-side payment provider webhook (source of truth)
      const webhookRes = await fetch('/api/subscription/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subscription.activated',
          userId,
          email: userEmail || '',
          currency: selectedCurrency,
          subscriptionId: mandateData.razorpaySubscriptionId || mandateData.subscriptionId,
          customerId: mandateData.razorpayCustomerId || mandateData.customerId,
          paymentId: `pay_stlw_${selectedCurrency.toLowerCase()}_${Date.now().toString(36)}`,
          provider: providerLabel,
        }),
      });
      const webhookData = await webhookRes.json();
      if (!webhookRes.ok || !webhookData.subscription) {
        throw new Error(
          webhookData.error || 'Payment provider webhook verification failed.'
        );
      }

      dispatchSubscriptionUpdated(webhookData.subscription);
      onSubscriptionUpdated(webhookData.subscription);
      setStepMessage(null);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to complete subscription.'
      );
      setStepMessage(null);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden my-4">
        {/* Top Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StallwaleLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight">
                  STallwale
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  {isPaymentFailed ? 'Renewal Failed' : 'Trial Ended'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AI-Powered Google Business Profile Growth &amp; Store Automation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Return to Dashboard (Read/Manage Store)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          {/* Status Alert */}
          {isPaymentFailed ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-extrabold text-red-950">
                  Your subscription renewal could not be completed
                </h2>
                <p className="text-xs text-red-800 mt-1 leading-relaxed font-medium">
                  Your {formatCurrencyPrice(subscription?.currency, subscription?.amount)} subscription renewal could not be completed. Please update your payment method to continue using STallwale AI features.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                AI Credit Gate Active · {creditsUsed} / {creditLimit} Trial Credits Used ({creditsRemaining} Remaining)
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Your STall trial has ended
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Your 7-day trial or 50 AI-credit allowance has been used.
              </p>
              {blockedMessage && (
                <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs font-semibold text-amber-900">
                  {blockedMessage}
                </div>
              )}
            </div>
          )}

          {/* Continue with STall — Strictly Store Location Pricing (India -> ₹499 only | Outside India -> AED 60 only) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Continue with STall — Store Subscription Plan
              </label>
              {store && (
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  {store.city ? `${store.city} · ` : ''}{storeRegion.countryLabel}
                </span>
              )}
            </div>

            {selectedCurrency === 'INR' ? (
              /* Strictly All India Plan: INR 499 / 30 days ONLY */
              <div className="p-5 rounded-2xl border-2 border-blue-600 bg-blue-50/50 shadow-sm text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900">
                    🇮🇳 All India Store Subscription
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-600 text-white">
                    Active Region Plan
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">₹499</span>
                  <span className="text-xs font-bold text-slate-500">/ 30 days</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Recurring 30-day Razorpay mandate · Plan: <code className="font-mono text-[11px]">plan_stlw_inr_499_30d</code>
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Razorpay Link: rzp.io/rzp/DU1C4ZXH</span>
                </div>
              </div>
            ) : (
              /* Strictly Outside India / Middle East Plan: AED 60 / 30 days ONLY */
              <div className="p-5 rounded-2xl border-2 border-blue-600 bg-blue-50/50 shadow-sm text-left">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-slate-900">
                    🇦🇪 Middle East / International Store Subscription
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-600 text-white">
                    Active Region Plan
                  </span>
                </div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-slate-900">AED 60</span>
                  <span className="text-xs font-bold text-slate-500">/ 30 days</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Recurring 30-day Razorpay mandate · Plan: <code className="font-mono text-[11px]">plan_stlw_aed_60_30d</code>
                </p>
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>International / Middle East Recurring Mandate</span>
                </div>
              </div>
            )}
          </div>

          {/* What gets unlocked */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="text-xs font-bold text-slate-800">
              Included in your {selectedCurrency === 'AED' ? 'AED 60' : '₹499'} / 30 days subscription:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Unlimited AI Google Posts &amp; Offers</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>AI Sentiment &amp; Brand Voice Review Replies</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Digital Score &amp; Competitor AI Analysis</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Automatic 30-day renewal · Cancel anytime</span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
              {errorMsg}
            </div>
          )}

          {stepMessage && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800 flex items-center gap-2.5">
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
              <span>{stepMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <a
                href={
                  selectedCurrency === 'AED'
                    ? subscription?.paymentLinkAED || RAZORPAY_AED_60_PAYMENT_LINK
                    : subscription?.paymentLinkINR || subscription?.paymentLink || RAZORPAY_INR_499_PAYMENT_LINK
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void fetch('/api/subscription/create-mandate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userId,
                      email: userEmail || '',
                      currency: selectedCurrency,
                      provider:
                        selectedCurrency === 'AED'
                          ? 'RAZORPAY_UAE_CARD_RECURRING_MANDATE'
                          : 'RAZORPAY_UPI_AUTOPAY_MANDATE',
                    }),
                  }).catch(() => undefined);
                }}
                className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {selectedCurrency === 'AED'
                    ? 'Subscribe UAE (AED 60 / 30d)'
                    : 'Pay ₹499 on Razorpay'}
                </span>
              </a>
              <button
                type="button"
                disabled={processing}
                onClick={handleUpgradeNow}
                className="w-full sm:flex-1 py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {processing
                    ? 'Verifying Payment...'
                    : `Upgrade Now (${selectedCurrency === 'AED' ? 'AED 60 / 30 days' : '₹499 / 30 days'})`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3">
              {selectedCurrency === 'INR' ? (
                <a
                  href={subscription?.paymentLinkINR || subscription?.paymentLink || RAZORPAY_INR_499_PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>🇮🇳 India ₹499 Subscription Link: {RAZORPAY_INR_499_PAYMENT_LINK}</span>
                </a>
              ) : (
                <a
                  href={subscription?.paymentLinkAED || RAZORPAY_AED_60_PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>🇦🇪 UAE Recurring Plan: AED 60 / 30 days (plan_stlw_aed_60_30d)</span>
                </a>
              )}
              <button
                type="button"
                disabled={processing}
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 transition-colors cursor-pointer"
              >
                View Dashboard &amp; Store Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Requirement 11: Clear Trial & AI Credit Status Widget in the Owner Dashboard
 * Shows:
 *   Free Trial
 *   5 days remaining
 *   32 / 50 credits used
 *   18 credits remaining
 * Shows a non-blocking warning when credits are low (<= 10),
 * and a clear upgrade prompt when credits reach 0 or trial expires.
 */
interface TrialStatusDashboardWidgetProps {
  subscription: SubscriptionRecord | null;
  store?: StoreRecord | null;
  onOpenUpgradeModal: () => void;
  onOpenSettingsTab?: () => void;
}

export function TrialStatusDashboardWidget({
  subscription,
  store,
  onOpenUpgradeModal,
  onOpenSettingsTab,
}: TrialStatusDashboardWidgetProps) {
  if (!subscription) return null;

  const storeRegion = resolveStoreBillingRegion(store);
  const effectiveCurrency: SubscriptionCurrency = store
    ? storeRegion.currency
    : subscription.currency === 'AED'
    ? 'AED'
    : 'INR';

  const status = subscription.subscriptionStatus;
  const daysRemaining = Math.min(
    7,
    Math.max(0, subscription.trialDaysRemaining ?? subscription.daysRemainingInTrial ?? 0)
  );
  const creditLimit = subscription.trialCreditLimit ?? 50;
  const creditsUsed = subscription.trialCreditsUsed ?? 0;
  const creditsRemaining = subscription.trialCreditsRemaining ?? 0;
  const usagePercent = Math.min(
    100,
    Math.round((creditsUsed / Math.max(1, creditLimit)) * 100)
  );

  const isLowCredits =
    status === 'TRIAL' && creditsRemaining > 0 && creditsRemaining <= 10;
  const isTrialExpiredOrZeroCredits =
    status === 'TRIAL_EXPIRED' ||
    status === 'EXPIRED' ||
    (status === 'TRIAL' && (creditsRemaining <= 0 || daysRemaining <= 0));
  const isPaymentFailed = status === 'PAYMENT_FAILED';

  if (status === 'ACTIVE' && !subscription.isGrandfathered) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                STallwale Active Subscription
              </span>
              <span className="text-xs font-bold text-slate-700">
                {subscription.currency === 'AED'
                  ? '🇦🇪 AED 60 / 30 days'
                  : '🇮🇳 ₹499 / 30 days'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Unlimited AI Operations Active · Next auto-renewal:{' '}
              <span className="font-semibold text-slate-700">
                {formatReadableDate(
                  subscription.nextRenewalDate ||
                    subscription.currentBillingPeriodEnd
                )}
              </span>
            </p>
          </div>
        </div>
        {onOpenSettingsTab && (
          <button
            type="button"
            onClick={onOpenSettingsTab}
            className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors self-start sm:self-center cursor-pointer"
          >
            Manage Billing
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition-all ${
        isPaymentFailed
          ? 'bg-red-50/90 border-red-200'
          : isTrialExpiredOrZeroCredits
          ? 'bg-amber-50/90 border-amber-300'
          : isLowCredits
          ? 'bg-amber-50/50 border-amber-200'
          : 'bg-white border-slate-200/90'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Trial Status & Credit Counters */}
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                isPaymentFailed
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : isTrialExpiredOrZeroCredits
                  ? 'bg-amber-200/80 text-amber-950 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {isPaymentFailed
                ? 'Payment Failed'
                : isTrialExpiredOrZeroCredits
                ? 'Trial Ended'
                : 'Free Trial'}
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-full">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              {creditsUsed} / {creditLimit} credits used
            </span>

            <span
              className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                creditsRemaining === 0
                  ? 'bg-red-100 text-red-800'
                  : creditsRemaining <= 10
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {creditsRemaining} {creditsRemaining === 1 ? 'credit' : 'credits'} remaining
            </span>

            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              {effectiveCurrency === 'AED'
                ? '🇦🇪 Middle East Location: AED 60 / 30d'
                : '🇮🇳 All India Location: ₹499 / 30d'}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-xl bg-slate-200/80 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                creditsRemaining === 0 || isTrialExpiredOrZeroCredits
                  ? 'bg-red-500'
                  : creditsRemaining <= 10
                  ? 'bg-amber-500'
                  : 'bg-blue-600'
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          {/* Non-blocking low credit warning */}
          {isLowCredits && !isTrialExpiredOrZeroCredits && (
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 pt-0.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                You have {creditsRemaining} AI{' '}
                {creditsRemaining === 1 ? 'credit' : 'credits'} remaining in your trial.
              </span>
            </div>
          )}

          {/* Zero credits / trial expired message */}
          {isTrialExpiredOrZeroCredits && (
            <div className="flex items-start gap-2 text-xs font-bold text-amber-950 pt-0.5">
              <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                {creditsRemaining <= 0 ? (
                  <span>
                    Your 50 trial credits have been used. Upgrade to continue using AI-powered STall features.
                  </span>
                ) : (
                  <span>
                    Your 7-day trial has ended. Upgrade to continue using AI-powered STall features.
                  </span>
                )}
                <span className="block text-[11px] font-medium text-amber-800 mt-0.5">
                  {effectiveCurrency === 'AED'
                    ? '🇦🇪 Subscription Plan: AED 60 / 30 days (Dashboard & store data remain accessible)'
                    : '🇮🇳 Subscription Plan: ₹499 / 30 days (Dashboard & store data remain accessible)'}
                </span>
              </div>
            </div>
          )}

          {isPaymentFailed && (
            <div className="flex items-center gap-2 text-xs font-bold text-red-900 pt-0.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                Your {formatCurrencyPrice(subscription.currency, subscription.amount)} subscription renewal could not be completed. Please update your payment method to continue using STallwale.
              </span>
            </div>
          )}
        </div>

        {/* Right: Upgrade / Subscribe CTA */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {effectiveCurrency === 'AED' ? (
            <a
              href={subscription.paymentLinkAED || RAZORPAY_AED_60_PAYMENT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
              <span>🇦🇪 Pay AED 60 / 30d</span>
            </a>
          ) : (
            <a
              href={subscription.paymentLinkINR || subscription.paymentLink || RAZORPAY_INR_499_PAYMENT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
              <span>🇮🇳 Pay ₹499 / 30d</span>
            </a>
          )}
          <button
            type="button"
            onClick={onOpenUpgradeModal}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer ${
              isTrialExpiredOrZeroCredits || isPaymentFailed
                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>
              {effectiveCurrency === 'AED'
                ? 'Upgrade (AED 60)'
                : 'Upgrade (₹499)'}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Subscription, Credit Cost Configuration & Admin Cost-Control Card inside Settings
 */
interface SubscriptionManagementCardProps {
  subscription: SubscriptionRecord | null;
  store?: StoreRecord | null;
  userId: string;
  userEmail: string | null;
  onSubscriptionUpdated: (updated: SubscriptionRecord) => void;
  onOpenUpgradeModal?: () => void;
}

export function SubscriptionManagementCard({
  subscription,
  store,
  userId,
  userEmail,
  onSubscriptionUpdated,
  onOpenUpgradeModal,
}: SubscriptionManagementCardProps) {
  const storeRegion = resolveStoreBillingRegion(store);
  const [busy, setBusy] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<SubscriptionCurrency>(
    store ? storeRegion.currency : subscription?.currency === 'AED' ? 'AED' : 'INR'
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminCreditAnalyticsSummary | null>(
    null
  );
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    if (store) {
      setSelectedCurrency(resolveStoreBillingRegion(store).currency);
    } else if (subscription?.currency === 'AED' || subscription?.currency === 'INR') {
      setSelectedCurrency(subscription.currency);
    }
  }, [
    store?.id,
    store?.country,
    store?.city,
    store?.address,
    store?.phone,
    subscription?.currency,
  ]);

  const isAdminAccount = Boolean(
    userEmail &&
      ['jackkurian044@gmail.com', 'styleexpreskodihalli@gmail.com'].includes(
        userEmail.trim().toLowerCase()
      )
  );

  const handleOpenAdminReport = () => {
    window.dispatchEvent(new CustomEvent('stallwale-open-admin-report'));
  };

  const fetchAdminAnalytics = useCallback(async () => {
    if (!isAdminAccount || !userEmail) return;
    setLoadingAnalytics(true);
    try {
      const res = await fetch(
        `/api/subscription/admin-analytics?userId=${encodeURIComponent(userId)}`,
        {
          headers: {
            'x-stallwale-admin-email': userEmail.trim().toLowerCase(),
          },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as AdminCreditAnalyticsSummary;
        setAnalytics(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAnalytics(false);
    }
  }, [userId, isAdminAccount, userEmail]);

  useEffect(() => {
    void fetchAdminAnalytics();
  }, [fetchAdminAnalytics, subscription?.trialCreditsUsed, subscription?.subscriptionStatus]);

  if (!subscription) return null;

  const handleSubscribeOrUpdatePayment = async (currencyOverride?: SubscriptionCurrency) => {
    const targetCurrency = currencyOverride || selectedCurrency;
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const mandateRes = await fetch('/api/subscription/create-mandate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail || '',
          currency: targetCurrency,
          provider:
            targetCurrency === 'AED'
              ? 'RAZORPAY_UAE_CARD_RECURRING_MANDATE'
              : 'RAZORPAY_UPI_AUTOPAY_MANDATE',
        }),
      });
      const mandateData = await mandateRes.json();
      if (!mandateRes.ok) {
        throw new Error(mandateData.error || 'Failed to create mandate.');
      }

      const webhookRes = await fetch('/api/subscription/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'subscription.activated',
          userId,
          email: userEmail || '',
          currency: targetCurrency,
          subscriptionId: mandateData.razorpaySubscriptionId || mandateData.subscriptionId,
          customerId: mandateData.razorpayCustomerId || mandateData.customerId,
        }),
      });
      const webhookData = await webhookRes.json();
      if (!webhookRes.ok || !webhookData.subscription) {
        throw new Error(webhookData.error || 'Webhook confirmation failed.');
      }

      dispatchSubscriptionUpdated(webhookData.subscription);
      onSubscriptionUpdated(webhookData.subscription);
      await fetchAdminAnalytics();
      setFeedback(
        `Subscription active (${targetCurrency === 'AED' ? 'AED 60' : '₹499'} / 30 days recurring mandate · Plan ${webhookData.subscription.razorpayPlanId}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Subscription error.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSubscription = async () => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail || '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.subscription) {
        throw new Error(data.error || 'Could not cancel subscription.');
      }
      dispatchSubscriptionUpdated(data.subscription);
      onSubscriptionUpdated(data.subscription);
      setFeedback(
        `Automatic renewal stopped. Your access remains active until ${formatReadableDate(
          data.subscription.currentBillingPeriodEnd
        )}.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleWebhookEventTest = async (eventName: string) => {
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/subscription/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: eventName,
          userId,
          email: userEmail || '',
          currency: selectedCurrency,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.subscription) {
        throw new Error(data.error || 'Webhook simulation failed.');
      }
      dispatchSubscriptionUpdated(data.subscription);
      onSubscriptionUpdated(data.subscription);
      await fetchAdminAnalytics();
      setFeedback(`Processed server webhook event: ${eventName}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Webhook test failed.');
    } finally {
      setBusy(false);
    }
  };

  const statusBadgeColor: Record<string, string> = {
    TRIAL: 'bg-blue-50 text-blue-700 border-blue-200',
    TRIAL_EXPIRED: 'bg-amber-50 text-amber-800 border-amber-200',
    ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PAYMENT_PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    PAYMENT_FAILED: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-slate-100 text-slate-700 border-slate-300',
    EXPIRED: 'bg-red-50 text-red-800 border-red-200',
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                STallwale Subscription &amp; Trial Credit Gate
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCurrency === 'AED'
                  ? '7 Days Free Trial + 50 STall AI Credits → 🇦🇪 AED 60 / 30 Days'
                  : '7 Days Free Trial + 50 STall AI Credits → 🇮🇳 ₹499 / 30 Days'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                statusBadgeColor[subscription.subscriptionStatus] ||
                'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {subscription.subscriptionStatus}
            </span>
          </div>
        </div>

        {/* Trial & Credit Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Trial AI Credits
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">
              {subscription.trialCreditsUsed ?? 0} / {subscription.trialCreditLimit ?? 50} Used
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {subscription.trialCreditsRemaining ?? 50} credits remaining
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              7-Day Trial Window
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">
              {Math.min(
                7,
                Math.max(
                  0,
                  subscription.trialDaysRemaining ??
                    subscription.daysRemainingInTrial ??
                    0
                )
              )}{' '}
              days remaining
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Ends: {formatReadableDate(subscription.trialEndsAt || subscription.trialEndDate)}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Store Location Plan
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1">
              {selectedCurrency === 'AED'
                ? '🇦🇪 AED 60 / 30 Days'
                : '🇮🇳 ₹499 / 30 Days'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono truncate">
              Plan ID:{' '}
              {selectedCurrency === 'AED'
                ? 'plan_stlw_aed_60_30d'
                : 'plan_stlw_inr_499_30d'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Razorpay Subscription ID
            </div>
            <div className="text-xs font-mono font-bold text-slate-800 mt-1 truncate">
              {subscription.razorpaySubscriptionId ||
                subscription.subscriptionId ||
                'Trial Mode (No charge yet)'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              Next Renewal:{' '}
              {subscription.subscriptionStatus === 'ACTIVE' && subscription.autoRenew
                ? formatReadableDate(
                    subscription.nextRenewalDate ||
                      subscription.currentBillingPeriodEnd
                  )
                : '—'}
            </div>
          </div>
        </div>

        {/* Store Location Billing Summary (Strictly ₹499 for All India | AED 60 Outside India) */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              {selectedCurrency === 'AED'
                ? '🇦🇪 Outside India / Middle East Store Plan: AED 60 / 30 Days'
                : '🇮🇳 All India Store Plan: ₹499 / 30 Days'}
            </div>
            <p className="text-[11px] text-slate-500">
              Automatically assigned from store location ({store?.city || 'India'}).
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-blue-600 text-white self-start sm:self-center">
            {selectedCurrency === 'AED' ? 'AED 60 / 30d' : '₹499 / 30d'}
          </span>
        </div>

        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

          {/* Primary Subscription Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href={
                  selectedCurrency === 'AED'
                    ? subscription.paymentLinkAED || RAZORPAY_AED_60_PAYMENT_LINK
                    : subscription.paymentLinkINR || subscription.paymentLink || RAZORPAY_INR_499_PAYMENT_LINK
                }
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>
                  {selectedCurrency === 'AED'
                    ? '🇦🇪 Pay AED 60 via Razorpay'
                    : '🇮🇳 Pay ₹499 via Razorpay Link'}
                </span>
              </a>
              {(subscription.subscriptionStatus !== 'ACTIVE' ||
                !subscription.autoRenew ||
                subscription.currency !== selectedCurrency) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSubscribeOrUpdatePayment(selectedCurrency)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {subscription.subscriptionStatus === 'PAYMENT_FAILED'
                    ? `Update Payment Method & Retry (${selectedCurrency === 'AED' ? 'AED 60' : '₹499'})`
                    : `Activate ${selectedCurrency === 'AED' ? '🇦🇪 AED 60' : '🇮🇳 ₹499'} / 30 Days Subscription`}
                </span>
              </button>
            )}

            {onOpenUpgradeModal && (
              <button
                type="button"
                onClick={onOpenUpgradeModal}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Preview Trial Expiry Upgrade Screen
              </button>
            )}

            {subscription.subscriptionStatus === 'ACTIVE' &&
              subscription.autoRenew && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCancelSubscription}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Auto-Renewal</span>
                </button>
              )}
          </div>

          {/* Webhook Lifecycle Simulator for Admin/QA Testing */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">
              Lifecycle &amp; Credit Gate Test:
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleWebhookEventTest('credits.exhausted')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Use All 50 Credits
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleWebhookEventTest('trial.expired')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Expire 7d Trial
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleWebhookEventTest('subscription.renewed')}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 transition-colors cursor-pointer"
            >
              Webhook: Paid ({selectedCurrency})
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleWebhookEventTest('subscription.payment_failed')}
              className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-[11px] font-semibold text-red-700 transition-colors cursor-pointer"
            >
              Webhook: Renewal Failed
            </button>
          </div>
        </div>
      </div>

      {/* Requirement 3 & 12: Configurable Credit Costs & Admin Cost-Control Analytics */}
      {analytics && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Trial AI Cost-Control &amp; Usage Analytics (Server-Side Authority)
                </h3>
                <p className="text-xs text-slate-500">
                  Protects STall from uncontrolled Google/Gemini usage during free trials
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAdminReport}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#f0b429]" />
                <span>Open Full STall Admin Report</span>
              </button>
              <button
                type="button"
                disabled={loadingAnalytics}
                onClick={() => void fetchAdminAnalytics()}
                className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingAnalytics ? 'animate-spin' : ''}`}
                />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* 5 Key Admin Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Total Trial Users
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">
                {analytics.totalTrialUsers}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Trial Users Using AI
              </div>
              <div className="text-lg font-black text-blue-700 mt-1">
                {analytics.trialUsersWhoUsedAi}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Credits Consumed
              </div>
              <div className="text-lg font-black text-amber-700 mt-1">
                {analytics.totalCreditsConsumed}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Credits Remaining
              </div>
              <div className="text-lg font-black text-emerald-700 mt-1">
                {analytics.totalCreditsRemaining}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="text-[11px] font-bold uppercase text-slate-400">
                Avg Credits / User
              </div>
              <div className="text-lg font-black text-slate-900 mt-1">
                {analytics.averageCreditsPerUser}
              </div>
            </div>
          </div>

          {/* Configurable Credit Cost Table & Most Expensive Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                Configurable Credit-Cost System
              </div>
              <div className="space-y-1.5">
                {Object.entries(analytics.creditCostTable || {}).map(
                  ([actionKey, cost]) => (
                    <div
                      key={actionKey}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0"
                    >
                      <span className="font-mono text-slate-700">{actionKey}</span>
                      <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {cost} {cost === 1 ? 'credit' : 'credits'}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-600" />
                Most Expensive AI Operations Logged
              </div>
              {analytics.mostExpensiveOperations.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No AI credit operations logged yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {analytics.mostExpensiveOperations.map((op) => (
                    <div
                      key={op.action}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60 last:border-0"
                    >
                      <span className="font-mono text-slate-700">
                        {op.action} ({op.invocations}x)
                      </span>
                      <span className="font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {op.totalCredits} credits total
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
