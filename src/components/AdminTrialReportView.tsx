import React, { useState, useEffect, useCallback } from 'react';
import {
  AdminDatePreset,
  AdminCreditFilterBucket,
  AdminTrialReportResponse,
  AdminTrialUserRow,
  AdminTrialStatusBadge,
} from '../types';
import {
  ShieldCheck,
  RefreshCw,
  Download,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Users,
  Zap,
  TrendingUp,
  Clock,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Sliders,
  BarChart3,
  ArrowDown,
  Lock,
  Cpu,
} from 'lucide-react';

interface AdminTrialReportViewProps {
  adminEmail: string;
}

interface UserUsageHistoryResponse {
  userId: string;
  email: string;
  storeName: string;
  creditsUsed: number;
  creditLimit: number;
  creditsRemaining: number;
  trialStatus: AdminTrialStatusBadge;
  events: Array<{
    id: string;
    timestamp: string;
    actionKey: string;
    actionLabel: string;
    creditsUsed: number;
    status: string;
    rawStatus: string;
    storeId: string;
    storeName: string;
  }>;
}

const DATE_PRESET_OPTIONS: Array<{ id: AdminDatePreset; label: string }> = [
  { id: 'TODAY', label: 'Today' },
  { id: 'YESTERDAY', label: 'Yesterday' },
  { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
  { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
  { id: 'THIS_MONTH', label: 'This Month' },
  { id: 'CUSTOM_RANGE', label: 'Custom Range' },
];

const CREDIT_BUCKET_OPTIONS: Array<{
  id: AdminCreditFilterBucket;
  label: string;
}> = [
  { id: 'ALL', label: 'All Credit Usage' },
  { id: 'USED_ANY', label: 'Used Credits (1+)' },
  { id: '0', label: '0 Credits (Never Used)' },
  { id: '1_10', label: '1–10 Credits' },
  { id: '11_25', label: '11–25 Credits' },
  { id: '26_49', label: '26–49 Credits' },
  { id: '50', label: '50 Credits (Exhausted)' },
];

const TRIAL_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All Trial Statuses' },
  { id: 'ACTIVE TRIAL', label: 'ACTIVE TRIAL' },
  { id: 'CREDITS EXHAUSTED', label: 'CREDITS EXHAUSTED' },
  { id: 'TRIAL EXPIRED', label: 'TRIAL EXPIRED' },
  { id: 'PAID', label: 'PAID' },
  { id: 'PAYMENT PENDING', label: 'PAYMENT PENDING' },
  { id: 'PAYMENT FAILED', label: 'PAYMENT FAILED' },
  { id: 'CANCELLED', label: 'CANCELLED' },
];

const SUBSCRIPTION_STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'ALL', label: 'All Subscription States' },
  { id: 'TRIAL', label: 'TRIAL' },
  { id: 'TRIAL_EXPIRED', label: 'TRIAL_EXPIRED' },
  { id: 'ACTIVE', label: 'ACTIVE' },
  { id: 'PAYMENT_PENDING', label: 'PAYMENT_PENDING' },
  { id: 'PAYMENT_FAILED', label: 'PAYMENT_FAILED' },
  { id: 'CANCELLED', label: 'CANCELLED' },
  { id: 'EXPIRED', label: 'EXPIRED' },
];

function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatLastActivityRelative(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24 && d.getUTCDate() === new Date().getUTCDate()) {
    return 'Today';
  }
  if (diffHours < 48) {
    return 'Yesterday';
  }
  return formatShortDate(iso);
}

