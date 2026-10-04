import React, { useState, useEffect, useRef } from 'react';
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
  hasOneTimePublishingApproval,
  setOneTimePublishingApproval,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { StoreRecord, ReviewRecord, ReviewSentiment } from '../types';
import { getStoreGbpRating, analyzeReviewSentiment } from '../scoreUtils';
import {
  callCreditGatedAiEndpoint,
  isCreditGateError,
} from '../utils/creditClient';
import {
  Star,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Globe,
  Send,
  Plus,
  MessageSquare,
  Zap,
  TrendingUp,
} from 'lucide-react';

interface ReviewsViewProps {
  store: StoreRecord;
  reviews: ReviewRecord[];
}

interface BrandVoicePresetOption {
  id: string;
  name: string;
  tagline: string;
  positiveTemplate: string;
  neutralTemplate: string;
  negativeTemplate: string;
  signOff: string;
}

const BRAND_VOICE_PRESETS: BrandVoicePresetOption[] = [
  {
    id: 'Warm & Welcoming Local Host',
    name: 'Warm & Welcoming Local Host',
    tagline: 'Personal, neighborly gratitude tailored for local customers',
    positiveTemplate:
      'Thank {customerName} warmly by name for visiting {storeName} in {city}. Express genuine joy that they loved our {service} and invite them back soon!',
    neutralTemplate:
      'Thank {customerName} for visiting {storeName} and sharing honest feedback. Highlight our commitment to great {service} in {city} and promise a 5-star experience next time.',
    negativeTemplate:
      'Apologize sincerely and empathetically to {customerName} without being defensive. Assure them that {storeName} takes their feedback seriously and invite them to contact us directly so we can make things right.',
    signOff: 'Warm regards, Team {storeName}',
  },
  {
    id: 'Professional & Courteous',
    name: 'Professional & Courteous',
    tagline: 'Polished, trustworthy & quality-focused management voice',
    positiveTemplate:
      'Thank {customerName} courteously for their 5-star review of {storeName} in {city}. Reinforce our professional standards in {service} and welcome their next visit.',
    neutralTemplate:
      'Appreciate {customerName} for taking the time to review {storeName}. Note that we continuously refine our {service} in {city} and value their constructive input.',
    negativeTemplate:
      'Extend a formal, accountable apology to {customerName}. Emphasize {storeName}’s quality standards in {city} and request a direct conversation with management to resolve the issue promptly.',
    signOff: 'Sincerely, Management at {storeName}',
  },
  {
    id: 'Energetic & Grateful',
    name: 'Energetic & Grateful',
    tagline: 'Upbeat, community-driven & celebratory brand tone',
    positiveTemplate:
      'Celebrate {customerName}’s awesome feedback with high energy! Thank them for choosing {storeName} in {city} for {service} and let them know we can’t wait to see them again!',
    neutralTemplate:
      'Thank {customerName} for stopping by {storeName} in {city}! Let them know we love hearing how we can make our {service} even better on their next visit.',
    negativeTemplate:
      'Thank {customerName} for speaking up and apologize that we missed the mark. Let them know the {storeName} team in {city} wants to turn this around right away—reach out to us directly!',
    signOff: 'Cheers, The {storeName} Crew',
  },
  {
    id: 'Luxury & Boutique Concierge',
    name: 'Luxury & Boutique Concierge',
    tagline: 'Refined, bespoke & white-glove guest relations',
    positiveTemplate:
      'Express refined gratitude to {customerName} for their gracious words about {storeName} in {city}. It was a privilege delivering a bespoke {service} experience.',
    neutralTemplate:
      'Thank {customerName} for sharing their perspective on {storeName}. Every detail of our {service} in {city} matters to us, and we look forward to exceeding expectations on their return.',
    negativeTemplate:
      'Offer a gracious, white-glove apology to {customerName}. At {storeName} in {city}, guest satisfaction is paramount—invite them to connect privately with our concierge team so we may personally restore their confidence.',
    signOff: 'With appreciation, {storeName} Concierge',
  },
];

