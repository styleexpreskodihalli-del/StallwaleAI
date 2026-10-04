import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
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
import { StoreRecord, PostRecord } from '../types';
import {
  AudienceFocus,
  getStorePromotionalGallery,
} from '../utils/categoryImages';
import {
  callCreditGatedAiEndpoint,
  isCreditGateError,
} from '../utils/creditClient';
import {
  Sparkles,
  Send,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Eye,
  X,
  Calendar,
  Clock,
} from 'lucide-react';

interface PostsViewProps {
  store: StoreRecord;
  posts: PostRecord[];
}

export function PostsView({ store, posts }: PostsViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [audienceFocusOverride, setAudienceFocusOverride] = useState<
    AudienceFocus | undefined
  >(undefined);
  const galleryInfo = getStorePromotionalGallery(store, audienceFocusOverride);
  const categoryGallery = galleryInfo.images;

  const [postType, setPostType] = useState<'Update' | 'Offer' | 'Event'>('Update');
  const [aiPrompt, setAiPrompt] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('Book Now');
  const [imageConcept, setImageConcept] = useState('');
  const [imageUrl, setImageUrl] = useState(categoryGallery[0].url);
  const [scheduledDate, setScheduledDate] = useState<string>(
    store.dailyPostScheduleDate || todayStr
  );
  const [scheduledTime, setScheduledTime] = useState<string>(
    store.dailyPostScheduleTime || '09:00'
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gbpWarning, setGbpWarning] = useState<string | null>(null);
  const [oneTimeApproved, setOneTimeApproved] = useState<boolean>(() =>
    hasOneTimePublishingApproval()
  );

  useEffect(() => {
    if (
      store.gbpConnected ||
      posts.some((p) => p.status === 'Published') ||
      hasOneTimePublishingApproval()
    ) {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
    }
  }, [store.gbpConnected, posts]);

  const [previewModalData, setPreviewModalData] = useState<{
    mode: 'new' | 'existing';
    existingPost?: PostRecord;
    postType: 'Update' | 'Offer' | 'Event';
    headline: string;
    description: string;
    cta: string;
    imageConcept: string;
    imageUrl: string;
  } | null>(null);

  useEffect(() => {
    setAudienceFocusOverride(undefined);
    const updatedGallery = getStorePromotionalGallery(store);
    setImageUrl(updatedGallery.images[0].url);
  }, [store.id, store.category, store.businessType, store.services]);

  const handleSelectAudienceFocus = (focus: AudienceFocus) => {
    setAudienceFocusOverride(focus);
    const updated = getStorePromotionalGallery(store, focus);
    if (updated.images.length > 0) {
      setImageUrl(updated.images[0].url);
    }
  };

  const ensureBusinessToken = async (): Promise<string> => {
    const hint = auth.currentUser?.email || store.gbpAccountEmail || undefined;
    const token = await getOrApproveGbpTokenOnce(hint, store.gbpConnected);
    setOneTimeApproved(true);
    return token;
  };

  const isLiveGooglePostResource = (resourceName?: string) => {
    if (!resourceName) return false;
    return (
      /^accounts\/[0-9]+\/locations\/[0-9]+\/localPosts\/[0-9a-zA-Z_-]+$/.test(
        resourceName.trim()
      ) &&
      !resourceName.includes('post-') &&
      !resourceName.includes('offer-')
    );
  };

  const pushPostToGooglePage = async (
    payload: {
      postType: string;
      headline: string;
      description: string;
      cta: string;
      imageUrl: string;
    },
    token: string | null
  ): Promise<{
    gbpSynced: boolean;
    liveGbpPushed?: boolean;
    resolvedAccountId?: string;
    resolvedLocationId?: string;
    gbpLocalPostName?: string;
    publishedAt?: string;
    message?: string;
  }> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/gbp/publish-post', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountId: store.gbpAccountId || '',
          locationId: store.gbpLocationId || '',
          storeName: store.name,
          website: store.website || '',
          ...payload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.resolvedAccountId && data.resolvedLocationId) {
        try {
          await updateDoc(doc(db, 'stores', store.id), {
            gbpConnected: true,
            gbpAccountId: String(data.resolvedAccountId).slice(0, 120),
            gbpLocationId: String(data.resolvedLocationId).slice(0, 120),
            gbpLastSync: new Date().toISOString().slice(0, 60),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // ignore
        }
      }
      return {
        gbpSynced: Boolean(data.gbpSynced),
        liveGbpPushed: Boolean(data.liveGbpPushed),
        resolvedAccountId: data.resolvedAccountId
          ? String(data.resolvedAccountId)
          : undefined,
        resolvedLocationId: data.resolvedLocationId
          ? String(data.resolvedLocationId)
          : undefined,
        gbpLocalPostName: data.gbpLocalPostName
          ? String(data.gbpLocalPostName)
          : undefined,
        publishedAt: data.publishedAt ? String(data.publishedAt) : undefined,
        message: data.message ? String(data.message) : undefined,
      };
    } catch {
      return {
        gbpSynced: false,
        message: 'Post saved in workspace, but could not reach Google Business Profile API.',
      };
    }
  };

  const handleGenerateWithAI = async () => {
    const promptToUse =
      aiPrompt.trim() || `Create a ${postType.toLowerCase()} post for today's special at ${store.name}`;
    setGenerating(true);
    setFeedback(null);
    setGbpWarning(null);

    try {
      const data = await callCreditGatedAiEndpoint<{
        headline?: string;
        description?: string;
        cta?: string;
        imageConcept?: string;
      }>(
        '/api/ai/generate-post',
        {
          storeName: store.name,
          category: store.category,
          city: store.city,
          services: store.services,
          seoKeywords: store.seoKeywords || [],
          tone: store.tone,
          postType,
          prompt: promptToUse,
        },
        {
          storeId: store.id,
          creditAction: 'simple_ai_generation',
        }
      );
      setHeadline((data.headline || '').slice(0, 150));
      setDescription((data.description || '').slice(0, 1500));
      setCta((data.cta || 'Learn More').slice(0, 60));
      setImageConcept((data.imageConcept || '').slice(0, 500));
    } catch (err) {
      if (isCreditGateError(err)) {
        setFeedback(err.message);
        return;
      }
      setFeedback(
        err instanceof Error ? err.message : 'Failed to connect to AI assistant.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const executeDirectPublishPost = async (targetData: {
    mode: 'new' | 'existing';
    existingPost?: PostRecord;
    postType: 'Update' | 'Offer' | 'Event';
    headline: string;
    description: string;
    cta: string;
    imageConcept: string;
    imageUrl: string;
  }) => {
    const user = auth.currentUser;
    if (!user) return;

    setSaving(true);
    setFeedback(null);
    setGbpWarning(null);

    try {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
      const token = await ensureBusinessToken();
      const gbpResult = await pushPostToGooglePage(
        {
          postType: targetData.postType,
          headline: targetData.headline,
          description: targetData.description,
          cta: targetData.cta,
          imageUrl: targetData.imageUrl,
        },
        token
      );

      const syncNote = String(
        gbpResult.message ||
          (gbpResult.gbpSynced
            ? 'Published live to Google Business Profile page'
            : 'Saved in workspace')
      ).slice(0, 300);

      if (targetData.mode === 'new') {
        const postRef = doc(collection(db, `stores/${store.id}/posts`));
        await setDoc(postRef, {
          ownerId: user.uid,
          storeId: store.id,
          postType: targetData.postType,
          headline: targetData.headline.slice(0, 150),
          description: targetData.description.slice(0, 1500),
          cta: targetData.cta.slice(0, 60),
          imageConcept: targetData.imageConcept.slice(0, 500),
          imageUrl: targetData.imageUrl.slice(0, 2000),
          status: 'Published',
          gbpSyncNote: syncNote,
          ...(gbpResult.gbpLocalPostName
            ? { gbpLocalPostName: gbpResult.gbpLocalPostName.slice(0, 240) }
            : {}),
          ...(gbpResult.gbpSynced && gbpResult.publishedAt
            ? { gbpPublishedAt: gbpResult.publishedAt.slice(0, 60) }
            : { gbpPublishedAt: new Date().toISOString() }),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setHeadline('');
        setDescription('');
        setImageConcept('');
        setAiPrompt('');
      } else if (targetData.existingPost) {
        const postId = targetData.existingPost.id;
        const updatePayload: Record<string, unknown> = {
          status: 'Published',
          imageUrl: targetData.imageUrl.slice(0, 2000),
          gbpSyncNote: syncNote,
          gbpPublishedAt:
            gbpResult.publishedAt?.slice(0, 60) || new Date().toISOString(),
          updatedAt: serverTimestamp(),
        };
        if (gbpResult.gbpLocalPostName) {
          updatePayload.gbpLocalPostName = gbpResult.gbpLocalPostName.slice(0, 240);
        }
        await updateDoc(doc(db, `stores/${store.id}/posts`, postId), updatePayload);
      }

      setPreviewModalData(null);
      setFeedback('Google Post & image published live to your Google Business Profile page!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stores/${store.id}/posts`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublishNewPost = () => {
    if (!headline.trim() || !description.trim()) return;
    const resolvedImg = imageUrl.trim() || categoryGallery[0].url;
    setImageUrl(resolvedImg);
    const payload = {
      mode: 'new' as const,
      postType,
      headline: headline.trim(),
      description: description.trim(),
      cta: cta.trim() || 'Learn More',
      imageConcept: imageConcept.trim(),
      imageUrl: resolvedImg,
    };
    if (oneTimeApproved || hasOneTimePublishingApproval()) {
      void executeDirectPublishPost(payload);
    } else {
      setPreviewModalData(payload);
    }
  };

  const handlePublishExistingPost = (post: PostRecord) => {
    const resolvedImg =
      (post.imageUrl && post.imageUrl.trim()) ||
      imageUrl.trim() ||
      categoryGallery[0].url;
    const payload = {
      mode: 'existing' as const,
      existingPost: post,
      postType: post.postType,
      headline: post.headline,
      description: post.description,
      cta: post.cta,
      imageConcept: post.imageConcept,
      imageUrl: resolvedImg,
    };
    if (oneTimeApproved || hasOneTimePublishingApproval()) {
      void executeDirectPublishPost(payload);
    } else {
      setPreviewModalData(payload);
    }
  };

  const handleSavePost = async (
    targetStatus: 'Draft' | 'Scheduled' | 'Published'
  ) => {
    const user = auth.currentUser;
    if (!user || !headline.trim() || !description.trim()) return;

    if (targetStatus === 'Published') {
      handlePublishNewPost();
      return;
    }

    setSaving(true);
    setFeedback(null);
    setGbpWarning(null);
    const postRef = doc(collection(db, `stores/${store.id}/posts`));
    const path = `stores/${store.id}/posts/${postRef.id}`;

    try {
      await setDoc(postRef, {
        ownerId: user.uid,
        storeId: store.id,
        postType,
        headline: headline.trim().slice(0, 150),
        description: description.trim().slice(0, 1500),
        cta: (cta.trim() || 'Learn More').slice(0, 60),
        imageConcept: imageConcept.trim().slice(0, 500),
        imageUrl: (imageUrl.trim() || categoryGallery[0].url).slice(0, 2000),
        status: targetStatus,
        ...(targetStatus === 'Scheduled'
          ? {
              scheduledDate: scheduledDate.slice(0, 40),
              scheduledTime: scheduledTime.slice(0, 40),
              gbpSyncNote: `Queued for automatic publishing on ${scheduledDate} at ${scheduledTime}`.slice(
                0,
                300
              ),
            }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      if (targetStatus === 'Scheduled') {
        await updateDoc(doc(db, 'stores', store.id), {
          autoDailyPosts: true,
          dailyPostScheduleDate: scheduledDate.slice(0, 40),
          dailyPostScheduleTime: scheduledTime.slice(0, 40),
          updatedAt: serverTimestamp(),
        });
      }
      setHeadline('');
      setDescription('');
      setImageConcept('');
      setAiPrompt('');
      setFeedback(
        targetStatus === 'Scheduled'
          ? `Automated post scheduled and queued for ${scheduledDate} at ${scheduledTime}!`
          : 'Draft & preview image saved to your store workspace.'
      );
      setTimeout(() => setFeedback(null), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmPublishToGoogle = async () => {
    if (!previewModalData) return;
    await executeDirectPublishPost(previewModalData);
  };

  const handleDeletePost = async (postId: string) => {
    const path = `stores/${store.id}/posts/${postId}`;
    try {
      await deleteDoc(doc(db, `stores/${store.id}/posts`, postId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const resetForm = () => {
    setHeadline('');
    setDescription('');
    setImageConcept('');
    setAiPrompt('');
    setFeedback(null);
    setGbpWarning(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Google Post</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Draft, preview with image, and publish daily updates, offers, or events for{' '}
          <strong className="text-slate-700">{store.name}</strong> ({store.category})
        </p>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {gbpWarning && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 flex items-start gap-2.5 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="font-semibold">{gbpWarning}</p>
        </div>
      )}

      {/* Composer + Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Composer */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          {/* Post Type Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-2">
              1. Select Post Type
            </label>
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
              {(['Update', 'Offer', 'Event'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPostType(type)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    postType === type
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* AI Assistant Box */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                AI Post Generator ({store.category} Tone: {store.tone})
              </span>
              {Array.isArray(store.seoKeywords) && store.seoKeywords.length > 0 && (
                <span className="text-[11px] text-blue-700 font-medium">
                  Target SEO Keywords: {store.seoKeywords.join(' · ')}
                </span>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={`e.g. Create a post for today’s special at ${store.name}`}
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-white border border-blue-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
              <button
                type="button"
                onClick={handleGenerateWithAI}
                disabled={generating}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generating ? 'Writing...' : 'Generate with AI'}</span>
              </button>
            </div>
          </div>

          {/* Manual / Editable Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Headline *
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="Catchy headline for local searchers"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Description *
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write or generate the body of your Google Business post..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Call to Action (CTA)
                </label>
                <select
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
                >
                  <option value="Book Now">Book Now</option>
                  <option value="Call Today">Call Today</option>
                  <option value="Visit Us">Visit Us</option>
                  <option value="Order Online">Order Online</option>
                  <option value="Learn More">Learn More</option>
                  <option value="Claim Offer">Claim Offer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Post Image URL (Required for Preview & Publish) *
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 font-mono"
                />
              </div>
            </div>

            {/* Category & Gender-Matched Image Gallery */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <span>
                    {store.category} Visual Gallery
                    {galleryInfo.supportsGenderFocus
                      ? ` · ${
                          galleryInfo.activeFocus === 'men'
                            ? "Men's Focus"
                            : galleryInfo.activeFocus === 'women'
                            ? "Women's Focus"
                            : 'Unisex (Men & Women)'
                        }`
                      : ''}
                  </span>
                </span>

                {galleryInfo.supportsGenderFocus && (
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    {(
                      [
                        { id: 'men', label: 'Men Only' },
                        { id: 'unisex', label: 'Unisex (Both)' },
                        { id: 'women', label: 'Women Only' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectAudienceFocus(opt.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          galleryInfo.activeFocus === opt.id
                            ? 'bg-[#f0b429] text-[#1a1204]'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {categoryGallery.map((preset) => {
                  const isSelected = imageUrl === preset.url;
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      className={`group relative rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#f0b429] ring-2 ring-[#f0b429]/40'
                          : 'border-slate-200 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="w-full h-20 object-cover"
                      />
                      <div className="p-1.5 bg-[#161616] text-[11px] font-medium text-slate-200 truncate">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule Date & Time Selection for Daily Posts */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-[#f0b429]" />
                  <span>Schedule Automated Post Date &amp; Time</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  Select when this post should be queued or published
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled Date
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Scheduled Time
                  </label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons: Save Draft, Schedule Post, Preview with Image & Publish, Cancel */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !headline.trim() || !description.trim()}
              onClick={() => handleSavePost('Draft')}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Save Draft</span>
            </button>
            <button
              type="button"
              disabled={
                saving ||
                !headline.trim() ||
                !description.trim() ||
                !scheduledDate ||
                !scheduledTime
              }
              onClick={() => handleSavePost('Scheduled')}
              className="px-4 py-2.5 rounded-xl border border-[#8a6a1f] bg-[#161616] hover:bg-[#1c1c1c] text-[#f8cf6b] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Schedule Post ({scheduledTime})</span>
            </button>
            <button
              type="button"
              disabled={saving || !headline.trim() || !description.trim() || !imageUrl.trim()}
              onClick={handlePublishNewPost}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? 'Publishing to Google...'
                  : oneTimeApproved
                  ? 'Publish Post to Google'
                  : 'Approve Once & Publish Post'}
              </span>
            </button>
          </div>
        </div>

        {/* Right: Google Business Post Preview */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-900">
              Google Business Profile Preview
            </span>
            <span className="text-xs text-slate-500">{postType} Post</span>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/50">
            <div className="relative h-44 w-full bg-slate-900">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={headline || store.name}
                  className="w-full h-full object-cover"
                />
              ) : null}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/75 border border-[#f0b429]/50 text-[11px] font-bold text-[#f8cf6b]">
                {store.name}
              </div>
            </div>

            <div className="p-4 space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                {headline || 'Your Post Headline Will Appear Here'}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                {description ||
                  'Use the AI generator or type above to preview how your update will look to customers searching for your business on Google.'}
              </p>

              <div className="pt-2">
                <span className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                  {cta || 'Book Now'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            STallwale.in requires a visual preview with image confirmation before publishing live to your Google Business Profile page.
          </p>
        </div>
      </div>

      {/* Mandatory Pre-Publish Preview Modal */}
      {previewModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl space-y-5 p-6">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f0b429] block">
                  Mandatory Pre-Publish Verification
                </span>
                <h2 className="text-base font-bold text-white">
                  Confirm Google Post Preview with Image
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalData(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-[#2a2a2a] overflow-hidden bg-[#111111]">
              <div className="relative h-52 w-full bg-black">
                <img
                  src={previewModalData.imageUrl}
                  alt={previewModalData.headline}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/80 border border-[#f0b429]/50 text-xs font-bold text-[#f8cf6b]">
                  {store.name} · {previewModalData.postType}
                </div>
              </div>
              <div className="p-4 space-y-2">
                <h3 className="text-base font-bold text-white">
                  {previewModalData.headline}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {previewModalData.description}
                </p>
                <div className="pt-2">
                  <span className="inline-block px-3.5 py-1.5 rounded-lg bg-[#f0b429] text-[#1a1204] text-xs font-bold">
                    {previewModalData.cta}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPreviewModalData(null)}
                className="px-4 py-2.5 rounded-xl border border-[#2a2a2a] text-xs font-semibold text-slate-300 hover:bg-[#1c1c1c] cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmPublishToGoogle}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {saving ? 'Publishing to Google...' : 'Confirm & Publish to Google Page'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Store Posts List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Daily Posts &amp; Store History ({posts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated and manual Google Business Profile posts for {store.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold">
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
            {posts.some((p) => !isLiveGooglePostResource(p.gbpLocalPostName)) && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setFeedback(null);
                  try {
                    const token = await ensureBusinessToken();
                    let pushedCount = 0;
                    for (const p of posts) {
                      if (!isLiveGooglePostResource(p.gbpLocalPostName)) {
                        const res = await pushPostToGooglePage(
                          {
                            postType: p.postType,
                            headline: p.headline,
                            description: p.description,
                            cta: p.cta,
                            imageUrl: p.imageUrl || categoryGallery[0].url,
                          },
                          token
                        );
                        await updateDoc(doc(db, `stores/${store.id}/posts`, p.id), {
                          status: 'Published',
                          ...(res.gbpLocalPostName
                            ? { gbpLocalPostName: res.gbpLocalPostName.slice(0, 240) }
                            : {}),
                          gbpPublishedAt: (
                            res.publishedAt || new Date().toISOString()
                          ).slice(0, 60),
                          gbpSyncNote: String(
                            res.message || 'Published live to Google Business Profile'
                          ).slice(0, 300),
                          updatedAt: serverTimestamp(),
                        });
                        if (res.liveGbpPushed) pushedCount++;
                      }
                    }
                    setFeedback(
                      pushedCount > 0
                        ? `Synced ${pushedCount} automated ${
                            pushedCount === 1 ? 'post' : 'posts'
                          } live to your Google Business Profile page!`
                        : 'Posts updated. Make sure your Google account with GBP location access is authorized in the Google Profile tab.'
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {saving ? 'Syncing to Google Page...' : 'Sync All Posts to Live Google Page'}
                </span>
              </button>
            )}
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No Google posts created for {store.name} yet. Use the composer above to create your first post.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {posts.map((post) => {
              const isVerifiedLiveGbp = isLiveGooglePostResource(
                post.gbpLocalPostName
              );
              const isLive = post.status === 'Published';
              const isQueued = post.status === 'Scheduled';
              const platformStatusLabel = isLive
                ? 'Live'
                : isQueued
                ? 'Queued'
                : 'Draft';
              const dotColorClass = isLive
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.85)]'
                : isQueued
                ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.85)]'
                : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.85)]';
              const statusBadgeClass = isLive
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600'
                : isQueued
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                : 'bg-red-500/15 border-red-500/30 text-red-500';

              return (
                <div
                  key={post.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 max-w-2xl">
                    <img
                      src={post.imageUrl || categoryGallery[0].url}
                      alt={post.headline}
                      className="w-20 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-mono text-[11px] font-bold uppercase tracking-wider ${statusBadgeClass}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${dotColorClass}`}
                          />
                          <span>{platformStatusLabel}</span>
                        </span>
                        {post.scheduledDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-[#f8cf6b]">
                              {post.scheduledDate}
                              {post.scheduledTime ? ` at ${post.scheduledTime}` : ''}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{post.postType}</span>
                        <span aria-hidden="true">·</span>
                        <span>CTA: {post.cta}</span>
                        {isVerifiedLiveGbp ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Verified Live on Google Page</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-400">
                            <span>Ready to Push to Live GBP</span>
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {post.headline}
                      </h3>
                      <p className="text-xs text-slate-600">{post.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!isVerifiedLiveGbp && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handlePublishExistingPost(post)}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Push Live to Google</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeletePost(post.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete post"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