function getTrialStatusBadgeClass(status: AdminTrialStatusBadge): string {
  switch (status) {
    case 'ACTIVE TRIAL':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'CREDITS EXHAUSTED':
      return 'bg-amber-50 text-amber-800 border-amber-300';
    case 'TRIAL EXPIRED':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'PAID':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'PAYMENT PENDING':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'PAYMENT FAILED':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'CANCELLED':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function AdminTrialReportView({ adminEmail }: AdminTrialReportViewProps) {
  const [preset, setPreset] = useState<AdminDatePreset>('LAST_30_DAYS');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [search, setSearch] = useState('');
  const [trialStatusFilter, setTrialStatusFilter] = useState('ALL');
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [creditBucketFilter, setCreditBucketFilter] =
    useState<AdminCreditFilterBucket>('ALL');
  const [includeAllAccounts, setIncludeAllAccounts] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  const [report, setReport] = useState<AdminTrialReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-user credit usage modal state
  const [selectedUser, setSelectedUser] = useState<AdminTrialUserRow | null>(
    null
  );
  const [userEventsData, setUserEventsData] =
    useState<UserUsageHistoryResponse | null>(null);
  const [loadingUserEvents, setLoadingUserEvents] = useState(false);

  // Configurable alert thresholds state
  const [editingAlerts, setEditingAlerts] = useState(false);
  const [highUsagePctInput, setHighUsagePctInput] = useState(80);
  const [unusualDailyInput, setUnusualDailyInput] = useState(25);
  const [savingAlerts, setSavingAlerts] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        preset,
        page: String(page),
        pageSize: String(pageSize),
        includeAllAccounts: String(includeAllAccounts),
      });
      if (preset === 'CUSTOM_RANGE') {
        qs.set('startDate', customStartDate);
        qs.set('endDate', customEndDate);
      }
      if (search.trim()) qs.set('search', search.trim());
      if (trialStatusFilter !== 'ALL') qs.set('trialStatus', trialStatusFilter);
      if (subscriptionStatusFilter !== 'ALL')
        qs.set('subscriptionStatus', subscriptionStatusFilter);
      if (countryFilter !== 'ALL') qs.set('country', countryFilter);
      if (creditBucketFilter !== 'ALL')
        qs.set('creditBucket', creditBucketFilter);

      const res = await fetch(`/api/admin/trial-report?${qs.toString()}`, {
        headers: {
          'x-stallwale-admin-email': adminEmail,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load Admin Trial Report.');
      }
      setReport(data as AdminTrialReportResponse);
      if (data.alerts?.config) {
        setHighUsagePctInput(data.alerts.config.highUsagePercentThreshold);
        setUnusualDailyInput(data.alerts.config.unusualDailyCreditsThreshold);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load Admin report.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    adminEmail,
    preset,
    customStartDate,
    customEndDate,
    search,
    trialStatusFilter,
    subscriptionStatusFilter,
    countryFilter,
    creditBucketFilter,
    page,
    pageSize,
    includeAllAccounts,
  ]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleOpenUserHistory = async (row: AdminTrialUserRow) => {
    setSelectedUser(row);
    setLoadingUserEvents(true);
    setUserEventsData(null);
    try {
      const qs = new URLSearchParams({ userId: row.userId });
      const res = await fetch(
        `/api/admin/trial-report/user-events?${qs.toString()}`,
        {
          headers: {
            'x-stallwale-admin-email': adminEmail,
          },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as UserUsageHistoryResponse;
        setUserEventsData(data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingUserEvents(false);
    }
  };

  const handleSaveAlertThresholds = async () => {
    setSavingAlerts(true);
    try {
      const res = await fetch('/api/admin/trial-report/alert-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-stallwale-admin-email': adminEmail,
        },
        body: JSON.stringify({
          highUsagePercentThreshold: Number(highUsagePctInput) || 80,
          unusualDailyCreditsThreshold: Number(unusualDailyInput) || 25,
        }),
      });
      if (res.ok) {
        setEditingAlerts(false);
        await fetchReport();
      }
    } finally {
      setSavingAlerts(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const qs = new URLSearchParams({
        preset,
        includeAllAccounts: String(includeAllAccounts),
      });
      if (preset === 'CUSTOM_RANGE') {
        qs.set('startDate', customStartDate);
        qs.set('endDate', customEndDate);
      }
      if (search.trim()) qs.set('search', search.trim());
      if (trialStatusFilter !== 'ALL') qs.set('trialStatus', trialStatusFilter);
      if (subscriptionStatusFilter !== 'ALL')
        qs.set('subscriptionStatus', subscriptionStatusFilter);
      if (countryFilter !== 'ALL') qs.set('country', countryFilter);
      if (creditBucketFilter !== 'ALL')
        qs.set('creditBucket', creditBucketFilter);

      const res = await fetch(
        `/api/admin/trial-report/export.csv?${qs.toString()}`,
        {
          headers: {
            'x-stallwale-admin-email': adminEmail,
          },
        }
      );
      if (!res.ok) return;
      const csvBlob = await res.blob();
      const url = URL.createObjectURL(csvBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stallwale-trial-credit-report-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore export error
    }
  };

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6 space-y-3">
        <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
          <Lock className="w-4 h-4" />
          <span>STall Admin Authorization Required</span>
        </div>
        <p className="text-xs text-slate-600">{error}</p>
      </div>
    );
  }

  const kpis = report?.kpis;

  return (
    <div className="space-y-6">
      {/* Top Admin Header + Date Filter Controls */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#f0b429]/20 border border-[#f0b429]/40 text-[#f8cf6b] text-[10px] font-extrabold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>STall Admin · Server-Side Source of Truth</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              TRIAL &amp; CREDIT USAGE REPORT
            </h1>
            <p className="text-xs text-slate-300">
              7-Day Free Trial + 50 AI Credit Gate performance, feature consumption, funnel, and paid conversions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() => void fetchReport()}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Requirement 2: Date Filters (Default: Last 30 Days) */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1.5">
              Date Range:
            </span>
            {DATE_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setPreset(opt.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  preset === opt.id
                    ? 'bg-[#f0b429] text-slate-950 shadow-sm'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {preset === 'CUSTOM_RANGE' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Requirement 1: 9 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            NEW TRIAL USERS
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.newTrialUsers.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Started 7-day / 50-credit trial
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            TRIAL USERS WHO USED CREDITS
          </div>
          <div className="text-2xl font-black text-blue-700 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.trialUsersWhoUsedCredits.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-blue-600 font-semibold mt-1">
            Consumed ≥ 1 AI credit
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            TRIAL USERS WHO NEVER USED CREDITS
          </div>
          <div className="text-2xl font-black text-slate-700 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.trialUsersWhoNeverUsedCredits.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            0 credits consumed
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            TOTAL CREDITS CONSUMED
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.totalCreditsConsumed.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1">
            Across trial accounts
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            AVERAGE CREDITS / USER
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.averageCreditsPerUser : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Out of 50 free trial credits
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            TRIALS EXHAUSTED
          </div>
          <div className="text-2xl font-black text-amber-800 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.trialsExhausted.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-amber-700 font-semibold mt-1">
            Reached 50 / 50 credit cap
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            TRIALS EXPIRED BY TIME
          </div>
          <div className="text-2xl font-black text-orange-700 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.trialsExpiredByTime.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Reached 7-day limit (&lt;50 credits)
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            PAID CONVERSIONS
          </div>
          <div className="text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1.5">
            {kpis ? kpis.paidConversions.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            Upgraded to ₹499 / AED 60
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
            CONVERSION RATE (TRIAL → PAID)
          </div>
          <div className="flex items-baseline gap-3 mt-1.5">
            <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums">
              {kpis ? `${kpis.conversionRatePercent}%` : '—'}
            </span>
            {kpis && (
              <span className="text-xs font-semibold text-slate-600">
                ({kpis.paidConversions} Paid / {kpis.totalEligibleTrials} Eligible Trials)
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap items-center gap-3">
            <span>
              Avg credits before conversion:{' '}
              <strong className="text-slate-900">
                {kpis ? kpis.averageCreditsBeforeConversion : 0}
              </strong>
            </span>
            <span>·</span>
            <span>
              Avg days before conversion:{' '}
              <strong className="text-slate-900">
                {kpis ? kpis.averageDaysBeforeConversion : 0}d
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Middle Row: 7. Trial Funnel + 6. Credit Usage By Feature */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requirement 7: Trial Funnel */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>TRIAL FUNNEL</span>
              </h2>
              <p className="text-xs text-slate-500">
                Progression from trial signup through credit milestones to paid subscription
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {(report?.funnel || []).map((stage, idx, arr) => (
              <React.Fragment key={stage.id}>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs font-extrabold text-slate-800">
                      <span>{stage.label}</span>
                      <span className="font-mono text-sm text-slate-900 tabular-nums">
                        {stage.count.toLocaleString()} users ({stage.percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 mt-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          stage.id === 'UPGRADED_TO_PAID'
                            ? 'bg-emerald-600'
                            : 'bg-blue-600'
                        }`}
                        style={{
                          width: `${Math.max(4, Math.min(100, stage.percentage))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {idx < arr.length - 1 && (
                  <div className="flex justify-center py-0.5 text-slate-400">
                    <ArrowDown className="w-4 h-4" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Requirement 6: Most-Used AI Features */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  <span>CREDIT USAGE BY FEATURE</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Where trial AI credits are consumed across Google/Gemini features
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {(report?.featureBreakdown || []).map((feat) => (
                <div
                  key={feat.featureKey}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">
                      {feat.featureLabel}
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-extrabold text-slate-900">
                        {feat.creditsConsumed.toLocaleString()} credits
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[11px]">
                        {feat.percentageOfTotal}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{
                        width: `${Math.max(
                          feat.creditsConsumed > 0 ? 4 : 0,
                          Math.min(100, feat.percentageOfTotal)
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {feat.eventCount.toLocaleString()} AI{' '}
                    {feat.eventCount === 1 ? 'invocation' : 'invocations'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Requirement 8: Conversion Metrics Summary Box */}
          {kpis && (
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                Conversion &amp; 50-Credit Trial Sizing Metrics
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200/80">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Conversion Formula
                  </div>
                  <div className="font-mono font-black text-emerald-700 text-sm mt-0.5">
                    {kpis.paidConversions} / {kpis.totalEligibleTrials} ({kpis.conversionRatePercent}%)
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200/80">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Avg Credits Before Paid
                  </div>
                  <div className="font-mono font-black text-slate-900 text-sm mt-0.5">
                    {kpis.averageCreditsBeforeConversion} credits
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200/80">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Avg Days Before Paid
                  </div>
                  <div className="font-mono font-black text-slate-900 text-sm mt-0.5">
                    {kpis.averageDaysBeforeConversion} days
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requirement 9: USAGE ALERTS + Requirement 10: COST-CONTROL VIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 9. Usage Alerts */}
        <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  USAGE ALERTS
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time credit consumption warnings &amp; threshold monitoring
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingAlerts(!editingAlerts)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configure Thresholds</span>
            </button>
          </div>

          {editingAlerts && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    High Credit Usage Warning (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={highUsagePctInput}
                    onChange={(e) =>
                      setHighUsagePctInput(Number(e.target.value))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Unusual 24h AI Credit Spike (Credits)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={unusualDailyInput}
                    onChange={(e) =>
                      setUnusualDailyInput(Number(e.target.value))
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingAlerts(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingAlerts}
                  onClick={handleSaveAlertThresholds}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  {savingAlerts ? 'Saving...' : 'Save Thresholds'}
                </button>
              </div>
            </div>
          )}

          {report?.alerts && (
            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950">
                  <strong>{report.alerts.highUsageUsersCount}</strong>{' '}
                  {report.alerts.highUsageUsersCount === 1 ? 'user has' : 'users have'} consumed &gt;
                  {report.alerts.config.highUsagePercentThreshold}% of trial credits
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-950 font-mono text-xs font-extrabold">
                  {report.alerts.highUsageUsersCount}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-red-50/80 border border-red-200 flex items-center justify-between">
                <span className="text-xs font-bold text-red-950">
                  <strong>{report.alerts.exhaustedAllCreditsCount}</strong>{' '}
                  {report.alerts.exhaustedAllCreditsCount === 1
                    ? 'user has'
                    : 'users have'}{' '}
                  consumed all 50 credits
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-red-200/80 text-red-950 font-mono text-xs font-extrabold">
                  {report.alerts.exhaustedAllCreditsCount}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200 flex items-center justify-between">
                <span className="text-xs font-bold text-orange-950">
                  <strong>{report.alerts.unusualHighAiUsageCount}</strong>{' '}
                  {report.alerts.unusualHighAiUsageCount === 1
                    ? 'user is'
                    : 'users are'}{' '}
                  generating unusually high AI usage (≥
                  {report.alerts.config.unusualDailyCreditsThreshold} credits / 24h)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-orange-200/80 text-orange-950 font-mono text-xs font-extrabold">
                  {report.alerts.unusualHighAiUsageCount}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 10. Cost-Control View */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-slate-700" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  AI USAGE &amp; COST-CONTROL VIEW
                </h2>
                <p className="text-xs text-slate-500">
                  Token &amp; Gemini API cost telemetry for trial accounts
                </p>
              </div>
            </div>
          </div>

          {report?.costControl && (
            <div className="space-y-3">
              {!report.costControl.costDataAvailable && (
                <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>
                    {report.costControl.message || 'Usage cost data unavailable'}
                  </span>
                  <span className="text-[11px] font-normal text-slate-500">
                    No invented token costs
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Total Trial AI Requests
                  </div>
                  <div className="text-base font-black text-slate-900 font-mono mt-1">
                    {report.costControl.totalTrialAiRequests.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Total Input Tokens
                  </div>
                  <div className="text-xs font-bold text-slate-600 font-mono mt-1">
                    {report.costControl.totalInputTokens !== null
                      ? report.costControl.totalInputTokens.toLocaleString()
                      : 'Usage cost data unavailable'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Total Output Tokens
                  </div>
                  <div className="text-xs font-bold text-slate-600 font-mono mt-1">
                    {report.costControl.totalOutputTokens !== null
                      ? report.costControl.totalOutputTokens.toLocaleString()
                      : 'Usage cost data unavailable'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Estimated AI Cost
                  </div>
                  <div className="text-xs font-bold text-slate-600 font-mono mt-1">
                    {report.costControl.estimatedAiCostUsd !== null
                      ? `$${report.costControl.estimatedAiCostUsd}`
                      : 'Usage cost data unavailable'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Est. Cost / Trial User
                  </div>
                  <div className="text-xs font-bold text-slate-600 font-mono mt-1">
                    {report.costControl.estimatedCostPerTrialUserUsd !== null
                      ? `$${report.costControl.estimatedCostPerTrialUserUsd}`
                      : 'Usage cost data unavailable'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Est. Cost / Converted Customer
                  </div>
                  <div className="text-xs font-bold text-slate-600 font-mono mt-1">
                    {report.costControl.estimatedCostPerConvertedCustomerUsd !==
                    null
                      ? `$${report.costControl.estimatedCostPerConvertedCustomerUsd}`
                      : 'Usage cost data unavailable'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Requirement 3, 4, 11, 12, 14: Search, Filtering & Paginated Trial User Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>RECENT TRIAL USERS &amp; CREDIT LEDGER</span>
            </h2>
            <p className="text-xs text-slate-500">
              Click any user row or &ldquo;View History&rdquo; to inspect their timestamped AI credit consumption log
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAllAccounts}
              onChange={(e) => {
                setIncludeAllAccounts(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-blue-600"
            />
            <span>Include Grandfathered Admin Accounts</span>
          </label>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search user, email, store, country..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-blue-600"
            />
          </div>

          <select
            value={trialStatusFilter}
            onChange={(e) => {
              setTrialStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            {TRIAL_STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={subscriptionStatusFilter}
            onChange={(e) => {
              setSubscriptionStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            {SUBSCRIPTION_STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={creditBucketFilter}
              onChange={(e) => {
                setCreditBucketFilter(e.target.value as AdminCreditFilterBucket);
                setPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              {CREDIT_BUCKET_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="ALL">All Countries</option>
              <option value="INDIA">India (₹499)</option>
              <option value="UAE">UAE / Middle East (AED 60)</option>
            </select>
          </div>
        </div>

        {/* Detailed Trial User Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                <th className="py-3 pr-3">User</th>
                <th className="py-3 px-3">Store</th>
                <th className="py-3 px-3">Country</th>
                <th className="py-3 px-3">Trial Started</th>
                <th className="py-3 px-3">Trial Ends</th>
                <th className="py-3 px-3 text-right">Credits Used</th>
                <th className="py-3 px-3 text-right">Credits Remaining</th>
                <th className="py-3 px-3">Trial Status</th>
                <th className="py-3 px-3">Subscription Status</th>
                <th className="py-3 px-3">Last Activity</th>
                <th className="py-3 px-3 text-center">Paid?</th>
                <th className="py-3 pl-3 text-right">Usage Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report?.users || []).length === 0 ? (
                <tr>
                  <td
                    colSpan={12}
                    className="py-8 text-center text-slate-500 font-medium"
                  >
                    No trial user records match the selected filters.
                  </td>
                </tr>
              ) : (
                (report?.users || []).map((row) => (
                  <tr
                    key={row.userId}
                    onClick={() => void handleOpenUserHistory(row)}
                    className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 pr-3">
                      <div className="font-bold text-slate-900">
                        {row.userName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[170px]">
                        {row.email}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-slate-800">
                      {row.storeName}
                    </td>
                    <td className="py-3.5 px-3 text-slate-700">
                      {row.country}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatShortDate(row.trialStartedAt)}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {formatShortDate(row.trialEndsAt)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {row.creditsUsed} / {row.creditLimit}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      {row.creditsRemaining}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getTrialStatusBadgeClass(
                          row.trialStatus
                        )}`}
                      >
                        {row.trialStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[11px] font-bold text-slate-700 whitespace-nowrap">
                      {row.subscriptionStatus}
                    </td>
                    <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">
                      {formatLastActivityRelative(row.lastActivityAt)}
                    </td>
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-[11px] font-extrabold ${
                          row.paid
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {row.paid ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenUserHistory(row);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 hover:border-blue-600 text-blue-600 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {report?.pagination && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div>
              Showing page{' '}
              <strong className="text-slate-900">
                {report.pagination.page}
              </strong>{' '}
              of{' '}
              <strong className="text-slate-900">
                {report.pagination.totalPages}
              </strong>{' '}
              ({report.pagination.totalMatchingUsers.toLocaleString()} total
              matching users)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={report.pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={
                  report.pagination.page >= report.pagination.totalPages
                }
                onClick={() =>
                  setPage((p) =>
                    Math.min(report.pagination.totalPages, p + 1)
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Requirement 5: Per-User Credit Usage History Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Credit Usage History — {selectedUser.userName}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getTrialStatusBadgeClass(
                      selectedUser.trialStatus
                    )}`}
                  >
                    {selectedUser.trialStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Store: <strong>{selectedUser.storeName}</strong> ·{' '}
                  {selectedUser.email} · Credits Used:{' '}
                  <strong className="font-mono text-slate-900">
                    {selectedUser.creditsUsed} / {selectedUser.creditLimit}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {loadingUserEvents ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  Loading user credit history...
                </div>
              ) : !userEventsData || userEventsData.events.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  No AI credit events recorded for this user yet (0 credits used).
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="py-2.5 pr-3">Timestamp</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3 text-right">Credits Used</th>
                      <th className="py-2.5 pl-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {userEventsData.events.map((ev) => (
                      <tr key={ev.id}>
                        <td className="py-3 pr-3 font-mono text-slate-600 whitespace-nowrap">
                          {formatDateTime(ev.timestamp)}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          {ev.actionLabel}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {ev.creditsUsed}{' '}
                          {ev.creditsUsed === 1 ? 'credit' : 'credits'}
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              ev.status === 'SUCCESS'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {ev.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
