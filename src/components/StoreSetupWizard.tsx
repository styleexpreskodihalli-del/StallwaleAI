import React, { useState } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, getGbpAccessToken, handleFirestoreError, OperationType } from '../firebase';
import {
  BUSINESS_CATEGORIES,
  BusinessCategory,
  StoreRecord,
  ReviewSentiment,
} from '../types';
import { analyzeReviewSentiment } from '../scoreUtils';
import { resolveStoreBillingRegion } from '../utils/storeRegion';
import { StallwaleLogo } from './StallwaleLogo';
import {
  Store,
  CheckCircle2,
  MapPin,
  Phone,
  Globe,
  Building2,
  Sparkles,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';

interface StoreSetupWizardProps {
  onStoreCreated: (storeId: string) => void;
  onCancel?: () => void;
  hasExistingStores: boolean;
}

const CATEGORY_PRESETS: Record<
  BusinessCategory,
  { businessType: string; services: string; description: string }
> = {
  Salon: {
    businessType: 'Unisex Hair & Styling Salon',
    services: 'Haircuts & Styling, Hair Coloring, Keratin Treatment, Bridal Makeup, Head Massage',
    description:
      'Modern neighborhood hair and styling salon offering personalized haircuts, organic color treatments, and bridal grooming.',
  },
  Restaurant: {
    businessType: 'Family Dining & Takeaway Restaurant',
    services: 'Dine-In, Express Takeaway, Family Platters, Catering, Chef Specials',
    description:
      'Freshly prepared local dishes made with seasonal ingredients in a warm, family-friendly dining room.',
  },
  'Beauty & Spa': {
    businessType: 'Wellness Spa & Skin Clinic',
    services: 'HydraFacial, Deep Tissue Massage, Aromatherapy, Manicure & Pedicure, Waxing',
    description:
      'Relaxing day spa and skincare studio dedicated to holistic wellness and rejuvenating treatments.',
  },
  'Retail Store': {
    businessType: 'Local Specialty Retail Shop',
    services: 'In-Store Shopping, Same-Day Local Delivery, Gift Wrapping, Custom Orders',
    description:
      'Curated local retail store providing quality everyday essentials and friendly neighborhood service.',
  },
  'Clothing Store': {
    businessType: 'Apparel & Fashion Boutique',
    services: 'Custom Tailoring, Ready-to-Wear Collections, Personal Styling, Alterations',
    description:
      'Contemporary clothing boutique featuring curated seasonal fashion, ethnic wear, and custom fitting.',
  },
  'Grocery Store': {
    businessType: 'Fresh Produce & Daily Supermarket',
    services: 'Farm-Fresh Produce, Organic Groceries, Home Delivery, Bulk Pantry Staples',
    description:
      'Neighborhood supermarket stocked daily with fresh vegetables, dairy, organic grains, and household goods.',
  },
  Cafe: {
    businessType: 'Specialty Coffee & Artisanal Bakery',
    services: 'Specialty Espresso, Fresh Croissants, All-Day Breakfast, Free Wi-Fi, Takeout',
    description:
      'Cozy neighborhood cafe serving freshly roasted specialty coffee, handmade pastries, and light brunch.',
  },
  Hotel: {
    businessType: 'Boutique Business & Leisure Hotel',
    services: 'Deluxe Rooms, 24/7 Front Desk, Airport Transfers, Complimentary Breakfast, Conference Hall',
    description:
      'Comfortable boutique hotel offering modern rooms, attentive hospitality, and convenient city access.',
  },
  Preschool: {
    businessType: 'Early Childhood Learning Center',
    services: 'Playgroup, Nursery, Kindergarten, Daycare, Sensory & Art Activities',
    description:
      'Safe, nurturing preschool environment focused on play-based early learning and child development.',
  },
  School: {
    businessType: 'K-12 Educational Institution',
    services: 'Primary Education, STEM Labs, Sports Coaching, Arts & Music, Student Counseling',
    description:
      'Student-centered school committed to academic excellence, character building, and holistic growth.',
  },
  'Professional Service': {
    businessType: 'Local Consulting & Professional Firm',
    services: '1-on-1 Consultations, Tax & Accounting, Legal Advisory, Document Processing',
    description:
      'Trusted local professional practice delivering clear advice and reliable service for individuals and businesses.',
  },
  Other: {
    businessType: 'Local Community Business',
    services: 'In-Person Consultation, Custom Packages, Customer Support, Local Service',
    description:
      'Dedicated local business serving our community with dependable quality and personal care.',
  },
};

export function StoreSetupWizard({
  onStoreCreated,
  onCancel,
  hasExistingStores,
}: StoreSetupWizardProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<BusinessCategory>('Salon');
  const [businessType, setBusinessType] = useState(CATEGORY_PRESETS['Salon'].businessType);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState<'India' | 'Middle East (UAE / GCC)'>('India');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [connectGbpNow, setConnectGbpNow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCategoryChange = (newCat: BusinessCategory) => {
    setCategory(newCat);
    setBusinessType(CATEGORY_PRESETS[newCat].businessType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const user = auth.currentUser;
    if (!user) {
      setErrorMsg('You must be signed in to create a store.');
      return;
    }

    if (!name.trim() || !city.trim()) {
      setErrorMsg('Please enter your store name and city.');
      return;
    }

    setSubmitting(true);
    const storeRef = doc(collection(db, 'stores'));
    const storeId = storeRef.id;
    const preset = CATEGORY_PRESETS[category];

    try {
      let gbpData = {
        gbpConnected: false,
        googleAccountId: '',
        gbpAccountEmail: '',
        gbpAccountId: '',
        gbpLocationId: '',
        gbpTokenStatus: '',
        gbpLastSync: '',
        gbpProfile: null as null | {
          businessType?: string;
          description?: string;
          address?: string;
          phone?: string;
          website?: string;
          openingHours?: string;
          services?: string;
          seoKeywords?: string[];
        },
        sampleReviews: [] as Array<{
          customerName: string;
          rating: number;
          reviewText: string;
          reviewDate: string;
          sentiment?: ReviewSentiment;
          replyText?: string;
          gbpReviewName?: string;
          existingOwnerReply?: string;
        }>,
      };

      if (connectGbpNow) {
        try {
          console.log(`[GBP SYNC START]\nstore_id: ${storeId}\nuser_id: ${user.uid}`);
          const token = getGbpAccessToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const res = await fetch('/api/gbp/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: user.uid,
              googleAccountId: user.uid,
              storeId,
              storeName: name.trim(),
              category,
              businessType: businessType.trim(),
              address: address.trim(),
              city: city.trim(),
              phone: phone.trim(),
              website: website.trim(),
              services: preset.services,
              tone: 'Warm & Friendly',
              accountEmail: user.email || 'owner@business.google.com',
            }),
          });
          if (res.ok) {
            const syncResult = await res.json();
            gbpData = {
              gbpConnected: true,
              googleAccountId: String(syncResult.googleAccountId || user.uid).slice(0, 128),
              gbpAccountEmail: String(syncResult.accountEmail || user.email || '').slice(0, 160),
              gbpAccountId: String(syncResult.gbpAccountId || '').slice(0, 120),
              gbpLocationId: String(syncResult.locationId || '').slice(0, 120),
              gbpTokenStatus: String(syncResult.tokenStatus || 'VALID (scope: business.manage)').slice(0, 120),
              gbpLastSync: String(syncResult.lastSync || new Date().toISOString()).slice(0, 60),
              gbpProfile: syncResult.gbpProfile || null,
              sampleReviews: syncResult.sampleReviews || [],
            };
          }
        } catch {
          // Fallback if network hiccup
        }
      }

      const defaultSeoKeywords = [
        `Best ${category.toLowerCase()} in ${city.trim()}`,
        `${name.trim()} ${city.trim()}`,
        ...preset.services
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
          .map((s) => `${s} ${city.trim()}`),
      ]
        .map((k) => k.slice(0, 60))
        .slice(0, 5);

      const resolvedSeoKeywords =
        Array.isArray(gbpData.gbpProfile?.seoKeywords) &&
        gbpData.gbpProfile!.seoKeywords!.length > 0
          ? gbpData.gbpProfile!.seoKeywords!.map((k) => String(k).slice(0, 60)).slice(0, 5)
          : defaultSeoKeywords;

      const resolvedRegion = resolveStoreBillingRegion({
        country,
        city,
        address,
        phone,
        website,
      });

      const payload: Omit<StoreRecord, 'id'> = {
        ownerId: user.uid,
        name: name.trim().slice(0, 120),
        category,
        businessType: (
          businessType.trim() ||
          gbpData.gbpProfile?.businessType ||
          preset.businessType
        ).slice(0, 100),
        description: (
          gbpData.gbpProfile?.description ||
          preset.description
        ).slice(0, 1500),
        address: (address.trim() || gbpData.gbpProfile?.address || '').slice(0, 200),
        city: city.trim().slice(0, 100),
        country: resolvedRegion.region === 'MIDDLE_EAST' ? 'Middle East' : 'India',
        phone: (phone.trim() || gbpData.gbpProfile?.phone || '').slice(0, 40),
        website: (website.trim() || gbpData.gbpProfile?.website || '').slice(0, 300),
        openingHours: (
          gbpData.gbpProfile?.openingHours ||
          'Mon - Sat: 9:00 AM - 8:00 PM, Sun: 10:00 AM - 5:00 PM'
        ).slice(0, 500),
        services: (gbpData.gbpProfile?.services || preset.services).slice(0, 1000),
        seoKeywords: resolvedSeoKeywords,
        socialLinks: '',
        tone: 'Warm & Friendly',
        gbpConnected: gbpData.gbpConnected,
        googleAccountId: gbpData.googleAccountId || user.uid,
        gbpAccountEmail: gbpData.gbpAccountEmail,
        gbpAccountId: gbpData.gbpAccountId,
        gbpLocationId: gbpData.gbpLocationId,
        gbpTokenStatus: gbpData.gbpTokenStatus,
        gbpLastSync: gbpData.gbpLastSync,
        gbpSyncError: '',
        autoDailyPosts: true,
        autoReviewReplies: true,
        autoOfferReminders: true,
        autoProfileMonitoring: true,
        autoScoreMonitoring: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(storeRef, payload);
      if (gbpData.gbpConnected) {
        console.log(`[GBP DATABASE SAVE]\nstatus: SUCCESS (stores/${storeId})`);
        console.log(
          `[GBP SYNC COMPLETE]\nstore_id: ${storeId}\nlocation_id: ${gbpData.gbpLocationId}`
        );
      }

      // Immediately store fetched Google reviews and start acting with polite, SEO-improved responses
      if (gbpData.gbpConnected && gbpData.sampleReviews.length > 0) {
        for (const rev of gbpData.sampleReviews) {
          const revRef = doc(collection(db, `stores/${storeId}/reviews`));
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
            storeId,
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
              ? {
                  gbpReplySyncedAt: new Date().toISOString().slice(0, 60),
                  gbpSyncNote: 'Published live to Google Business Profile page',
                }
              : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

      onStoreCreated(storeId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `stores/${storeId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-6">
          <StallwaleLogo size="md" />
          {hasExistingStores && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to my stores</span>
            </button>
          )}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
          <div className="mb-6">
            <p className="text-xs font-semibold text-blue-600 mb-1">
              Store Onboarding
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              Let’s set up your store
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Enter your business details below. Your business category personalizes your AI posts, review responses, and Digital Score benchmarks.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Store Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Store / Business Name *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aura Hair & Beauty Lounge"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>
            </div>

            {/* Business Category Grid */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Business Category *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {BUSINESS_CATEGORIES.map((cat) => {
                  const active = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategoryChange(cat)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-medium text-left border transition-colors cursor-pointer whitespace-nowrap truncate ${
                        active
                          ? 'bg-blue-50 border-blue-600 text-blue-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Business Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                Business Type / Specialization
              </label>
              <input
                type="text"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="e.g. Unisex Hair & Bridal Salon"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>

            {/* Store Country / Region & City */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Store Country / Region *
                </label>
                <select
                  value={country}
                  onChange={(e) =>
                    setCountry(e.target.value as 'India' | 'Middle East (UAE / GCC)')
                  }
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
                >
                  <option value="India">🇮🇳 India</option>
                  <option value="Middle East (UAE / GCC)">
                    🇦🇪 Middle East / Outside India
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Street Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAddress(val);
                      const detected = resolveStoreBillingRegion({
                        city,
                        address: val,
                        phone,
                      });
                      if (detected.region === 'MIDDLE_EAST') {
                        setCountry('Middle East (UAE / GCC)');
                      }
                    }}
                    placeholder="142 Main Street, Suite 2"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCity(val);
                    const detected = resolveStoreBillingRegion({
                      city: val,
                      address,
                      phone,
                    });
                    if (detected.region === 'MIDDLE_EAST') {
                      setCountry('Middle East (UAE / GCC)');
                    } else if (val.trim().length > 2) {
                      setCountry('India');
                    }
                  }}
                  placeholder="e.g. Bengaluru or Dubai"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                />
              </div>
            </div>

            {/* Phone & Website */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 234-5678"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  Website (Optional)
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://yourstore.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Google Business Profile Connection Option */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Google Business Profile Connection
                    </span>
                    <span className="text-xs text-emerald-700 font-medium">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Link your store’s Google Business Profile immediately to sync customer reviews, publish daily updates, and calculate your live Digital Score.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setConnectGbpNow(!connectGbpNow)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer whitespace-nowrap ${
                    connectGbpNow
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {connectGbpNow ? 'Connected ✓' : 'Connect Later'}
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              {hasExistingStores && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                <span>{submitting ? 'Setting up your store...' : 'Launch Store Workspace'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        <footer className="mt-8 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#f0b429]">Stallwale.in</span>
            <span aria-hidden="true">·</span>
            <span>Copyright © {new Date().getFullYear()} Stallwale.in. All rights reserved.</span>
          </div>
          <span className="tracking-wider uppercase text-[11px] text-slate-400">
            DISCOVER <span className="text-[#f0b429] mx-1">•</span> CONNECT{' '}
            <span className="text-[#f0b429] mx-1">•</span> GROW
          </span>
        </footer>
      </div>
    </div>
  );
}