export function ReviewsView({ store, reviews }: ReviewsViewProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'replied'>('all');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | ReviewSentiment>('all');
  const [draftReplies, setDraftReplies] = useState<Record<string, string>>({});
  const [seoKeywordsMap, setSeoKeywordsMap] = useState<Record<string, string[]>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);
  const [syncingLiveGbpReviews, setSyncingLiveGbpReviews] = useState(false);
  const [agentStatusBanner, setAgentStatusBanner] = useState<string | null>(null);
  const [gbpWarningBanner, setGbpWarningBanner] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [oneTimeApproved, setOneTimeApproved] = useState<boolean>(() =>
    hasOneTimePublishingApproval()
  );

  useEffect(() => {
    if (
      store.gbpConnected ||
      reviews.some((r) => r.responseStatus === 'Replied') ||
      hasOneTimePublishingApproval()
    ) {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
    }
  }, [store.gbpConnected, reviews]);

  // Add simulated customer review form (for store testing / manual log)
  const [newCustomer, setNewCustomer] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [newReviewText, setNewReviewText] = useState('');
  const [addingReview, setAddingReview] = useState(false);

  // Brand Voice Template State (initialized from store record or matching tone preset)
  const defaultPreset =
    BRAND_VOICE_PRESETS.find((p) => p.name === store.brandVoicePreset) ||
    (store.tone === 'Professional & Polished'
      ? BRAND_VOICE_PRESETS[1]
      : store.tone === 'Energetic & Promotional'
      ? BRAND_VOICE_PRESETS[2]
      : store.tone === 'Luxury & Refined'
      ? BRAND_VOICE_PRESETS[3]
      : BRAND_VOICE_PRESETS[0]);

  const [brandVoicePreset, setBrandVoicePreset] = useState<string>(
    store.brandVoicePreset || defaultPreset.name
  );
  const [positiveTemplate, setPositiveTemplate] = useState<string>(
    store.brandVoicePositiveTemplate || defaultPreset.positiveTemplate
  );
  const [neutralTemplate, setNeutralTemplate] = useState<string>(
    store.brandVoiceNeutralTemplate || defaultPreset.neutralTemplate
  );
  const [negativeTemplate, setNegativeTemplate] = useState<string>(
    store.brandVoiceNegativeTemplate || defaultPreset.negativeTemplate
  );
  const [brandVoiceSignOff, setBrandVoiceSignOff] = useState<string>(
    store.brandVoiceSignOff || defaultPreset.signOff
  );
  const [showBrandVoiceEditor, setShowBrandVoiceEditor] = useState<boolean>(false);
  const [savingBrandVoice, setSavingBrandVoice] = useState<boolean>(false);

  useEffect(() => {
    const matched =
      BRAND_VOICE_PRESETS.find((p) => p.name === store.brandVoicePreset) ||
      BRAND_VOICE_PRESETS[0];
    setBrandVoicePreset(store.brandVoicePreset || matched.name);
    setPositiveTemplate(
      store.brandVoicePositiveTemplate || matched.positiveTemplate
    );
    setNeutralTemplate(
      store.brandVoiceNeutralTemplate || matched.neutralTemplate
    );
    setNegativeTemplate(
      store.brandVoiceNegativeTemplate || matched.negativeTemplate
    );
    setBrandVoiceSignOff(store.brandVoiceSignOff || matched.signOff);
  }, [
    store.id,
    store.brandVoicePreset,
    store.brandVoicePositiveTemplate,
    store.brandVoiceNeutralTemplate,
    store.brandVoiceNegativeTemplate,
    store.brandVoiceSignOff,
  ]);

  const autoActedStoreRef = useRef<string | null>(null);

  // Automatically act on any reviews missing an SEO reply when the store is opened
  useEffect(() => {
    const reviewsMissingReply = reviews.filter(
      (r) => r.responseStatus === 'Needs Response' && !r.replyText.trim()
    );

    if (
      reviewsMissingReply.length > 0 &&
      autoActedStoreRef.current !== `${store.id}-${reviewsMissingReply.length}`
    ) {
      autoActedStoreRef.current = `${store.id}-${reviewsMissingReply.length}`;
      handleBatchGenerateSeoReplies(reviewsMissingReply);
    }
  }, [store.id, reviews.length]);

  const handleSelectBrandVoicePreset = (preset: BrandVoicePresetOption) => {
    setBrandVoicePreset(preset.name);
    setPositiveTemplate(preset.positiveTemplate);
    setNeutralTemplate(preset.neutralTemplate);
    setNegativeTemplate(preset.negativeTemplate);
    setBrandVoiceSignOff(preset.signOff);
  };

  const handleSaveBrandVoiceAndSuggest = async (
    overrideVoice?: {
      preset: string;
      positive: string;
      neutral: string;
      negative: string;
      signOff: string;
    }
  ) => {
    const activeVoice = overrideVoice || {
      preset: brandVoicePreset.trim() || 'Warm & Welcoming Local Host',
      positive: positiveTemplate.trim(),
      neutral: neutralTemplate.trim(),
      negative: negativeTemplate.trim(),
      signOff: brandVoiceSignOff.trim() || `Warm regards, Team ${store.name}`,
    };

    setSavingBrandVoice(true);
    setAgentStatusBanner(null);
    setGbpWarningBanner(null);

    try {
      await updateDoc(doc(db, 'stores', store.id), {
        brandVoicePreset: activeVoice.preset.slice(0, 100),
        brandVoicePositiveTemplate: activeVoice.positive.slice(0, 600),
        brandVoiceNeutralTemplate: activeVoice.neutral.slice(0, 600),
        brandVoiceNegativeTemplate: activeVoice.negative.slice(0, 600),
        brandVoiceSignOff: activeVoice.signOff.slice(0, 160),
        updatedAt: serverTimestamp(),
      });

      const pendingList = reviews.filter((r) => r.responseStatus !== 'Replied');
      if (pendingList.length > 0) {
        await handleBatchGenerateSeoReplies(pendingList, activeVoice);
      } else {
        setAgentStatusBanner(
          `Brand Voice "${activeVoice.preset}" saved! All future incoming reviews will automatically use your sentiment-matched reply templates.`
        );
      }
      setShowBrandVoiceEditor(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `stores/${store.id}`);
    } finally {
      setSavingBrandVoice(false);
    }
  };

  const handleBatchGenerateSeoReplies = async (
    targetReviews?: ReviewRecord[],
    voiceOverride?: {
      preset: string;
      positive: string;
      neutral: string;
      negative: string;
      signOff: string;
    }
  ) => {
    const listToProcess =
      targetReviews ||
      reviews.filter((r) => r.responseStatus !== 'Replied' && !r.replyText.trim());

    if (listToProcess.length === 0) return;

    const activeVoice = voiceOverride || {
      preset: brandVoicePreset,
      positive: positiveTemplate,
      neutral: neutralTemplate,
      negative: negativeTemplate,
      signOff: brandVoiceSignOff,
    };

    setBatchProcessing(true);
    setAgentStatusBanner(
      `Applying "${activeVoice.preset}" Brand Voice to ${listToProcess.length} pending ${
        listToProcess.length === 1 ? 'review' : 'reviews'
      } based on sentiment (😊 Positive / 😐 Neutral / 😟 Negative)...`
    );

    try {
      const data = await callCreditGatedAiEndpoint<{
        replies?: Array<{ id: string; sentiment?: ReviewSentiment; replyText: string }>;
      }>(
        '/api/ai/batch-generate-review-replies',
        {
          storeName: store.name,
          category: store.category,
          city: store.city,
          services: store.services,
          seoKeywords: store.seoKeywords || [],
          tone: store.tone,
          brandVoicePreset: activeVoice.preset,
          brandVoicePositiveTemplate: activeVoice.positive,
          brandVoiceNeutralTemplate: activeVoice.neutral,
          brandVoiceNegativeTemplate: activeVoice.negative,
          brandVoiceSignOff: activeVoice.signOff,
          reviews: listToProcess.map((r) => ({
            id: r.id,
            customerName: r.customerName,
            rating: r.rating,
            reviewText: r.reviewText,
          })),
        },
        {
          storeId: store.id,
          creditAction: 'batch_review_response',
        }
      );

      if (Array.isArray(data.replies)) {
        const autoPublishEnabled =
          Boolean(store.autoReviewReplies) &&
          (oneTimeApproved || hasOneTimePublishingApproval());
        const token = autoPublishEnabled ? await ensureBusinessToken() : null;

        for (const item of data.replies) {
          if (item.id && item.replyText) {
            const cleanReply = String(item.replyText).trim().slice(0, 2000);
            const matchedReview = listToProcess.find((r) => r.id === item.id);
            const resolvedSentiment = analyzeReviewSentiment({
              rating: matchedReview?.rating ?? 5,
              reviewText: matchedReview?.reviewText ?? '',
              sentiment: item.sentiment,
            });
            const path = `stores/${store.id}/reviews/${item.id}`;
            try {
              if (autoPublishEnabled && matchedReview) {
                const gbpResult = await pushReplyToGooglePage(
                  matchedReview,
                  cleanReply,
                  token
                );
                await updateDoc(doc(db, `stores/${store.id}/reviews`, item.id), {
                  replyText: cleanReply,
                  sentiment: resolvedSentiment,
                  responseStatus: 'Replied',
                  gbpReplySyncedAt:
                    gbpResult.syncedAt || new Date().toISOString(),
                  gbpSyncNote:
                    'Auto-published live to Google Business Profile (One-Time Approval Active)',
                  ...(gbpResult.gbpReviewName
                    ? { gbpReviewName: gbpResult.gbpReviewName.slice(0, 240) }
                    : {}),
                  updatedAt: serverTimestamp(),
                });
              } else {
                await updateDoc(doc(db, `stores/${store.id}/reviews`, item.id), {
                  replyText: cleanReply,
                  sentiment: resolvedSentiment,
                  responseStatus: 'Draft Saved',
                  updatedAt: serverTimestamp(),
                });
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, path);
            }
          }
        }
        setAgentStatusBanner(
          autoPublishEnabled
            ? `Auto-published ${data.replies.length} polite, SEO-optimized review ${
                data.replies.length === 1 ? 'response' : 'responses'
              } live to your Google Business Profile page!`
            : `Prepared ${data.replies.length} polite, SEO-optimized review ${
                data.replies.length === 1 ? 'response' : 'responses'
              } with local keywords (${store.name}, ${store.category}, ${
                store.city || 'Local'
              }). Click "Approve Once & Publish All" below.`
        );
      }
    } catch (err) {
      setAgentStatusBanner(null);
      if (isCreditGateError(err)) {
        setGbpWarningBanner(err.message);
      }
    } finally {
      setBatchProcessing(false);
    }
  };

  const ensureBusinessToken = async (): Promise<string> => {
    const hint = auth.currentUser?.email || store.gbpAccountEmail || undefined;
    const token = await getOrApproveGbpTokenOnce(hint, store.gbpConnected);
    setOneTimeApproved(true);
    return token;
  };

  const pushReplyToGooglePage = async (
    review: ReviewRecord,
    replyContent: string,
    token: string | null
  ): Promise<{
    gbpSynced: boolean;
    gbpReviewName?: string;
    syncedAt?: string;
    message?: string;
  }> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/gbp/reply-review', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountId: store.gbpAccountId || '',
          locationId: store.gbpLocationId || '',
          gbpReviewName: review.gbpReviewName || '',
          customerName: review.customerName,
          reviewText: review.reviewText,
          replyText: replyContent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return {
        gbpSynced: Boolean(data.gbpSynced),
        gbpReviewName: data.gbpReviewName ? String(data.gbpReviewName) : undefined,
        syncedAt: data.syncedAt ? String(data.syncedAt) : undefined,
        message: data.message ? String(data.message) : undefined,
      };
    } catch {
      return {
        gbpSynced: false,
        message: 'Reply saved in workspace, but could not reach Google Business Profile API.',
      };
    }
  };

  const handleSyncLiveGbpReviews = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setSyncingLiveGbpReviews(true);
    setAgentStatusBanner(null);
    setGbpWarningBanner(null);

    try {
      const token = await ensureBusinessToken();
      if (!token) {
        setGbpWarningBanner(
          'Google OAuth authorization is required to fetch and update live reviews on your Google page. Please authorize the popup when prompted.'
        );
        return;
      }

      const res = await fetch('/api/gbp/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: 'sync',
          userId: user.uid,
          googleAccountId: user.uid,
          storeId: store.id,
          storeName: store.name,
          category: store.category,
          address: store.address,
          city: store.city,
          phone: store.phone,
          website: store.website,
          openingHours: store.openingHours,
          services: store.services,
          seoKeywords: store.seoKeywords || [],
          tone: store.tone,
          accountEmail: user.email || store.gbpAccountEmail || '',
          selectedAccountId: store.gbpAccountId || undefined,
          selectedLocationId: store.gbpLocationId || undefined,
          existingReviewerNames: reviews.map((r) => r.customerName),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.apiResult === 'FAIL') {
        setGbpWarningBanner(
          data.googleApiErrorMessage ||
            data.error ||
            `Google API returned HTTP ${data.httpStatus || res.status}. Check Google Profile tab diagnostics.`
        );
        return;
      }

      let added = 0;
      if (Array.isArray(data.sampleReviews) && data.sampleReviews.length > 0) {
        for (const rev of data.sampleReviews) {
          const revRef = doc(collection(db, `stores/${store.id}/reviews`));
          const preparedReply = String(rev.existingOwnerReply || rev.replyText || '')
            .trim()
            .slice(0, 2000);
          const hasExistingGbpReply = Boolean(
            rev.existingOwnerReply && String(rev.existingOwnerReply).trim()
          );
          const resolvedSentiment = analyzeReviewSentiment({
            rating: Number(rev.rating) || 5,
            reviewText: String(rev.reviewText || ''),
            sentiment: rev.sentiment,
          });
          await setDoc(revRef, {
            ownerId: user.uid,
            storeId: store.id,
            customerName: String(rev.customerName || 'Valued Customer').slice(0, 100),
            rating: Number(rev.rating) || 5,
            reviewText: String(rev.reviewText || '').slice(0, 2000),
            reviewDate: String(rev.reviewDate || 'Recently').slice(0, 60),
            replyText: preparedReply,
            responseStatus: hasExistingGbpReply
              ? 'Replied'
              : preparedReply
              ? 'Draft Saved'
              : 'Needs Response',
            sentiment: resolvedSentiment,
            ...(rev.gbpReviewName
              ? { gbpReviewName: String(rev.gbpReviewName).slice(0, 240) }
              : {}),
            ...(hasExistingGbpReply
              ? { gbpReplySyncedAt: new Date().toISOString() }
              : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          added++;
        }
      }

      setAgentStatusBanner(
        added > 0
          ? `Fetched ${added} live Google Business Profile ${
              added === 1 ? 'review' : 'reviews'
            } with SEO replies ready to publish!`
          : 'Synced with Google Business Profile. All live Google reviews are already in your inbox.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sync GBP reviews.';
      setGbpWarningBanner(msg);
    } finally {
      setSyncingLiveGbpReviews(false);
    }
  };

  const handlePublishAllPreparedDrafts = async () => {
    const draftsToPublish = reviews.filter(
      (r) =>
        r.responseStatus !== 'Replied' &&
        (draftReplies[r.id]?.trim() || r.replyText.trim())
    );
    if (draftsToPublish.length === 0) return;

    setPublishingAll(true);
    setAgentStatusBanner(null);
    setGbpWarningBanner(null);
    try {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
      const token = await ensureBusinessToken();
      let liveSyncedCount = 0;
      let lastWarning = '';

      for (const rev of draftsToPublish) {
        const textToPublish = (
          draftReplies[rev.id] !== undefined ? draftReplies[rev.id] : rev.replyText
        )
          .trim()
          .slice(0, 2000);

        const gbpResult = await pushReplyToGooglePage(rev, textToPublish, token);
        if (gbpResult.gbpSynced) {
          liveSyncedCount++;
        } else if (gbpResult.message) {
          lastWarning = gbpResult.message;
        }

        const updatePayload: Record<string, unknown> = {
          replyText: textToPublish,
          responseStatus: 'Replied',
          gbpSyncNote: String(
            gbpResult.message ||
              (gbpResult.gbpSynced
                ? 'Published live to Google Business Profile page'
                : 'Saved in workspace')
          ).slice(0, 300),
          updatedAt: serverTimestamp(),
        };
        if (gbpResult.gbpReviewName) {
          updatePayload.gbpReviewName = gbpResult.gbpReviewName.slice(0, 240);
        }
        if (gbpResult.gbpSynced && gbpResult.syncedAt) {
          updatePayload.gbpReplySyncedAt = gbpResult.syncedAt.slice(0, 60);
        }

        await updateDoc(doc(db, `stores/${store.id}/reviews`, rev.id), updatePayload);
      }

      if (liveSyncedCount === draftsToPublish.length) {
        setAgentStatusBanner(
          `Published all ${liveSyncedCount} responses live to your Google Business Profile page!`
        );
      } else if (liveSyncedCount > 0) {
        setAgentStatusBanner(
          `Published ${liveSyncedCount} of ${draftsToPublish.length} responses live to Google Business Profile.`
        );
        if (lastWarning) setGbpWarningBanner(lastWarning);
      } else {
        setGbpWarningBanner(
          lastWarning ||
            'Replies saved in workspace. Connect & authorize Google OAuth with real GBP reviews to update your live Google page.'
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `stores/${store.id}/reviews`);
    } finally {
      setPublishingAll(false);
    }
  };

  const filteredReviews = reviews.filter((r) => {
    if (filter === 'pending' && r.responseStatus === 'Replied') return false;
    if (filter === 'replied' && r.responseStatus !== 'Replied') return false;
    if (sentimentFilter !== 'all') {
      const revSentiment = analyzeReviewSentiment(r);
      if (revSentiment !== sentimentFilter) return false;
    }
    return true;
  });

  const handleGenerateReply = async (review: ReviewRecord) => {
    setGeneratingId(review.id);
    try {
      const data = await callCreditGatedAiEndpoint<{
        replyText?: string;
        sentiment?: ReviewSentiment;
        seoKeywordsUsed?: string[];
      }>(
        '/api/ai/generate-review-reply',
        {
          storeName: store.name,
          category: store.category,
          city: store.city,
          services: store.services,
          seoKeywords: store.seoKeywords || [],
          tone: store.tone,
          brandVoicePreset,
          brandVoicePositiveTemplate: positiveTemplate,
          brandVoiceNeutralTemplate: neutralTemplate,
          brandVoiceNegativeTemplate: negativeTemplate,
          brandVoiceSignOff,
          customerName: review.customerName,
          rating: review.rating,
          reviewText: review.reviewText,
        },
        {
          storeId: store.id,
          creditAction: 'ai_review_response',
        }
      );
      if (data.replyText) {
        const cleanReply = String(data.replyText).trim().slice(0, 2000);
        const resolvedSentiment = analyzeReviewSentiment({
          rating: review.rating,
          reviewText: review.reviewText,
          sentiment: data.sentiment,
        });
        setDraftReplies((prev) => ({
          ...prev,
          [review.id]: cleanReply,
        }));
        const keywordsUsed = data.seoKeywordsUsed;
        if (Array.isArray(keywordsUsed)) {
          setSeoKeywordsMap((prev) => ({
            ...prev,
            [review.id]: keywordsUsed,
          }));
        }
        // Persist draft and analyzed sentiment immediately so it isn't lost
        await updateDoc(doc(db, `stores/${store.id}/reviews`, review.id), {
          replyText: cleanReply,
          sentiment: resolvedSentiment,
          responseStatus: review.responseStatus === 'Replied' ? 'Replied' : 'Draft Saved',
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      if (isCreditGateError(err)) {
        setGbpWarningBanner(err.message);
      }
    } finally {
      setGeneratingId(null);
    }
  };

  const handlePublishReply = async (
    review: ReviewRecord,
    targetStatus: 'Draft Saved' | 'Replied'
  ) => {
    const replyContent = (
      draftReplies[review.id] !== undefined ? draftReplies[review.id] : review.replyText
    ).trim();
    if (!replyContent) return;

    setSavingId(review.id);
    setAgentStatusBanner(null);
    setGbpWarningBanner(null);
    const path = `stores/${store.id}/reviews/${review.id}`;
    try {
      if (targetStatus === 'Draft Saved') {
        await updateDoc(doc(db, `stores/${store.id}/reviews`, review.id), {
          replyText: replyContent.slice(0, 2000),
          responseStatus: 'Draft Saved',
          updatedAt: serverTimestamp(),
        });
        setAgentStatusBanner(`Saved draft response for ${review.customerName}.`);
        return;
      }

      // Target status is 'Replied' -> Push live to Google Business Profile API AND update Firestore
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
      const token = await ensureBusinessToken();
      const gbpResult = await pushReplyToGooglePage(
        review,
        replyContent.slice(0, 2000),
        token
      );

      const updatePayload: Record<string, unknown> = {
        replyText: replyContent.slice(0, 2000),
        responseStatus: 'Replied',
        gbpReplySyncedAt:
          gbpResult.syncedAt?.slice(0, 60) || new Date().toISOString(),
        gbpSyncNote: String(
          gbpResult.message ||
            'Published live to Google Business Profile page'
        ).slice(0, 300),
        updatedAt: serverTimestamp(),
      };
      if (gbpResult.gbpReviewName) {
        updatePayload.gbpReviewName = gbpResult.gbpReviewName.slice(0, 240);
      }

      await updateDoc(doc(db, `stores/${store.id}/reviews`, review.id), updatePayload);

      setAgentStatusBanner(
        `Reply to ${review.customerName} is now published live on your Google Business Profile page!`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSavingId(null);
    }
  };

  const handleAddSampleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !newCustomer.trim() || !newReviewText.trim()) return;

    setAddingReview(true);
    const revRef = doc(collection(db, `stores/${store.id}/reviews`));
    const path = `stores/${store.id}/reviews/${revRef.id}`;
    try {
      // Immediately generate polite + SEO-improved reply & analyze sentiment when new review arrives
      let autoReply = '';
      let aiSentiment: ReviewSentiment | undefined = undefined;
      try {
        const aiRes = await fetch('/api/ai/generate-review-reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeName: store.name,
            category: store.category,
            city: store.city,
            services: store.services,
            seoKeywords: store.seoKeywords || [],
            tone: store.tone,
            brandVoicePreset,
            brandVoicePositiveTemplate: positiveTemplate,
            brandVoiceNeutralTemplate: neutralTemplate,
            brandVoiceNegativeTemplate: negativeTemplate,
            brandVoiceSignOff,
            customerName: newCustomer.trim(),
            rating: Number(newRating),
            reviewText: newReviewText.trim(),
          }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          autoReply = String(aiData.replyText || '').trim().slice(0, 2000);
          if (
            aiData.sentiment === 'Positive' ||
            aiData.sentiment === 'Neutral' ||
            aiData.sentiment === 'Negative'
          ) {
            aiSentiment = aiData.sentiment;
          }
        }
      } catch {
        // Fallback if AI call fails
      }

      const resolvedSentiment = analyzeReviewSentiment({
        rating: Number(newRating),
        reviewText: newReviewText.trim(),
        sentiment: aiSentiment,
      });

      await setDoc(revRef, {
        ownerId: user.uid,
        storeId: store.id,
        customerName: newCustomer.trim().slice(0, 100),
        rating: Number(newRating),
        reviewText: newReviewText.trim().slice(0, 2000),
        reviewDate: 'Just now',
        replyText: autoReply,
        responseStatus: autoReply ? 'Draft Saved' : 'Needs Response',
        sentiment: resolvedSentiment,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewCustomer('');
      setNewReviewText('');
      setShowAddModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setAddingReview(false);
    }
  };

  const pendingReviewsCount = reviews.filter((r) => r.responseStatus !== 'Replied').length;
  const preparedDraftsCount = reviews.filter(
    (r) =>
      r.responseStatus !== 'Replied' &&
      (draftReplies[r.id]?.trim() || r.replyText.trim())
  ).length;

  const sentimentCounts = reviews.reduce(
    (acc, r) => {
      const s = analyzeReviewSentiment(r);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { Positive: 0, Neutral: 0, Negative: 0 } as Record<ReviewSentiment, number>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">Google Reviews Inbox</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#8a6a1f] bg-[#f0b429]/15 text-xs font-mono font-bold text-[#f8cf6b]">
              <Star className="w-3.5 h-3.5 fill-[#f0b429] text-[#f0b429]" />
              <span>{getStoreGbpRating(store).toFixed(1)} ★ on GBP</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Automated polite, healthy & local-SEO-improved responses for{' '}
            <strong className="text-slate-700">{store.name}</strong> ({store.category} · {store.city || 'Local'})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({reviews.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('pending')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({pendingReviewsCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('replied')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                filter === 'replied'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Replied ({reviews.filter((r) => r.responseStatus === 'Replied').length})
            </button>
          </div>

          <button
            type="button"
            onClick={handleSyncLiveGbpReviews}
            disabled={syncingLiveGbpReviews}
            className="px-3.5 py-2 rounded-xl border border-[#8a6a1f] bg-[#161616] hover:bg-[#1c1c1c] text-xs font-semibold text-[#f8cf6b] flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingLiveGbpReviews ? 'animate-spin' : ''}`} />
            <span>{syncingLiveGbpReviews ? 'Syncing GBP...' : 'Sync Live GBP Reviews'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(!showAddModal)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Simulate New Review</span>
          </button>
        </div>
      </div>

      {/* Customer Review Sentiment Breakdown & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Sentiment Analysis:
          </span>
          <span className="text-xs text-slate-600">
            AI-detected tone across {reviews.length}{' '}
            {reviews.length === 1 ? 'review' : 'reviews'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSentimentFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              sentimentFilter === 'all'
                ? 'bg-[#f0b429]/20 border border-[#f0b429] text-[#f8cf6b]'
                : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-transparent'
            }`}
          >
            <span>All Sentiments ({reviews.length})</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSentimentFilter(sentimentFilter === 'Positive' ? 'all' : 'Positive')
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border ${
              sentimentFilter === 'Positive'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            <span aria-hidden="true">😊</span>
            <span>Positive ({sentimentCounts.Positive})</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSentimentFilter(sentimentFilter === 'Neutral' ? 'all' : 'Neutral')
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border ${
              sentimentFilter === 'Neutral'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <span aria-hidden="true">😐</span>
            <span>Neutral ({sentimentCounts.Neutral})</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSentimentFilter(sentimentFilter === 'Negative' ? 'all' : 'Negative')
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 border ${
              sentimentFilter === 'Negative'
                ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
            }`}
          >
            <span aria-hidden="true">😟</span>
            <span>Negative ({sentimentCounts.Negative})</span>
          </button>
        </div>
      </div>

      {/* Brand Voice Template Studio (Sentiment-Driven Auto-Reply Suggestions) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#f0b429]">
                Brand Voice Template
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-[#f0b429]/15 border border-[#8a6a1f] text-xs font-bold text-[#f8cf6b]">
                Active: {brandVoicePreset}
              </span>
              <span className="text-xs text-slate-500">
                · Auto-suggests replies by review sentiment (😊 Positive / 😐 Neutral / 😟 Negative)
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Choose a predefined Brand Voice preset or customize how AI drafts responses for Positive, Neutral, and Negative reviews.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowBrandVoiceEditor(!showBrandVoiceEditor)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
            >
              {showBrandVoiceEditor
                ? 'Hide Template Rules'
                : 'Customize Sentiment Templates'}
            </button>

            <button
              type="button"
              disabled={savingBrandVoice || batchProcessing}
              onClick={() => handleSaveBrandVoiceAndSuggest()}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {savingBrandVoice || batchProcessing
                  ? 'Applying Brand Voice...'
                  : pendingReviewsCount > 0
                  ? `Save & Auto-Suggest Pending (${pendingReviewsCount})`
                  : 'Save Brand Voice Template'}
              </span>
            </button>
          </div>
        </div>

        {/* Predefined Brand Voice Preset Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {BRAND_VOICE_PRESETS.map((preset) => {
            const isSelected = brandVoicePreset === preset.name;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  handleSelectBrandVoicePreset(preset);
                  void handleSaveBrandVoiceAndSuggest({
                    preset: preset.name,
                    positive: preset.positiveTemplate,
                    neutral: preset.neutralTemplate,
                    negative: preset.negativeTemplate,
                    signOff: preset.signOff,
                  });
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? 'border-[#f0b429] bg-[#f0b429]/10 ring-1 ring-[#f0b429]/40'
                    : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {preset.name}
                  </span>
                  {isSelected && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#f0b429] shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {preset.tagline}
                </p>
              </button>
            );
          })}
        </div>

        {/* Expandable Sentiment-Specific Brand Voice Template Editor */}
        {showBrandVoiceEditor && (
          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                Supported dynamic placeholders:{' '}
                <code className="text-[#f8cf6b] font-mono">{'{customerName}'}</code>,{' '}
                <code className="text-[#f8cf6b] font-mono">{'{storeName}'}</code>,{' '}
                <code className="text-[#f8cf6b] font-mono">{'{city}'}</code>,{' '}
                <code className="text-[#f8cf6b] font-mono">{'{service}'}</code>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
              {/* Positive Sentiment Template */}
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <span aria-hidden="true">😊</span>
                  <span>Positive Sentiment Reply Rule</span>
                </label>
                <textarea
                  rows={3}
                  value={positiveTemplate}
                  onChange={(e) => {
                    setPositiveTemplate(e.target.value);
                    setBrandVoicePreset('Custom Brand Voice');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>

              {/* Neutral Sentiment Template */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <span aria-hidden="true">😐</span>
                  <span>Neutral Sentiment Reply Rule</span>
                </label>
                <textarea
                  rows={3}
                  value={neutralTemplate}
                  onChange={(e) => {
                    setNeutralTemplate(e.target.value);
                    setBrandVoicePreset('Custom Brand Voice');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>

              {/* Negative Sentiment Template */}
              <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/5 space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                  <span aria-hidden="true">😟</span>
                  <span>Negative Sentiment Reply Rule</span>
                </label>
                <textarea
                  rows={3}
                  value={negativeTemplate}
                  onChange={(e) => {
                    setNegativeTemplate(e.target.value);
                    setBrandVoicePreset('Custom Brand Voice');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 max-w-md">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand Voice Signature Sign-Off
                </label>
                <input
                  type="text"
                  value={brandVoiceSignOff}
                  onChange={(e) => setBrandVoiceSignOff(e.target.value)}
                  placeholder="Warm regards, Team {storeName}"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>

              <button
                type="button"
                disabled={savingBrandVoice || batchProcessing}
                onClick={() => handleSaveBrandVoiceAndSuggest()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 self-end cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Custom Brand Voice & Suggest Pending Replies</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Automated SEO Review Agent Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Zap className="w-4 h-4 text-blue-600" />
            <span>Polite & Local-SEO Review Response Engine</span>
          </div>
          <p className="text-xs text-slate-600">
            Automatically drafts warm, constructive replies enriched with local SEO keywords (<strong className="text-slate-800">{store.name}</strong>, <strong className="text-slate-800">{store.category}</strong>, <strong className="text-slate-800">{store.city || 'your city'}</strong>) to improve Google Maps ranking.
          </p>
          {agentStatusBanner && (
            <p className="text-xs text-emerald-700 font-semibold pt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{agentStatusBanner}</span>
            </p>
          )}
          {gbpWarningBanner && (
            <div className="mt-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-2 text-xs text-amber-300">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{gbpWarningBanner}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={batchProcessing || pendingReviewsCount === 0}
            onClick={() =>
              handleBatchGenerateSeoReplies(
                reviews.filter((r) => r.responseStatus !== 'Replied')
              )
            }
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>
              {batchProcessing
                ? 'Crafting SEO Replies...'
                : 'Refresh All SEO Drafts'}
            </span>
          </button>

          {preparedDraftsCount > 0 && (
            <button
              type="button"
              disabled={publishingAll}
              onClick={handlePublishAllPreparedDrafts}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {publishingAll
                  ? 'Publishing All...'
                  : `Approve & Publish All (${preparedDraftsCount})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Add Customer Review Form */}
      {showAddModal && (
        <form
          onSubmit={handleAddSampleReview}
          className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">
              Simulate Incoming Google Review (Auto-Acts with SEO Reply)
            </h2>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="e.g. Ananya Rao"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Star Rating
              </label>
              <select
                value={newRating}
                onChange={(e) => setNewRating(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none bg-white"
              >
                <option value={5}>5 Stars (★★★★★)</option>
                <option value={4}>4 Stars (★★★★☆)</option>
                <option value={3}>3 Stars (★★★☆☆)</option>
                <option value={2}>2 Stars (★★☆☆☆)</option>
                <option value={1}>1 Star (★☆☆☆☆)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Review Comment *
            </label>
            <textarea
              rows={2}
              required
              value={newReviewText}
              onChange={(e) => setNewReviewText(e.target.value)}
              placeholder="What did the customer say about their visit?"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={addingReview}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
            >
              {addingReview ? 'Fetching & Acting on Review...' : 'Add & Auto-Draft SEO Reply'}
            </button>
          </div>
        </form>
      )}

      {/* Review List */}
      {filteredReviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <MessageSquare className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No reviews in this view</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Connect your Google Business Profile or click “Simulate New Review” above to see automatic polite & SEO-improved review replies in action.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReviews.map((review) => {
            const currentReply =
              draftReplies[review.id] !== undefined
                ? draftReplies[review.id]
                : review.replyText;

            const seoKeywords =
              seoKeywordsMap[review.id] ||
              (Array.isArray(store.seoKeywords) && store.seoKeywords.length > 0
                ? store.seoKeywords
                : [store.name, store.category, store.city || 'Local Service']);

            const reviewSentiment = analyzeReviewSentiment(review);
            const sentimentBadgeConfig =
              reviewSentiment === 'Positive'
                ? {
                    emoji: '😊',
                    label: 'Positive',
                    className:
                      'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
                  }
                : reviewSentiment === 'Negative'
                ? {
                    emoji: '😟',
                    label: 'Negative',
                    className: 'bg-rose-500/15 border-rose-500/40 text-rose-400',
                  }
                : {
                    emoji: '😐',
                    label: 'Neutral',
                    className:
                      'bg-amber-500/15 border-amber-500/40 text-amber-400',
                  };

            return (
              <div
                key={review.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
              >
                {/* Review Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-bold text-slate-900">
                        {review.customerName}
                      </span>
                      <div className="flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            className={`w-3.5 h-3.5 ${
                              idx < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span
                        title={`AI Sentiment Analysis: ${sentimentBadgeConfig.label}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-semibold ${sentimentBadgeConfig.className}`}
                      >
                        <span aria-hidden="true">{sentimentBadgeConfig.emoji}</span>
                        <span>{sentimentBadgeConfig.label}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>{review.reviewDate}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          review.responseStatus === 'Replied'
                            ? 'text-emerald-700'
                            : review.responseStatus === 'Draft Saved'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {review.responseStatus === 'Draft Saved'
                          ? 'SEO Reply Prepared (Ready to Publish)'
                          : review.responseStatus}
                      </span>
                      {review.gbpReviewName ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400">
                          <Globe className="w-3 h-3" />
                          <span>Live GBP Review</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-500">
                          <span>Workspace Review</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleGenerateReply(review)}
                    disabled={generatingId === review.id}
                    className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {generatingId === review.id
                        ? 'Optimizing SEO Reply...'
                        : currentReply
                        ? 'Regenerate Polite SEO Reply'
                        : 'Generate Reply'}
                    </span>
                  </button>
                </div>

                {/* Review Body */}
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  “{review.reviewText}”
                </p>

                {/* Owner Editable Response Box */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label className="text-xs font-semibold text-slate-700 flex flex-wrap items-center gap-2">
                      <span>
                        Polite & SEO-Improved Owner Response (Editable before publishing)
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#f0b429]/10 border border-[#8a6a1f]/60 text-[11px] font-medium text-[#f8cf6b]">
                        Brand Voice: {brandVoicePreset} ({sentimentBadgeConfig.emoji}{' '}
                        {sentimentBadgeConfig.label} Template)
                      </span>
                    </label>
                    {review.responseStatus === 'Replied' ? (
                      review.gbpReplySyncedAt ? (
                        <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Live on Google Business Profile Page</span>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {review.gbpSyncNote ||
                              'Saved in Workspace · Click "Push Live to Google Page" below'}
                          </span>
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        SEO Signals: {seoKeywords.filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={3}
                    value={currentReply}
                    onChange={(e) =>
                      setDraftReplies((prev) => ({
                        ...prev,
                        [review.id]: e.target.value,
                      }))
                    }
                    placeholder="Click 'Generate Reply' above or write your personal response to this customer..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      disabled={savingId === review.id || !currentReply.trim()}
                      onClick={() => handlePublishReply(review, 'Draft Saved')}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      Save Draft
                    </button>
                    <button
                      type="button"
                      disabled={savingId === review.id || !currentReply.trim()}
                      onClick={() => handlePublishReply(review, 'Replied')}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {savingId === review.id
                          ? 'Publishing to Google...'
                          : review.responseStatus === 'Replied'
                          ? 'Update Reply on Google Page'
                          : oneTimeApproved
                          ? 'Publish Reply to Google Page'
                          : 'Approve Once & Publish Reply'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
