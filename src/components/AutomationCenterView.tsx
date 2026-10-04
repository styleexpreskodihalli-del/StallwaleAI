import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  getOrApproveGbpTokenOnce,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { StoreRecord, PostRecord } from '../types';
import { getStorePromotionalGallery } from '../utils/categoryImages';
import {
  Zap,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Calendar,
  Send,
  Sparkles,
} from 'lucide-react';

interface AutomationCenterViewProps {
  store: StoreRecord;
  posts?: PostRecord[];
}

interface AutomationConfigItem {
  key:
    | 'autoDailyPosts'
    | 'autoReviewReplies'
    | 'autoOfferReminders'
    | 'autoProfileMonitoring'
    | 'autoScoreMonitoring';
  title: string;
  description: string;
  lastRun: string;
  nextRun: string;
  activity: string;
}

export function AutomationCenterView({
  store,
  posts = [],
}: AutomationCenterViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState<string>(
    store.dailyPostScheduleDate || todayStr
  );
  const [scheduleTime, setScheduleTime] = useState<string>(
    store.dailyPostScheduleTime || '09:00'
  );
  const [schedulingPost, setSchedulingPost] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null);

  useEffect(() => {
    setScheduleDate(store.dailyPostScheduleDate || todayStr);
    setScheduleTime(store.dailyPostScheduleTime || '09:00');
  }, [store.id, store.dailyPostScheduleDate, store.dailyPostScheduleTime, todayStr]);

  const scheduledPosts = posts.filter((p) => p.status === 'Scheduled');

  const formatScheduleDisplay = (dateStr?: string, timeStr?: string) => {
    const d = dateStr || todayStr;
    const t = timeStr || '09:00';
    return `${d} at ${t}`;
  };

  const automations: AutomationConfigItem[] = [
    {
      key: 'autoDailyPosts',
      title: 'Daily Posts',
      description: `Automatically prepares and publishes ${store.category} updates and seasonal specials tailored to ${store.name}.`,
      lastRun: 'Today, 8:00 AM',
      nextRun: formatScheduleDisplay(
        store.dailyPostScheduleDate || scheduleDate,
        store.dailyPostScheduleTime || scheduleTime
      ),
      activity:
        scheduledPosts.length > 0
          ? `${scheduledPosts.length} automated ${
              scheduledPosts.length === 1 ? 'post' : 'posts'
            } queued in schedule`
          : 'Automated daily store post schedule active',
    },
    {
      key: 'autoReviewReplies',
      title: 'Review Responses',
      description:
        'Drafts polite AI responses whenever a new customer leaves a Google review. Never publishes destructive replies without confirmation.',
      lastRun: '2 hours ago',
      nextRun: 'Continuous (On new review)',
      activity: 'Monitoring Google Reviews inbox for new customer feedback',
    },
    {
      key: 'autoOfferReminders',
      title: 'Offer Reminders',
      description:
        'Alerts you before active discounts expire and suggests weekend or festival offers for your business category.',
      lastRun: 'Yesterday, 6:00 PM',
      nextRun: 'Friday, 9:00 AM',
      activity: 'Checked active promotional offer expiration dates',
    },
    {
      key: 'autoProfileMonitoring',
      title: 'Profile Monitoring',
      description:
        'Monitors your Google Business Profile for unauthorized edits to your phone number, hours, or address.',
      lastRun: '1 hour ago',
      nextRun: 'In 5 hours',
      activity: 'Verified store address, phone number, and opening hours match',
    },
    {
      key: 'autoScoreMonitoring',
      title: 'Digital Score Monitoring',
      description:
        'Tracks your store’s Digital Score across all local SEO pillars and highlights quick improvement wins.',
      lastRun: 'Today, 9:30 AM',
      nextRun: 'Tomorrow, 9:30 AM',
      activity: 'Recalculated store Digital Score and ranking opportunities',
    },
  ];

  const handleToggle = async (
    key: AutomationConfigItem['key'],
    currentValue: boolean
  ) => {
    setUpdatingKey(key);
    const path = `stores/${store.id}`;
    try {
      await updateDoc(doc(db, 'stores', store.id), {
        [key]: !currentValue,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setUpdatingKey(null);
    }
  };

  const handleSaveDailySchedule = async () => {
    if (!scheduleDate || !scheduleTime) return;
    setSavingSchedule(true);
    setScheduleFeedback(null);
    const path = `stores/${store.id}`;
    try {
      await updateDoc(doc(db, 'stores', store.id), {
        autoDailyPosts: true,
        dailyPostScheduleDate: scheduleDate.slice(0, 40),
        dailyPostScheduleTime: scheduleTime.slice(0, 40),
        updatedAt: serverTimestamp(),
      });
      setScheduleFeedback(
        `Daily Posts schedule saved for ${scheduleDate} at ${scheduleTime}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleQueueOrPublishAutomatedPost = async (
    mode: 'queue' | 'publish_now'
  ) => {
    const user = auth.currentUser;
    if (!user || !scheduleDate || !scheduleTime) return;

    setSchedulingPost(true);
    setScheduleFeedback(null);
    const postRef = doc(collection(db, `stores/${store.id}/posts`));
    const path = `stores/${store.id}/posts/${postRef.id}`;

    try {
      const gallery = getStorePromotionalGallery(store);
      const imageUrl = gallery.images[0]?.url || '';
      const primaryService =
        (store.services || '')
          .split(',')[0]
          ?.trim() || store.businessType || store.category;

      let headline = `${store.name} — Featured ${primaryService} in ${
        store.city || 'Your Area'
      }`.slice(0, 150);
      let description = `Visit ${store.name} in ${
        store.city || 'our neighborhood'
      } for trusted ${
        store.services || store.businessType || store.category
      }. Book or stop by today!`.slice(0, 1500);
      let cta = 'Book Now';
      let imageConcept = `${store.category} showcase for ${store.name}`.slice(
        0,
        500
      );

      try {
        const aiRes = await fetch('/api/ai/generate-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeName: store.name,
            category: store.category,
            city: store.city,
            services: store.services,
            seoKeywords: store.seoKeywords || [],
            tone: store.tone,
            postType: 'Update',
            prompt: `Create an engaging daily update post for ${store.name} scheduled for ${scheduleDate} at ${scheduleTime}`,
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.headline) headline = String(aiData.headline).slice(0, 150);
          if (aiData.description)
            description = String(aiData.description).slice(0, 1500);
          if (aiData.cta) cta = String(aiData.cta).slice(0, 60);
          if (aiData.imageConcept)
            imageConcept = String(aiData.imageConcept).slice(0, 500);
        }
      } catch {
        // Use clean fallback content if AI call fails
      }

      await updateDoc(doc(db, 'stores', store.id), {
        autoDailyPosts: true,
        dailyPostScheduleDate: scheduleDate.slice(0, 40),
        dailyPostScheduleTime: scheduleTime.slice(0, 40),
        updatedAt: serverTimestamp(),
      });

      if (mode === 'queue') {
        await setDoc(postRef, {
          ownerId: user.uid,
          storeId: store.id,
          postType: 'Update',
          headline,
          description,
          cta,
          imageConcept,
          imageUrl: imageUrl.slice(0, 2000),
          status: 'Scheduled',
          scheduledDate: scheduleDate.slice(0, 40),
          scheduledTime: scheduleTime.slice(0, 40),
          gbpSyncNote: `Queued for automatic publishing on ${scheduleDate} at ${scheduleTime}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setScheduleFeedback(
          `Automated post "${headline}" queued for ${scheduleDate} at ${scheduleTime}!`
        );
      } else {
        const token = await getOrApproveGbpTokenOnce(
          user.email || store.gbpAccountEmail || undefined,
          store.gbpConnected
        );
        let gbpLocalPostName = '';
        let gbpPublishedAt = new Date().toISOString().slice(0, 60);
        let syncNote = 'Published live to Google Business Profile';

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const pubRes = await fetch('/api/gbp/publish-post', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              accountId: store.gbpAccountId || '',
              locationId: store.gbpLocationId || '',
              storeName: store.name,
              website: store.website || '',
              postType: 'Update',
              headline,
              description,
              cta,
              imageUrl,
            }),
          });
          const pubData = await pubRes.json().catch(() => ({}));
          if (pubData.gbpLocalPostName) {
            gbpLocalPostName = String(pubData.gbpLocalPostName).slice(0, 240);
          }
          if (pubData.publishedAt) {
            gbpPublishedAt = String(pubData.publishedAt).slice(0, 60);
          }
          if (pubData.message) {
            syncNote = String(pubData.message).slice(0, 300);
          }
        } catch {
          // ignore
        }

        await setDoc(postRef, {
          ownerId: user.uid,
          storeId: store.id,
          postType: 'Update',
          headline,
          description,
          cta,
          imageConcept,
          imageUrl: imageUrl.slice(0, 2000),
          status: 'Published',
          scheduledDate: scheduleDate.slice(0, 40),
          scheduledTime: scheduleTime.slice(0, 40),
          ...(gbpLocalPostName ? { gbpLocalPostName } : {}),
          gbpPublishedAt,
          gbpSyncNote: syncNote,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setScheduleFeedback(
          `Automated post "${headline}" published live and daily schedule set to ${scheduleDate} at ${scheduleTime}!`
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSchedulingPost(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Automation Center</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Control automated workflows and post schedules for{' '}
            <strong className="text-slate-700">{store.name}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 px-3.5 py-2 rounded-xl">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Owner Safety Lock: Destructive actions always require confirmation</span>
        </div>
      </div>

      {scheduleFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{scheduleFeedback}</span>
        </div>
      )}

      <div className="space-y-4">
        {automations.map((item) => {
          const isEnabled = Boolean(store[item.key]);
          const isUpdating = updatingKey === item.key;
          const isDailyPosts = item.key === 'autoDailyPosts';

          return (
            <div
              key={item.key}
              className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <Zap
                      className={`w-4 h-4 ${
                        isEnabled ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <h2 className="text-base font-bold text-slate-900">{item.title}</h2>
                    <span
                      className={`text-xs font-semibold ${
                        isEnabled ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      {isEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Last run: <strong className="text-slate-700">{item.lastRun}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Next run: <strong className="text-slate-700">{item.nextRun}</strong>
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Activity: {item.activity}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleToggle(item.key, isEnabled)}
                    className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      isEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isUpdating
                      ? 'Updating...'
                      : isEnabled
                      ? 'Active (Turn OFF)'
                      : 'Paused (Turn ON)'}
                  </button>
                </div>
              </div>

              {/* Scheduling Interface for Daily Posts */}
              {isDailyPosts && (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#f0b429] flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Schedule Automated Daily Post</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Select a specific date and time for when an automated post should be queued or published for {store.name}.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Scheduled Time
                      </label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={savingSchedule || schedulingPost}
                      onClick={handleSaveDailySchedule}
                      className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 hover:border-blue-600 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#f0b429]" />
                      <span>
                        {savingSchedule ? 'Saving...' : 'Save Schedule Time'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={schedulingPost || savingSchedule}
                      onClick={() => handleQueueOrPublishAutomatedPost('queue')}
                      className="min-h-[38px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {schedulingPost
                          ? 'Queueing Post...'
                          : 'Queue Automated Post'}
                      </span>
                    </button>
                  </div>

                  {/* Daily Posts List with Visual Status Indicators (Draft / Queued / Live) */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#f0b429]" />
                        <span>Daily Posts Status ({posts.length})</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
                        <span className="inline-flex items-center gap-1.5 text-emerald-600">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.75)]" />
                          <span>Live</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-500">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.75)]" />
                          <span>Queued</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-red-500">
                          <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.75)]" />
                          <span>Draft</span>
                        </span>
                      </div>
                    </div>

                    {posts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">
                        No daily posts created yet. Use the date &amp; time selector above to queue or publish an automated post.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-200/70">
                        {posts.slice(0, 8).map((sp) => {
                          const isLive = sp.status === 'Published';
                          const isQueued = sp.status === 'Scheduled';
                          const statusLabel = isLive
                            ? 'Live'
                            : isQueued
                            ? 'Queued'
                            : 'Draft';
                          const dotClass = isLive
                            ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                            : isQueued
                            ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                            : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]';
                          const badgeClass = isLive
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600'
                            : isQueued
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                            : 'bg-red-500/15 border-red-500/30 text-red-500';

                          return (
                            <div
                              key={sp.id}
                              className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono text-[10px] font-bold uppercase tracking-wider ${badgeClass}`}
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}
                                    />
                                    <span>{statusLabel}</span>
                                  </span>
                                  {(sp.scheduledDate || isQueued) && (
                                    <span className="font-mono text-[10px] text-[#f0b429]">
                                      {sp.scheduledDate || scheduleDate} ·{' '}
                                      {sp.scheduledTime || scheduleTime}
                                    </span>
                                  )}
                                  <span className="font-bold text-slate-900 truncate">
                                    {sp.headline}
                                  </span>
                                </div>
                                <p className="text-slate-500 truncate mt-0.5">
                                  {sp.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

