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
  hasOneTimePublishingApproval,
  setOneTimePublishingApproval,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { StoreRecord, OfferRecord } from '../types';
import {
  AudienceFocus,
  getStorePromotionalGallery,
} from '../utils/categoryImages';
import {
  callCreditGatedAiEndpoint,
  isCreditGateError,
} from '../utils/creditClient';
import {
  Tag,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Ban,
  Send,
  Save,
  Image as ImageIcon,
  Eye,
  Upload,
  Globe,
  X,
} from 'lucide-react';

interface OffersViewProps {
  store: StoreRecord;
  offers: OfferRecord[];
}

export function OffersView({ store, offers }: OffersViewProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const initialGalleryInfo = getStorePromotionalGallery(store);
  const [audienceFocusOverride, setAudienceFocusOverride] = useState<
    AudienceFocus | undefined
  >(undefined);

  const galleryInfo = getStorePromotionalGallery(store, audienceFocusOverride);
  const categoryGallery = galleryInfo.images;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discount, setDiscount] = useState('20% OFF');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextWeekStr);
  const [terms, setTerms] = useState(
    'Valid in-store. Cannot be combined with other promotions.'
  );
  const [cta, setCta] = useState('Claim Offer');
  const [imageUrl, setImageUrl] = useState(categoryGallery[0].url);
  const [imagePrompt, setImagePrompt] = useState(
    `Promotional banner for ${store.name} (${store.category})`
  );
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishingOfferId, setPublishingOfferId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [gbpWarning, setGbpWarning] = useState<string | null>(null);
  const [oneTimeApproved, setOneTimeApproved] = useState<boolean>(() =>
    hasOneTimePublishingApproval()
  );

  useEffect(() => {
    if (
      store.gbpConnected ||
      offers.some((o) => o.status === 'Active') ||
      hasOneTimePublishingApproval()
    ) {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
    }
  }, [store.gbpConnected, offers]);

  // Pre-publish mandatory Preview with Image Modal state
  const [previewModalData, setPreviewModalData] = useState<{
    mode: 'new' | 'existing';
    existingOffer?: OfferRecord;
    title: string;
    description: string;
    discount: string;
    startDate: string;
    endDate: string;
    terms: string;
    cta: string;
    imageUrl: string;
    imagePrompt: string;
  } | null>(null);

  useEffect(() => {
    setAudienceFocusOverride(undefined);
    const updatedGallery = getStorePromotionalGallery(store);
    setImageUrl(updatedGallery.images[0].url);
    setImagePrompt(
      `${updatedGallery.images[0].label} at ${store.name} (${store.category})`
    );
  }, [store.id, store.category, store.businessType, store.services]);

  const handleSelectAudienceFocus = (focus: AudienceFocus) => {
    setAudienceFocusOverride(focus);
    const updated = getStorePromotionalGallery(store, focus);
    if (updated.images.length > 0) {
      setImageUrl(updated.images[0].url);
      setImagePrompt(`${updated.images[0].label} at ${store.name}`);
    }
  };

  const ensureBusinessToken = async (): Promise<string> => {
    const hint = auth.currentUser?.email || store.gbpAccountEmail || undefined;
    const token = await getOrApproveGbpTokenOnce(hint, store.gbpConnected);
    setOneTimeApproved(true);
    return token;
  };

  const pushOfferToGooglePage = async (
    offerPayload: {
      title: string;
      description: string;
      discount: string;
      startDate: string;
      endDate: string;
      terms: string;
      cta: string;
      imageUrl: string;
    },
    token: string | null
  ): Promise<{
    gbpSynced: boolean;
    gbpLocalPostName?: string;
    publishedAt?: string;
    message?: string;
  }> => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/gbp/publish-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          accountId: store.gbpAccountId || '',
          locationId: store.gbpLocationId || '',
          storeName: store.name,
          website: store.website || '',
          ...offerPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return {
        gbpSynced: Boolean(data.gbpSynced),
        gbpLocalPostName: data.gbpLocalPostName
          ? String(data.gbpLocalPostName)
          : undefined,
        publishedAt: data.publishedAt ? String(data.publishedAt) : undefined,
        message: data.message ? String(data.message) : undefined,
      };
    } catch {
      return {
        gbpSynced: false,
        message:
          'Offer saved in workspace, but could not reach Google Business Profile API.',
      };
    }
  };

  const handleAiSuggest = async () => {
    setGenerating(true);
    setFeedback(null);
    setGbpWarning(null);
    try {
      const data = await callCreditGatedAiEndpoint<{
        title?: string;
        description?: string;
        discount?: string;
        terms?: string;
        cta?: string;
        imageUrl?: string;
        imagePrompt?: string;
      }>(
        '/api/ai/generate-offer',
        {
          storeName: store.name,
          category: store.category,
          businessType: store.businessType,
          services: store.services,
          audienceFocus: galleryInfo.activeFocus,
          city: store.city,
          tone: store.tone,
          prompt: aiPrompt.trim() || `Weekend special offer for ${store.name}`,
        },
        {
          storeId: store.id,
          creditAction: 'ai_offer_content_generation',
        }
      );
      setTitle((data.title || '').slice(0, 150));
      setDescription((data.description || '').slice(0, 1200));
      setDiscount((data.discount || '20% OFF').slice(0, 60));
      setTerms((data.terms || '').slice(0, 500));
      setCta((data.cta || 'Claim Offer').slice(0, 60));
      if (data.imageUrl) {
        setImageUrl(String(data.imageUrl).slice(0, 2000));
      }
      if (data.imagePrompt) {
        setImagePrompt(String(data.imagePrompt).slice(0, 500));
      }
    } catch (err) {
      if (isCreditGateError(err)) {
        setGbpWarning(err.message);
        return;
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length <= 2000) {
        setImageUrl(reader.result);
      } else {
        // Compress via canvas so data URL fits Firestore rules (<= 2000 chars) or keep high-res preview
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 270;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL('image/jpeg', 0.45);
            if (compressed.length <= 1950) {
              setImageUrl(compressed);
            } else {
              setGbpWarning(
                'Uploaded image is large; using high-resolution category banner for Google Business Profile compatibility.'
              );
            }
          }
        };
        img.src = String(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const executePublishOfferToGoogle = async (targetData: {
    mode: 'new' | 'existing';
    existingOffer?: OfferRecord;
    title: string;
    description: string;
    discount: string;
    startDate: string;
    endDate: string;
    terms: string;
    cta: string;
    imageUrl: string;
    imagePrompt: string;
  }) => {
    const user = auth.currentUser;
    if (!user) return;

    setSaving(true);
    if (targetData.existingOffer) {
      setPublishingOfferId(targetData.existingOffer.id);
    }
    setFeedback(null);
    setGbpWarning(null);

    try {
      setOneTimePublishingApproval(true);
      setOneTimeApproved(true);
      const token = await ensureBusinessToken();
      const gbpResult = await pushOfferToGooglePage(
        {
          title: targetData.title,
          description: targetData.description,
          discount: targetData.discount,
          startDate: targetData.startDate,
          endDate: targetData.endDate,
          terms: targetData.terms,
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
        const offerRef = doc(collection(db, `stores/${store.id}/offers`));
        const path = `stores/${store.id}/offers/${offerRef.id}`;
        try {
          await setDoc(offerRef, {
            ownerId: user.uid,
            storeId: store.id,
            title: targetData.title.slice(0, 150),
            description: targetData.description.slice(0, 1200),
            discount: targetData.discount.slice(0, 60),
            startDate: targetData.startDate.slice(0, 40),
            endDate: targetData.endDate.slice(0, 40),
            terms: targetData.terms.slice(0, 500),
            cta: targetData.cta.slice(0, 60),
            imageUrl: targetData.imageUrl.slice(0, 2000),
            imagePrompt: targetData.imagePrompt.slice(0, 500),
            status: 'Active',
            gbpSyncNote: syncNote,
            ...(gbpResult.gbpLocalPostName
              ? { gbpLocalPostName: gbpResult.gbpLocalPostName.slice(0, 240) }
              : {}),
            gbpPublishedAt:
              gbpResult.publishedAt?.slice(0, 60) || new Date().toISOString(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }
        setTitle('');
        setDescription('');
      } else if (targetData.existingOffer) {
        const offerId = targetData.existingOffer.id;
        const path = `stores/${store.id}/offers/${offerId}`;
        const updatePayload: Record<string, unknown> = {
          status: 'Active',
          imageUrl: targetData.imageUrl.slice(0, 2000),
          imagePrompt: targetData.imagePrompt.slice(0, 500),
          gbpSyncNote: syncNote,
          gbpPublishedAt:
            gbpResult.publishedAt?.slice(0, 60) || new Date().toISOString(),
          updatedAt: serverTimestamp(),
        };
        if (gbpResult.gbpLocalPostName) {
          updatePayload.gbpLocalPostName = gbpResult.gbpLocalPostName.slice(0, 240);
        }
        try {
          await updateDoc(doc(db, `stores/${store.id}/offers`, offerId), updatePayload);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }
      }

      setPreviewModalData(null);
      setFeedback(
        'Promotional offer & image published live to your Google Business Profile page!'
      );
    } finally {
      setSaving(false);
      setPublishingOfferId(null);
    }
  };

  const openPublishPreviewForNewOffer = (forceModal = false) => {
    if (!title.trim() || !description.trim() || !discount.trim()) return;
    const resolvedImage = imageUrl.trim() || categoryGallery[0].url;
    setImageUrl(resolvedImage);
    const payload = {
      mode: 'new' as const,
      title: title.trim(),
      description: description.trim(),
      discount: discount.trim(),
      startDate,
      endDate,
      terms: terms.trim(),
      cta: cta.trim() || 'Claim Offer',
      imageUrl: resolvedImage,
      imagePrompt:
        imagePrompt.trim() || `Promotional offer banner for ${store.name}`,
    };
    if (!forceModal && (oneTimeApproved || hasOneTimePublishingApproval())) {
      void executePublishOfferToGoogle(payload);
    } else {
      setPreviewModalData(payload);
    }
  };

  const openPublishPreviewForExistingOffer = (
    offer: OfferRecord,
    forceModal = false
  ) => {
    const resolvedImage =
      (offer.imageUrl && offer.imageUrl.trim()) ||
      imageUrl.trim() ||
      categoryGallery[0].url;
    const payload = {
      mode: 'existing' as const,
      existingOffer: offer,
      title: offer.title,
      description: offer.description,
      discount: offer.discount,
      startDate: offer.startDate,
      endDate: offer.endDate,
      terms: offer.terms,
      cta: offer.cta || 'Claim Offer',
      imageUrl: resolvedImage,
      imagePrompt:
        offer.imagePrompt || `Promotional offer banner for ${store.name}`,
    };
    if (!forceModal && (oneTimeApproved || hasOneTimePublishingApproval())) {
      void executePublishOfferToGoogle(payload);
    } else {
      setPreviewModalData(payload);
    }
  };

  // Save Draft or Deactivated directly; Active requires Preview with Image confirmation
  const handleSaveOffer = async (targetStatus: 'Draft' | 'Active' | 'Deactivated') => {
    const user = auth.currentUser;
    if (!user || !title.trim() || !description.trim() || !discount.trim()) return;

    if (targetStatus === 'Active') {
      openPublishPreviewForNewOffer();
      return;
    }

    setSaving(true);
    setFeedback(null);
    setGbpWarning(null);
    const offerRef = doc(collection(db, `stores/${store.id}/offers`));
    const path = `stores/${store.id}/offers/${offerRef.id}`;
    const resolvedImage = (imageUrl.trim() || categoryGallery[0].url).slice(0, 2000);

    try {
      await setDoc(offerRef, {
        ownerId: user.uid,
        storeId: store.id,
        title: title.trim().slice(0, 150),
        description: description.trim().slice(0, 1200),
        discount: discount.trim().slice(0, 60),
        startDate: startDate.slice(0, 40),
        endDate: endDate.slice(0, 40),
        terms: terms.trim().slice(0, 500),
        cta: (cta.trim() || 'Claim Offer').slice(0, 60),
        imageUrl: resolvedImage,
        imagePrompt: imagePrompt.trim().slice(0, 500),
        status: targetStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle('');
      setDescription('');
      setFeedback(
        targetStatus === 'Draft'
          ? 'Offer & preview image saved as draft.'
          : 'Offer saved as deactivated.'
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
    await executePublishOfferToGoogle(previewModalData);
  };

  const handleUpdateOfferStatus = async (
    offer: OfferRecord,
    newStatus: 'Draft' | 'Active' | 'Deactivated'
  ) => {
    if (newStatus === 'Active') {
      openPublishPreviewForExistingOffer(offer);
      return;
    }
    const path = `stores/${store.id}/offers/${offer.id}`;
    try {
      await updateDoc(doc(db, `stores/${store.id}/offers`, offer.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Promotional Offers</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Create, preview with promotional imagery, and publish offers live to Google Business Profile for{' '}
          <strong className="text-slate-700">{store.name}</strong>
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
          <div className="space-y-1">
            <p className="font-semibold">{gbpWarning}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Offer Builder */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          {/* Quick AI Offer Idea */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" />
              Need an offer idea & banner for {store.category}?
            </span>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. First-time customer discount or weekday happy hour"
                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={generating}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generating ? 'Drafting...' : 'Draft Offer & Image with AI'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Offer Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekday Glow & Styling Package"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Discount / Value *
              </label>
              <input
                type="text"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="e.g. 20% OFF"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Offer Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what customers receive when they redeem this offer..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
            />
          </div>

          {/* Required Offer Banner Image Selector */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <span>
                    Offer Promotional Image ({store.category}
                    {galleryInfo.supportsGenderFocus
                      ? ` · ${
                          galleryInfo.activeFocus === 'men'
                            ? "Men's Focus"
                            : galleryInfo.activeFocus === 'women'
                            ? "Women's Focus"
                            : 'Unisex (Men & Women)'
                        }`
                      : ''}
                    ) *
                  </span>
                </label>
                {galleryInfo.supportsGenderFocus && (
                  <p className="text-[11px] text-slate-500">
                    Auto-matched to <strong className="text-slate-700">{store.businessType || store.category}</strong>. Switch audience focus below if needed:
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
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

                <label className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Curated Category Image Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {categoryGallery.map((preset) => {
                const isSelected = imageUrl === preset.url;
                return (
                  <button
                    key={preset.url}
                    type="button"
                    onClick={() => {
                      setImageUrl(preset.url);
                      setImagePrompt(`${preset.label} at ${store.name}`);
                    }}
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

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                Or Paste Public Image URL (for Google Business Profile Media API)
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                CTA Button
              </label>
              <select
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
              >
                <option value="Claim Offer">Claim Offer</option>
                <option value="Book Appointment">Book Appointment</option>
                <option value="Visit Store">Visit Store</option>
                <option value="Call to Redeem">Call to Redeem</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Terms & Conditions
            </label>
            <input
              type="text"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
            />
          </div>

          {/* Required Buttons: Deactivate, Save Draft, Preview with Image & Publish */}
          <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving || !title.trim() || !description.trim()}
              onClick={() => handleSaveOffer('Deactivated')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Deactivate</span>
            </button>

            <button
              type="button"
              disabled={saving || !title.trim() || !description.trim()}
              onClick={() => handleSaveOffer('Draft')}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Draft</span>
            </button>

            <button
              type="button"
              disabled={
                saving ||
                !title.trim() ||
                !description.trim() ||
                !discount.trim() ||
                !imageUrl.trim()
              }
              onClick={() => openPublishPreviewForNewOffer(true)}
              className="px-4 py-2.5 rounded-xl border border-[#8a6a1f] bg-[#161616] hover:bg-[#1c1c1c] text-[#f8cf6b] text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Card</span>
            </button>

            <button
              type="button"
              disabled={
                saving ||
                !title.trim() ||
                !description.trim() ||
                !discount.trim() ||
                !imageUrl.trim()
              }
              onClick={() => openPublishPreviewForNewOffer(false)}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? 'Publishing to Google...'
                  : oneTimeApproved
                  ? 'Publish Offer to Google'
                  : 'Approve Once & Publish Offer'}
              </span>
            </button>
          </div>
        </div>

        {/* Live Google Offer Card Preview with Image */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-bold text-slate-900">
              Google Business Profile Offer Preview
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
              <Tag className="w-3.5 h-3.5" />
              <span>With Image Banner</span>
            </span>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/60">
            {/* Live Promotional Image Preview */}
            <div className="relative h-48 w-full bg-slate-900 overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title || store.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                  <ImageIcon className="w-7 h-7" />
                  <span className="text-xs">Select or upload an offer image</span>
                </div>
              )}
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs border border-[#f0b429]/50 text-[11px] font-bold text-[#f8cf6b]">
                {store.name}
              </div>
              <div className="absolute bottom-3 right-3 px-3 py-1 rounded-lg bg-[#f0b429] text-[#1a1204] text-xs font-extrabold font-mono shadow-md">
                {discount || '20% OFF'}
              </div>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {title || 'Your Offer Title'}
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  {description ||
                    'Customers searching for your store on Google Search and Maps will see this visual offer card highlighted on your profile.'}
                </p>
              </div>

              <div className="text-xs text-slate-500 font-mono tabular-nums pt-2 border-t border-slate-200/70">
                Valid: {startDate} — {endDate}
              </div>

              {terms && (
                <p className="text-[11px] text-slate-400">Terms: {terms}</p>
              )}

              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                  {cta || 'Claim Offer'}
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  <span>Google Search & Maps</span>
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            A visual preview with your promotional image is verified before publishing live to your Google Business Profile page.
          </p>
        </div>
      </div>

      {/* Mandatory Pre-Publish Preview with Image Modal */}
      {previewModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161616] border border-[#2a2a2a] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl space-y-5 p-6">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#f0b429] block">
                  Mandatory Pre-Publish Verification
                </span>
                <h2 className="text-base font-bold text-white">
                  Confirm Google Offer Preview with Image
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

            {/* Full Visual Preview Card */}
            <div className="rounded-2xl border border-[#2a2a2a] overflow-hidden bg-[#111111]">
              <div className="relative h-52 w-full bg-black">
                <img
                  src={previewModalData.imageUrl}
                  alt={previewModalData.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/80 border border-[#f0b429]/50 text-xs font-bold text-[#f8cf6b]">
                  {store.name} · {store.city || 'Google Business Profile'}
                </div>
                <div className="absolute bottom-3 right-3 px-3 py-1 rounded-lg bg-[#f0b429] text-[#1a1204] text-xs font-extrabold font-mono">
                  {previewModalData.discount}
                </div>
              </div>

              <div className="p-4 space-y-2.5">
                <h3 className="text-base font-bold text-white">
                  {previewModalData.title}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {previewModalData.description}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#2a2a2a] text-[11px] text-slate-400 font-mono">
                  <span>
                    Valid: {previewModalData.startDate} to {previewModalData.endDate}
                  </span>
                  <span className="text-[#f8cf6b] font-semibold">
                    CTA: {previewModalData.cta}
                  </span>
                </div>
                {previewModalData.terms && (
                  <p className="text-[11px] text-slate-400">
                    Terms: {previewModalData.terms}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
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
                  {saving
                    ? 'Publishing to Google Page...'
                    : 'Confirm & Publish to Google Page'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Offers List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">
          All Store Offers ({offers.length})
        </h2>

        {offers.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">
            No offers created for {store.name} yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {offers.map((offer) => {
              const displayImg = offer.imageUrl || categoryGallery[0].url;
              return (
                <div
                  key={offer.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={displayImg}
                      alt={offer.title}
                      className="w-20 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`font-semibold ${
                            offer.status === 'Active'
                              ? 'text-emerald-700'
                              : offer.status === 'Draft'
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {offer.status}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {offer.discount}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {offer.startDate} to {offer.endDate}
                        </span>
                        {offer.gbpPublishedAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-semibold text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Live on Google Page</span>
                          </span>
                        ) : offer.status === 'Active' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-300">
                            <AlertCircle className="w-3 h-3" />
                            <span>
                              {offer.gbpSyncNote || 'Workspace Only · Push Live to Google'}
                            </span>
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{offer.title}</h3>
                      <p className="text-xs text-slate-600">{offer.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {offer.status !== 'Active' || !offer.gbpPublishedAt ? (
                      <button
                        type="button"
                        disabled={publishingOfferId === offer.id}
                        onClick={() => openPublishPreviewForExistingOffer(offer, false)}
                        className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>
                          {publishingOfferId === offer.id
                            ? 'Publishing...'
                            : 'Publish Live to Google'}
                        </span>
                      </button>
                    ) : null}
                    {offer.status === 'Active' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateOfferStatus(offer, 'Deactivated')}
                        className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Deactivate
                      </button>
                    )}
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
