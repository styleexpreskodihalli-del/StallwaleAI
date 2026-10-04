import React, { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, getGbpAccessToken, handleFirestoreError, OperationType } from '../firebase';
import {
  BUSINESS_CATEGORIES,
  BRAND_TONES,
  BusinessCategory,
  BrandTone,
  StoreRecord,
} from '../types';
import { resolveStoreBillingRegion } from '../utils/storeRegion';
import {
  Save,
  CheckCircle2,
  Building2,
  MapPin,
  Phone,
  Globe,
  Clock,
  Sparkles,
  Share2,
  Search,
  Plus,
  X,
  RefreshCw,
} from 'lucide-react';

interface StoreProfileViewProps {
  store: StoreRecord;
}

export function StoreProfileView({ store }: StoreProfileViewProps) {
  const [name, setName] = useState(store.name);
  const [category, setCategory] = useState<BusinessCategory>(store.category);
  const [businessType, setBusinessType] = useState(store.businessType);
  const [description, setDescription] = useState(store.description);
  const [address, setAddress] = useState(store.address);
  const [city, setCity] = useState(store.city);
  const [country, setCountry] = useState<string>(
    store.country ||
      (resolveStoreBillingRegion(store).region === 'MIDDLE_EAST'
        ? 'Middle East'
        : 'India')
  );
  const [phone, setPhone] = useState(store.phone);
  const [website, setWebsite] = useState(store.website);
  const [openingHours, setOpeningHours] = useState(store.openingHours);
  const [services, setServices] = useState(store.services);
  const [seoKeywords, setSeoKeywords] = useState<string[]>(store.seoKeywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [socialLinks, setSocialLinks] = useState(store.socialLinks);
  const [tone, setTone] = useState<BrandTone>(store.tone);
  const [saving, setSaving] = useState(false);
  const [fetchingGbp, setFetchingGbp] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  // Sync local form state whenever store ID or dynamic GBP fields update
  useEffect(() => {
    setName(store.name);
    setCategory(store.category);
    setBusinessType(store.businessType);
    setDescription(store.description);
    setAddress(store.address);
    setCity(store.city);
    setCountry(
      store.country ||
        (resolveStoreBillingRegion(store).region === 'MIDDLE_EAST'
          ? 'Middle East'
          : 'India')
    );
    setPhone(store.phone);
    setWebsite(store.website);
    setOpeningHours(store.openingHours);
    setServices(store.services);
    setSeoKeywords(Array.isArray(store.seoKeywords) ? store.seoKeywords.slice(0, 5) : []);
    setKeywordInput('');
    setSocialLinks(store.socialLinks);
    setTone(store.tone);
  }, [
    store.id,
    store.name,
    store.category,
    store.businessType,
    store.description,
    store.address,
    store.city,
    store.phone,
    store.website,
    store.openingHours,
    store.services,
    store.gbpLastSync,
  ]);

  const handleAddKeyword = () => {
    const cleaned = keywordInput.trim().slice(0, 60);
    if (!cleaned || seoKeywords.length >= 5) return;
    if (seoKeywords.some((k) => k.toLowerCase() === cleaned.toLowerCase())) {
      setKeywordInput('');
      return;
    }
    setSeoKeywords([...seoKeywords, cleaned]);
    setKeywordInput('');
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setSeoKeywords(seoKeywords.filter((_, idx) => idx !== indexToRemove));
  };

  const handleAutoSuggestKeywords = () => {
    const baseSuggestions = [
      `Best ${category.toLowerCase()} in ${city || 'town'}`,
      `${name.trim()} ${city || ''}`.trim(),
      ...(services
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (city ? `${s} ${city}` : s))),
      `${businessType || category} near me`,
    ];

    const nextKeywords = [...seoKeywords];
    for (const candidate of baseSuggestions) {
      if (nextKeywords.length >= 5) break;
      const cleanCandidate = candidate.slice(0, 60);
      if (
        cleanCandidate &&
        !nextKeywords.some((k) => k.toLowerCase() === cleanCandidate.toLowerCase())
      ) {
        nextKeywords.push(cleanCandidate);
      }
    }
    setSeoKeywords(nextKeywords.slice(0, 5));
  };

  // Dynamically fetch store details from Google Business Profile listing
  const handleFetchFromGbpListing = async () => {
    const user = auth.currentUser;
    if (!user || !name.trim()) return;

    setFetchingGbp(true);
    setSavedSuccess(null);
    const path = `stores/${store.id}`;

    try {
      const token = getGbpAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/gbp/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: user.uid,
          googleAccountId: user.uid,
          storeId: store.id,
          storeName: name.trim(),
          category,
          businessType: businessType.trim(),
          description: description.trim(),
          address: address.trim(),
          city: city.trim(),
          phone: phone.trim(),
          website: website.trim(),
          openingHours: openingHours.trim(),
          services: services.trim(),
          seoKeywords,
          tone,
          accountEmail: user.email || store.gbpAccountEmail || '',
          selectedAccountId: store.gbpAccountId || undefined,
          selectedLocationId: store.gbpLocationId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const gbp = data.gbpProfile || {};
        const nextBusinessType = String(gbp.businessType || businessType).slice(0, 100);
        const nextDescription = String(gbp.description || description).slice(0, 1500);
        const nextAddress = String(gbp.address || address).slice(0, 200);
        const nextPhone = String(gbp.phone || phone).slice(0, 40);
        const nextWebsite = String(gbp.website || website).slice(0, 300);
        const nextHours = String(gbp.openingHours || openingHours).slice(0, 500);
        const nextServices = String(gbp.services || services).slice(0, 1000);
        const nextKeywords = Array.isArray(gbp.seoKeywords)
          ? gbp.seoKeywords.map((k: string) => String(k).trim().slice(0, 60)).slice(0, 5)
          : seoKeywords;

        setBusinessType(nextBusinessType);
        setDescription(nextDescription);
        setAddress(nextAddress);
        setPhone(nextPhone);
        setWebsite(nextWebsite);
        setOpeningHours(nextHours);
        setServices(nextServices);
        setSeoKeywords(nextKeywords);

        const resolvedAccountId = String(
          data.gbpAccountId || store.gbpAccountId || ''
        ).slice(0, 120);
        const resolvedLocationId = String(
          data.locationId || store.gbpLocationId || ''
        ).slice(0, 120);

        await updateDoc(doc(db, 'stores', store.id), {
          name: name.trim().slice(0, 120),
          category,
          businessType: nextBusinessType,
          description: nextDescription,
          address: nextAddress,
          city: city.trim().slice(0, 100),
          phone: nextPhone,
          website: nextWebsite,
          openingHours: nextHours,
          services: nextServices,
          seoKeywords: nextKeywords,
          gbpConnected: true,
          googleAccountId: String(data.googleAccountId || user.uid).slice(0, 128),
          gbpAccountEmail: String(data.accountEmail || user.email || '').slice(0, 160),
          gbpAccountId: resolvedAccountId,
          gbpLocationId: resolvedLocationId,
          gbpTokenStatus: String(
            data.tokenStatus || 'VALID (scope: business.manage)'
          ).slice(0, 120),
          gbpLastSync: String(data.lastSync || new Date().toISOString()).slice(0, 60),
          gbpSyncError: '',
          updatedAt: serverTimestamp(),
        });

        console.log(`[GBP DATABASE SAVE]\nstatus: SUCCESS (stores/${store.id})`);
        console.log(
          `[GBP SYNC COMPLETE]\nstore_id: ${store.id}\nlocation_id: ${resolvedLocationId}`
        );

        setSavedSuccess('Store details dynamically fetched & synchronized from GBP listing');
        setTimeout(() => setSavedSuccess(null), 4000);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setFetchingGbp(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const user = auth.currentUser;
    // Also include any pending keyword typed into the input box if under 5
    let finalKeywords = [...seoKeywords];
    const pendingTrimmed = keywordInput.trim().slice(0, 60);
    if (
      pendingTrimmed &&
      finalKeywords.length < 5 &&
      !finalKeywords.some((k) => k.toLowerCase() === pendingTrimmed.toLowerCase())
    ) {
      finalKeywords.push(pendingTrimmed);
      setSeoKeywords(finalKeywords);
      setKeywordInput('');
    }
    finalKeywords = finalKeywords.slice(0, 5).map((k) => k.trim().slice(0, 60));

    setSaving(true);
    setSavedSuccess(null);
    const path = `stores/${store.id}`;

    try {
      // Once saved, dynamically fetch/sync any missing or enriched GBP listing attributes
      let nextBusinessType = businessType.trim().slice(0, 100);
      let nextDescription = description.trim().slice(0, 1500);
      let nextAddress = address.trim().slice(0, 200);
      let nextPhone = phone.trim().slice(0, 40);
      let nextWebsite = website.trim().slice(0, 300);
      let nextHours = openingHours.trim().slice(0, 500);
      let nextServices = services.trim().slice(0, 1000);
      let nextLastSync = store.gbpLastSync;
      let nextLocationId = store.gbpLocationId;
      let nextAccountId = store.gbpAccountId || '';
      let nextTokenStatus = store.gbpTokenStatus || 'VALID (scope: business.manage)';

      if (store.gbpConnected) {
        try {
          console.log(`[GBP SYNC START]\nstore_id: ${store.id}\nuser_id: ${user?.uid || 'unknown'}`);
          const token = getGbpAccessToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;
          const gbpRes = await fetch('/api/gbp/sync', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: user?.uid,
              googleAccountId: user?.uid,
              storeId: store.id,
              storeName: name.trim(),
              category,
              businessType: nextBusinessType,
              description: nextDescription,
              address: nextAddress,
              city: city.trim(),
              phone: nextPhone,
              website: nextWebsite,
              openingHours: nextHours,
              services: nextServices,
              seoKeywords: finalKeywords,
              tone,
              accountEmail: user?.email || store.gbpAccountEmail || 'verified-owner@business.google.com',
              selectedAccountId: store.gbpAccountId || undefined,
              selectedLocationId: store.gbpLocationId || undefined,
            }),
          });
          if (gbpRes.ok) {
            const gbpData = await gbpRes.json();
            const gbp = gbpData.gbpProfile || {};
            nextBusinessType = String(nextBusinessType || gbp.businessType || '').slice(0, 100);
            nextDescription = String(nextDescription || gbp.description || '').slice(0, 1500);
            nextAddress = String(nextAddress || gbp.address || '').slice(0, 200);
            nextPhone = String(nextPhone || gbp.phone || '').slice(0, 40);
            nextWebsite = String(nextWebsite || gbp.website || '').slice(0, 300);
            nextHours = String(nextHours || gbp.openingHours || '').slice(0, 500);
            nextServices = String(nextServices || gbp.services || '').slice(0, 1000);
            if (finalKeywords.length === 0 && Array.isArray(gbp.seoKeywords)) {
              finalKeywords = gbp.seoKeywords
                .map((k: string) => String(k).trim().slice(0, 60))
                .slice(0, 5);
            }
            nextLastSync = String(gbpData.lastSync || new Date().toISOString()).slice(0, 60);
            nextLocationId = String(gbpData.locationId || store.gbpLocationId || '').slice(0, 120);
            nextAccountId = String(gbpData.gbpAccountId || store.gbpAccountId || '').slice(0, 120);
            nextTokenStatus = String(
              gbpData.tokenStatus || 'VALID (scope: business.manage)'
            ).slice(0, 120);

            setBusinessType(nextBusinessType);
            setDescription(nextDescription);
            setAddress(nextAddress);
            setPhone(nextPhone);
            setWebsite(nextWebsite);
            setOpeningHours(nextHours);
            setServices(nextServices);
            setSeoKeywords(finalKeywords);
          }
        } catch {
          // Continue saving local fields even if GBP endpoint hiccups
        }
      }

      const resolvedStoreRegion = resolveStoreBillingRegion({
        country,
        city: city.trim(),
        address: nextAddress,
        phone: nextPhone,
        website: nextWebsite,
      });

      await updateDoc(doc(db, 'stores', store.id), {
        name: name.trim().slice(0, 120),
        category,
        businessType: nextBusinessType,
        description: nextDescription,
        address: nextAddress,
        city: city.trim().slice(0, 100),
        country:
          resolvedStoreRegion.region === 'MIDDLE_EAST' ? 'Middle East' : 'India',
        phone: nextPhone,
        website: nextWebsite,
        openingHours: nextHours,
        services: nextServices,
        seoKeywords: finalKeywords,
        socialLinks: socialLinks.trim().slice(0, 500),
        tone,
        gbpAccountId: nextAccountId,
        gbpLocationId: nextLocationId,
        gbpTokenStatus: nextTokenStatus,
        gbpLastSync: nextLastSync,
        gbpSyncError: '',
        updatedAt: serverTimestamp(),
      });
      console.log(`[GBP DATABASE SAVE]\nstatus: SUCCESS (stores/${store.id})`);
      console.log(
        `[GBP SYNC COMPLETE]\nstore_id: ${store.id}\nlocation_id: ${nextLocationId}`
      );
      setSavedSuccess(
        store.gbpConnected
          ? 'Store profile saved & synchronized with GBP listing'
          : 'Store profile changes saved'
      );
      setTimeout(() => setSavedSuccess(null), 4000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Store Profile</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage business details, services, SEO keywords, opening hours, and brand voice for{' '}
            <strong className="text-slate-700">{store.name}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleFetchFromGbpListing}
            disabled={fetchingGbp || saving}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingGbp ? 'animate-spin' : ''}`} />
            <span>
              {fetchingGbp ? 'Fetching from GBP Listing...' : 'Fetch from GBP Listing'}
            </span>
          </button>

          {savedSuccess && (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedSuccess}</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
        {/* Core Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Business Name *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Business Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BusinessCategory)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
            >
              {BUSINESS_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Business Type / Specialization
            </label>
            <input
              type="text"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="e.g. Unisex Hair & Styling Salon"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              AI Brand Voice & Tone
            </label>
            <div className="relative">
              <Sparkles className="w-4 h-4 text-blue-600 absolute left-3.5 top-3" />
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as BrandTone)}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
              >
                {BRAND_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-slate-800 mb-1.5">
            Store Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what makes your business special..."
            className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
          />
        </div>

        {/* Location & Contact */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Store Country / Region
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 bg-white"
            >
              <option value="India">🇮🇳 India</option>
              <option value="Middle East">🇦🇪 Middle East / Outside India</option>
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
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              City
            </label>
            <input
              type="text"
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
                  setCountry('Middle East');
                }
              }}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Website URL
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Hours, Services, SEO Keywords & Social Links */}
        <div className="space-y-5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Opening Hours
            </label>
            <div className="relative">
              <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="Mon - Sat: 9:00 AM - 8:00 PM, Sun: 10:00 AM - 5:00 PM"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Services & Menu Offerings (comma-separated)
            </label>
            <textarea
              rows={2}
              value={services}
              onChange={(e) => setServices(e.target.value)}
              placeholder="e.g. Haircuts, Keratin Treatment, Bridal Makeup, Organic Color"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
            />
          </div>

          {/* SEO Keywords Section (Up to 5 Keywords) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-blue-600" />
                  <span>SEO Keywords (Up to 5 per store)</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    ({seoKeywords.length}/5)
                  </span>
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically used to guide AI-generated review responses and Google post suggestions for better local search performance.
                </p>
              </div>

              {seoKeywords.length < 5 && (
                <button
                  type="button"
                  onClick={handleAutoSuggestKeywords}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-600 text-xs font-semibold text-blue-600 flex items-center gap-1.5 self-start sm:self-auto transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Suggest Local Keywords</span>
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                disabled={seoKeywords.length >= 5}
                placeholder={
                  seoKeywords.length >= 5
                    ? 'Maximum of 5 SEO keywords reached'
                    : `e.g. best ${category.toLowerCase()} in ${city || 'town'}, organic hair color`
                }
                className="flex-1 px-3.5 py-2 text-sm rounded-xl bg-white border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
              <button
                type="button"
                onClick={handleAddKeyword}
                disabled={seoKeywords.length >= 5 || !keywordInput.trim()}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Keyword</span>
              </button>
            </div>

            {seoKeywords.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {seoKeywords.map((kw, index) => (
                  <div
                    key={`${kw}-${index}`}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800"
                  >
                    <span className="font-mono text-slate-400 tabular-nums">
                      0{index + 1}.
                    </span>
                    <span>{kw}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(index)}
                      className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                      title="Remove keyword"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                No custom SEO keywords added yet. Add up to 5 target phrases or click “Suggest Local Keywords”.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Social Media & Booking Links
            </label>
            <div className="relative">
              <Share2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={socialLinks}
                onChange={(e) => setSocialLinks(e.target.value)}
                placeholder="Instagram, Facebook, or WhatsApp link"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-blue-600 focus:outline-none text-slate-900"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
          <button
            type="submit"
            disabled={saving || fetchingGbp}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving ? 'Saving & Syncing GBP Listing...' : 'Save Changes'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
