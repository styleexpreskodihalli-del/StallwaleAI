import React, { useState } from 'react';
import {
  StoreRecord,
  PostRecord,
  OfferRecord,
  ReviewRecord,
  WorkspaceTab,
} from '../types';
import { calculateDigitalScore } from '../scoreUtils';
import { handleFirestoreError, OperationType } from '../firebase';
import {
  runFullStoreAutoImprovement,
  buildDailyActivitiesReport,
  AutoImproveProgress,
  AutoImproveResult,
} from '../utils/autoImproveEngine';
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Gauge,
  Sparkles,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';

interface DigitalScoreViewProps {
  store: StoreRecord;
  posts: PostRecord[];
  offers: OfferRecord[];
  reviews: ReviewRecord[];
  onNavigate: (tab: WorkspaceTab) => void;
}

export function DigitalScoreView({
  store,
  posts,
  offers,
  reviews,
  onNavigate,
}: DigitalScoreViewProps) {
  const [autoImproving, setAutoImproving] = useState(false);
  const [autoProgress, setAutoProgress] = useState<AutoImproveProgress | null>(
    null
  );
  const [autoResult, setAutoResult] = useState<AutoImproveResult | null>(null);

  const summary = calculateDigitalScore(store, posts, offers, reviews);
  const dailyReport = buildDailyActivitiesReport(store, posts, offers, reviews);

  const handleRunAutoImprove = async () => {
    if (autoImproving) return;
    setAutoImproving(true);
    setAutoResult(null);
    try {
      const res = await runFullStoreAutoImprovement({
        store,
        posts,
        offers,
        reviews,
        onProgress: (prog) => setAutoProgress(prog),
      });
      setAutoResult(res);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${store.id}`);
    } finally {
      setAutoImproving(false);
      setAutoProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Digital Score &amp; Autopilot Progress
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            One-click automated Google Business growth and daily progress tracker for{' '}
            <strong className="text-slate-700">{store.name}</strong>
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-emerald-700">
          <TrendingUp className="w-4 h-4" />
          <span>
            Progress Made: {dailyReport.baselineScore} → {summary.overallScore}/100 (+
            {dailyReport.pointsGainedSoFar} pts)
          </span>
        </div>
      </div>

      {/* Overall Score Hero Card with 1-Click Auto-Improve */}
      <div className="bg-white rounded-2xl border-2 border-[#f0b429] p-6 sm:p-8 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-blue-600 text-white flex flex-col items-center justify-center shrink-0">
              <span className="text-3xl font-bold font-mono tabular-nums">
                {summary.overallScore}
              </span>
              <span className="text-xs text-blue-100">out of 100</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Gauge className="w-4 h-4 text-blue-600" />
                <span>Overall Digital Score</span>
                <span aria-hidden="true">·</span>
                <span>
                  Daily Work Done: {dailyReport.completedCount}/
                  {dailyReport.totalChecklistCount} ({dailyReport.completionPercentage}%)
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {summary.overallScore >= 95
                  ? '100% Optimized — Running on Full Daily Autopilot'
                  : summary.overallScore >= 75
                  ? 'Strong Momentum — Click Below to Auto-Complete Remaining Pillars'
                  : 'Ready for 1-Click Automatic Score Boost'}
              </h2>
              <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                No manual work needed from you. Click{' '}
                <strong>Improve Score Automatically</strong> and STallwale will sync your Google Business Profile, publish SEO posts &amp; offers, reply to pending customer reviews, and turn on all 5 daily automations automatically.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={autoImproving}
            onClick={handleRunAutoImprove}
            className="px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 self-start md:self-auto transition-colors cursor-pointer whitespace-nowrap disabled:opacity-70"
          >
            {autoImproving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Auto-Completing Work...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {summary.overallScore < 100
                    ? 'Improve Score Automatically'
                    : 'Run Daily Autopilot Refresh'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Live Autopilot Step Progress */}
        {autoImproving && autoProgress && (
          <div className="p-4 rounded-xl bg-slate-900 border border-[#f0b429] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#f0b429] flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Step {autoProgress.stepIndex} of {autoProgress.totalSteps}:{' '}
                  {autoProgress.stepTitle}
                </span>
              </span>
              <span className="font-mono font-bold text-[#f8cf6b]">
                {Math.round(
                  (autoProgress.stepIndex / autoProgress.totalSteps) * 100
                )}
                %
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#f0b429] rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(
                    (autoProgress.stepIndex / autoProgress.totalSteps) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-slate-300">{autoProgress.detail}</p>
          </div>
        )}

        {autoResult && !autoImproving && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                All store tasks completed automatically! Score improved from{' '}
                {autoResult.previousScore}/100 to {summary.overallScore}/100.
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-700">
              {autoResult.actionsCompleted.map((act, idx) => (
                <li key={idx} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 7-Pillar Detailed Breakdown with Auto-Complete Action */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {summary.pillars.map((pillar) => {
          const isHealthy = pillar.percentage >= 85;
          return (
            <div
              key={pillar.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isHealthy ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <h3 className="text-base font-bold text-slate-900">
                      {pillar.label}
                    </h3>
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {pillar.score} / {pillar.maxScore} pts
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isHealthy
                        ? 'bg-emerald-600'
                        : pillar.percentage >= 50
                        ? 'bg-blue-600'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${pillar.percentage}%` }}
                  />
                </div>

                <div className="space-y-1 pt-1 text-xs">
                  <p className="font-semibold text-slate-800">
                    Current Status:{' '}
                    <span className="font-normal text-slate-600">
                      {pillar.statusText}
                    </span>
                  </p>
                  <p className="font-semibold text-slate-800">
                    Progress Detail:{' '}
                    <span className="font-normal text-slate-600">
                      {pillar.missingText}
                    </span>
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  {pillar.percentage === 100
                    ? '100% Completed Automatically'
                    : `Auto-Action: ${pillar.recommendedAction}`}
                </span>
                <div className="flex items-center gap-2">
                  {pillar.percentage < 100 && (
                    <button
                      type="button"
                      disabled={autoImproving}
                      onClick={handleRunAutoImprove}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Auto-Fix Now</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate(pillar.targetTab)}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>View</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
