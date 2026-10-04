/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { auth, db, getGbpAccessToken, setGbpAccessToken, handleFirestoreError, OperationType } from './firebase';
import {
  StoreRecord,
  PostRecord,
  OfferRecord,
  ReviewRecord,
  WorkspaceTab,
  SubscriptionRecord,
} from './types';
import { LoginScreen } from './components/LoginScreen';
import { StallwaleLogo } from './components/StallwaleLogo';
import { calculateDigitalScore, getStoreGbpRating } from './scoreUtils';
import { runFullStoreAutoImprovement } from './utils/autoImproveEngine';
import { StoreSetupWizard } from './components/StoreSetupWizard';
import { StoreSelector } from './components/StoreSelector';
import { DashboardView } from './components/DashboardView';
import { StoreProfileView } from './components/StoreProfileView';
import { PostsView } from './components/PostsView';
import { OffersView } from './components/OffersView';
import { ReviewsView } from './components/ReviewsView';
import { DigitalScoreView } from './components/DigitalScoreView';
import { AutomationCenterView } from './components/AutomationCenterView';
import { GoogleProfileView } from './components/GoogleProfileView';
import { AnalyticsView, SettingsView } from './components/AnalyticsAndSettingsView';
import { AdminTrialReportView } from './components/AdminTrialReportView';
import {
  TrialExpiryUpgradeModal,
  TrialStatusDashboardWidget,
} from './components/SubscriptionBannerAndModal';
import { resolveStoreBillingRegion } from './utils/storeRegion';
import {
  Store,
  LayoutDashboard,
  Building2,
  Megaphone,
  Tag,
  MessageSquare,
  Gauge,
  Globe,
  Zap,
  BarChart3,
  Settings,
  ShieldCheck,
  ChevronDown,
  Plus,
  LogOut,
  Check,
} from 'lucide-react';

const ACTIVE_STORE_STORAGE_KEY = 'store_automation_selected_store_id';
const AUTHORIZED_ADMIN_EMAILS = new Set([
  'jackkurian044@gmail.com',
  'styleexpreskodihalli@gmail.com',
]);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(
    null
  );
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [creditBlockedMessage, setCreditBlockedMessage] = useState<
    string | null
  >(null);

  // Listen for real-time server credit updates and 402 credit-gate blocks
  useEffect(() => {
    const handleSubUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ subscription?: SubscriptionRecord }>;
      if (custom.detail?.subscription) {
        setSubscription(custom.detail.subscription);
      }
    };
    const handleCreditBlocked = (e: Event) => {
      const custom = e as CustomEvent<{
        message?: string;
        subscription?: SubscriptionRecord;
      }>;
      if (custom.detail?.subscription) {
        setSubscription(custom.detail.subscription);
      }
      setCreditBlockedMessage(
        custom.detail?.message ||
          'Your 50 trial credits have been used. Upgrade to continue using AI-powered STall features.'
      );
      setUpgradeModalOpen(true);
    };

    const handleOpenAdmin = () => {
      setActiveTab('admin');
    };

    window.addEventListener('stallwale-subscription-updated', handleSubUpdated);
    window.addEventListener(
      'stallwale-credit-gate-blocked',
      handleCreditBlocked
    );
    window.addEventListener('stallwale-open-admin-report', handleOpenAdmin);
    return () => {
      window.removeEventListener(
        'stallwale-subscription-updated',
        handleSubUpdated
      );
      window.removeEventListener(
        'stallwale-credit-gate-blocked',
        handleCreditBlocked
      );
      window.removeEventListener(
        'stallwale-open-admin-report',
        handleOpenAdmin
      );
    };
  }, []);

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_STORE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [isCreatingStore, setIsCreatingStore] = useState(false);
  const [isSelectingStoreScreen, setIsSelectingStoreScreen] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [topBarAutoImproving, setTopBarAutoImproving] = useState(false);

  // Store-scoped subcollections
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [reviewsLoadedForStore, setReviewsLoadedForStore] = useState<string | null>(null);
  const autoSyncedStoresRef = useRef<Set<string>>(new Set());

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setGbpAccessToken(null);
        setStores([]);
        setStoresLoaded(false);
        setSubscription(null);
        setSubscriptionLoaded(false);
        setSelectedStoreId(null);
      }
    });
    return () => unsub();
  }, []);

  // 2. Load User's Stores (Multi-Tenant filtered strictly by ownerId == user.uid)
  useEffect(() => {
    if (!authReady || !user) return;

    const q = query(collection(db, 'stores'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: StoreRecord[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<StoreRecord, 'id'>),
        }));
        setStores(list);
        setStoresLoaded(true);

        if (list.length === 1) {
          // Returning user with 1 store: automatically open their Store Dashboard
          setSelectedStoreId(list[0].id);
          try {
            localStorage.setItem(ACTIVE_STORE_STORAGE_KEY, list[0].id);
          } catch {
            // ignore storage errors
          }
        } else if (list.length > 1) {
          // Check if current selectedStoreId belongs to this user's stores
          const validSaved = list.find((s) => s.id === selectedStoreId);
          if (!validSaved) {
            setSelectedStoreId(null);
            setIsSelectingStoreScreen(true);
          }
        } else {
          setSelectedStoreId(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'stores');
      }
    );

    return () => unsub();
  }, [authReady, user]);

  // 2b. Verify Backend Subscription Status (Never trust client time or localStorage)
  // Automatically resolves All India (₹499 INR) vs All Middle East (60 AED) from the active store's location
  useEffect(() => {
    if (!authReady || !user || !storesLoaded) return;

    const currentStore =
      stores.find((s) => s.id === selectedStoreId) || stores[0] || null;
    const resolvedRegion = resolveStoreBillingRegion(currentStore);

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/subscription/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            email: user.email || '',
            userName: user.displayName || undefined,
            storeName: currentStore?.name || undefined,
            hasExistingStores: stores.length > 0,
            accountCreatedAtIso: user.metadata?.creationTime || undefined,
            preferredCurrency: currentStore ? resolvedRegion.currency : undefined,
            storeCountry: currentStore?.country || undefined,
            storeCity: currentStore?.city || undefined,
            storeAddress: currentStore?.address || undefined,
            storePhone: currentStore?.phone || undefined,
          }),
        });
        if (res.ok && !cancelled) {
          const data = (await res.json()) as SubscriptionRecord;
          setSubscription(data);
        }
      } catch {
        // Ignore transient network errors
      } finally {
        if (!cancelled) {
          setSubscriptionLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    user,
    storesLoaded,
    stores,
    selectedStoreId,
  ]);

  // 3. Load Active Store's Posts, Offers, and Reviews Subcollections
  useEffect(() => {
    if (!authReady || !user || !selectedStoreId) {
      setPosts([]);
      setOffers([]);
      setReviews([]);
      return;
    }

    const postsQuery = query(
      collection(db, `stores/${selectedStoreId}/posts`),
      where('ownerId', '==', user.uid)
    );
    const offersQuery = query(
      collection(db, `stores/${selectedStoreId}/offers`),
      where('ownerId', '==', user.uid)
    );
    const reviewsQuery = query(
      collection(db, `stores/${selectedStoreId}/reviews`),
      where('ownerId', '==', user.uid)
    );

    const unsubPosts = onSnapshot(
      postsQuery,
      (snap) => {
        setPosts(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<PostRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `stores/${selectedStoreId}/posts`)
    );

    const unsubOffers = onSnapshot(
      offersQuery,
      (snap) => {
        setOffers(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<OfferRecord, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `stores/${selectedStoreId}/offers`)
    );

    const unsubReviews = onSnapshot(
      reviewsQuery,
      (snap) => {
        setReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ReviewRecord, 'id'>),
          }))
        );
        setReviewsLoadedForStore(selectedStoreId);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `stores/${selectedStoreId}/reviews`)
    );

    return () => {
      unsubPosts();
      unsubOffers();
      unsubReviews();
    };
  }, [authReady, user, selectedStoreId]);

  // 4. Automatic GBP Synchronization for Connected Store
  useEffect(() => {
    if (!authReady || !user || !selectedStoreId) return;
    if (reviewsLoadedForStore !== selectedStoreId) return;

    const currentStore = stores.find((s) => s.id === selectedStoreId);
    if (!currentStore || !currentStore.gbpConnected) return;

    const sessionToken = getGbpAccessToken();
    if (!sessionToken) return;

    // If connected store has 0 synced reviews and hasn't run initial auto-sync in this session
    if (reviews.length === 0 && !autoSyncedStoresRef.current.has(selectedStoreId)) {
      autoSyncedStoresRef.current.add(selectedStoreId);
      (async () => {
        try {
          console.log(`[GBP SYNC START]\nstore_id: ${currentStore.id}\nuser_id: ${user.uid}`);
          const res = await fetch('/api/gbp/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
              userId: user.uid,
              googleAccountId: user.uid,
              storeId: currentStore.id,
              storeName: currentStore.name,
              category: currentStore.category,
              address: currentStore.address,
              city: currentStore.city,
              phone: currentStore.phone,
              website: currentStore.website,
              openingHours: currentStore.openingHours,
              services: currentStore.services,
              seoKeywords: currentStore.seoKeywords || [],
              tone: currentStore.tone,
              accountEmail: user.email || currentStore.gbpAccountEmail || 'verified-owner@business.google.com',
              selectedAccountId: currentStore.gbpAccountId || undefined,
              selectedLocationId: currentStore.gbpLocationId || undefined,
              existingReviewerNames: [],
            }),
          });
          if (!res.ok) return;
          const data = await res.json();

          const gbp = data.gbpProfile || {};
          const resolvedLocId = String(data.locationId || currentStore.gbpLocationId || '').slice(0, 120);
          await updateDoc(doc(db, 'stores', currentStore.id), {
            businessType: String(currentStore.businessType || gbp.businessType || '').slice(0, 100),
            description: String(gbp.description || currentStore.description || '').slice(0, 1500),
            address: String(currentStore.address || gbp.address || '').slice(0, 200),
            phone: String(currentStore.phone || gbp.phone || '').slice(0, 40),
            website: String(currentStore.website || gbp.website || '').slice(0, 300),
            openingHours: String(gbp.openingHours || currentStore.openingHours || '').slice(0, 500),
            services: String(gbp.services || currentStore.services || '').slice(0, 1000),
            seoKeywords: (
              Array.isArray(currentStore.seoKeywords) && currentStore.seoKeywords.length > 0
                ? currentStore.seoKeywords
                : Array.isArray(gbp.seoKeywords)
                ? gbp.seoKeywords
                : []
            )
              .map((k: string) => String(k).trim().slice(0, 60))
              .slice(0, 5),
            gbpConnected: true,
            googleAccountId: String(data.googleAccountId || user.uid).slice(0, 128),
            gbpAccountEmail: String(data.accountEmail || user.email || '').slice(0, 160),
            gbpAccountId: String(data.gbpAccountId || currentStore.gbpAccountId || '').slice(0, 120),
            gbpLocationId: resolvedLocId,
            gbpTokenStatus: String(data.tokenStatus || 'VALID (scope: business.manage)').slice(0, 120),
            gbpLastSync: String(data.lastSync || new Date().toISOString()).slice(0, 60),
            gbpSyncError: '',
            updatedAt: serverTimestamp(),
          });
          console.log(`[GBP DATABASE SAVE]\nstatus: SUCCESS`);
          console.log(`[GBP SYNC COMPLETE]\nstore_id: ${currentStore.id}\nlocation_id: ${resolvedLocId}`);

          if (Array.isArray(data.sampleReviews)) {
            for (const rev of data.sampleReviews) {
              const revRef = doc(collection(db, `stores/${currentStore.id}/reviews`));
              const preparedReply = String(rev.replyText || '').trim().slice(0, 2000);
              await setDoc(revRef, {
                ownerId: user.uid,
                storeId: currentStore.id,
                customerName: rev.customerName.slice(0, 100),
                rating: rev.rating,
                reviewText: rev.reviewText.slice(0, 2000),
                reviewDate: rev.reviewDate.slice(0, 60),
                replyText: preparedReply,
                responseStatus: preparedReply ? 'Draft Saved' : 'Needs Response',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          }
        } catch {
          // Ignore background sync error
        }
      })();
    }
  }, [authReady, user, selectedStoreId, reviewsLoadedForStore, reviews.length, stores]);

  const handleSelectStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    setIsSelectingStoreScreen(false);
    setIsCreatingStore(false);
    setSwitcherOpen(false);
    try {
      localStorage.setItem(ACTIVE_STORE_STORAGE_KEY, storeId);
    } catch {
      // ignore
    }
  };

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    setSwitcherOpen(false);
    try {
      localStorage.removeItem(ACTIVE_STORE_STORAGE_KEY);
    } catch {
      // ignore
    }
    await signOut(auth);
  };

  // Loading Skeleton
  if (!authReady || (user && (!storesLoaded || !subscriptionLoaded))) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
          <div className="animate-pulse">
            <StallwaleLogo size="md" showText={false} />
          </div>
          <span>Loading STallwale.in Workspace...</span>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated -> First Screen: STore Automation Login
  if (!user) {
    return <LoginScreen />;
  }

  // 2. New User (0 stores) OR Explicitly Creating Another Store -> Store Setup Wizard
  if (stores.length === 0 || isCreatingStore) {
    return (
      <StoreSetupWizard
        hasExistingStores={stores.length > 0}
        onCancel={() => setIsCreatingStore(false)}
        onStoreCreated={(newStoreId) => {
          handleSelectStore(newStoreId);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const activeStore = stores.find((s) => s.id === selectedStoreId);

  // 3. Returning User with Multiple Stores (or clicked "Select your store")
  if (!activeStore || isSelectingStoreScreen) {
    return (
      <StoreSelector
        stores={stores}
        userEmail={user.email}
        onSelectStore={(storeId) => handleSelectStore(storeId)}
        onAddAnotherStore={() => {
          setIsSelectingStoreScreen(false);
          setIsCreatingStore(true);
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  // 4. Active Store Workspace (Sidebar on Desktop + Bottom Nav on Mobile)
  const pendingReviewsCount = reviews.filter(
    (r) => r.responseStatus !== 'Replied'
  ).length;
  const publishedPostsCount = posts.filter((p) => p.status === 'Published').length;
  const activeOffersCount = offers.filter((o) => o.status === 'Active').length;
  const liveScoreSummary = calculateDigitalScore(activeStore, posts, offers, reviews);
  const liveGbpRating = getStoreGbpRating(activeStore);

  const isAuthorizedAdmin = Boolean(
    user.email && AUTHORIZED_ADMIN_EMAILS.has(user.email.trim().toLowerCase())
  );

  // Ordered strictly by Store Owner Daily Priority
  const navItems: Array<{
    id: WorkspaceTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    group: 'priority' | 'management';
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      shortLabel: 'Home',
      icon: LayoutDashboard,
      group: 'priority',
    },
    {
      id: 'reviews',
      label: 'Reviews Inbox',
      shortLabel: 'Reviews',
      icon: MessageSquare,
      badge: pendingReviewsCount > 0 ? String(pendingReviewsCount) : undefined,
      group: 'priority',
    },
    {
      id: 'posts',
      label: 'Daily Posts',
      shortLabel: 'Posts',
      icon: Megaphone,
      badge: publishedPostsCount > 0 ? String(publishedPostsCount) : undefined,
      group: 'priority',
    },
    {
      id: 'offers',
      label: 'Store Offers',
      shortLabel: 'Offers',
      icon: Tag,
      badge: activeOffersCount > 0 ? String(activeOffersCount) : undefined,
      group: 'priority',
    },
    {
      id: 'google',
      label: 'Google Profile',
      shortLabel: 'GBP',
      icon: Globe,
      group: 'priority',
    },
    {
      id: 'score',
      label: 'Digital Score',
      shortLabel: 'Score',
      icon: Gauge,
      badge: `${liveScoreSummary.overallScore}/100`,
      group: 'priority',
    },
    {
      id: 'profile',
      label: 'Store Profile',
      shortLabel: 'Profile',
      icon: Building2,
      group: 'management',
    },
    {
      id: 'automation',
      label: 'Automation',
      shortLabel: 'Auto',
      icon: Zap,
      group: 'management',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      shortLabel: 'Stats',
      icon: BarChart3,
      group: 'management',
    },
    {
      id: 'settings',
      label: 'Settings',
      shortLabel: 'Settings',
      icon: Settings,
      group: 'management',
    },
    ...(isAuthorizedAdmin
      ? [
          {
            id: 'admin' as WorkspaceTab,
            label: 'STall Admin',
            shortLabel: 'Admin',
            icon: ShieldCheck,
            badge: 'REPORT',
            group: 'management' as const,
          },
        ]
      : []),
  ];

  const priorityNavItems = navItems.filter((item) => item.group === 'priority');
  const managementNavItems = navItems.filter(
    (item) => item.group === 'management'
  );
  const mobileBottomNavItems = priorityNavItems.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (Store Switcher & Desktop Quick Priority Actions) — Zone 3 (Account Action) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-2.5 sm:px-6 min-h-[64px] py-2 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Zone 1: Official STallwale.in Logo & Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center cursor-pointer whitespace-nowrap shrink-0"
        >
          <div className="sm:hidden">
            <StallwaleLogo size="sm" variant="icon" />
          </div>
          <div className="hidden sm:block">
            <StallwaleLogo size="md" />
          </div>
        </button>

        {/* Zone 2: Current Store Switcher + Desktop Priority Action Shortcuts */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 justify-center">
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => {
                setSwitcherOpen(!switcherOpen);
                setProfileMenuOpen(false);
              }}
              className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/70 text-xs font-semibold text-slate-900 flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
            >
              <Store className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="truncate max-w-[90px] xs:max-w-[120px] sm:max-w-[200px]">
                {activeStore.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {switcherOpen && (
              <div className="absolute left-0 sm:left-1/2 sm:-translate-x-1/2 mt-2 w-64 sm:w-72 bg-white rounded-2xl border border-slate-200 shadow-lg p-2 z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Switch Store Workspace ({stores.length})
                  </span>
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {stores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectStore(s.id)}
                      className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {s.name}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {s.category} · {s.city || 'Local'}
                        </p>
                      </div>
                      {s.id === activeStore.id && (
                        <Check className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="pt-1 mt-1 border-t border-slate-100 space-y-1">
                  {stores.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSwitcherOpen(false);
                        setIsSelectingStoreScreen(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 text-left cursor-pointer"
                    >
                      View All Stores Screen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSwitcherOpen(false);
                      setIsCreatingStore(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add another store</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Always-Visible Top-of-Screen Store Digital Score Pill */}
          <button
            type="button"
            onClick={() => setActiveTab('score')}
            title="View & Improve Store Digital Score"
            className="min-h-[38px] sm:min-h-[40px] px-2 sm:px-3.5 py-1.5 rounded-xl border border-[#8a6a1f] bg-[#161616] hover:border-[#f0b429] text-xs font-semibold flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap transition-colors shrink-0"
          >
            <Gauge className="w-3.5 h-3.5 text-[#f0b429] shrink-0" />
            <span className="hidden md:inline text-slate-300">Digital Score:</span>
            <span className="font-mono font-extrabold text-[#f8cf6b] tabular-nums text-[11px] sm:text-xs">
              {liveScoreSummary.overallScore}/100
            </span>
          </button>

          {/* Desktop Top Priority Shortcuts */}
          <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('reviews')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-600 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Reviews{pendingReviewsCount > 0 ? ` (${pendingReviewsCount})` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-600 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Megaphone className="w-3.5 h-3.5 text-blue-600" />
              <span>+ Daily Post</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('offers')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-600 text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
            >
              <Tag className="w-3.5 h-3.5 text-blue-600" />
              <span>+ Store Offer</span>
            </button>
          </div>
        </div>

        {/* Zone 3: Profile / Account & Logout Menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setProfileMenuOpen(!profileMenuOpen);
              setSwitcherOpen(false);
            }}
            className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span className="hidden sm:inline truncate max-w-[140px]">
              {user.displayName || user.email || 'Account'}
            </span>
            <LogOut className="w-3.5 h-3.5 text-slate-500 sm:hidden" />
            <span className="sm:hidden text-[11px] font-bold">Account</span>
            <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
          </button>

          {profileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl border border-slate-200 shadow-lg p-2 z-50">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user.displayName || 'Store Owner'}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setIsCreatingStore(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>Add another store</span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-3 py-2 rounded-xl text-left text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Layout: Desktop Sidebar + Main Viewport */}
      <div className="flex-1 flex">
        {/* Desktop Sidebar Grouped by Store Owner Priority */}
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 p-4 justify-between shrink-0">
          <div className="space-y-5">
            <div>
              <p className="px-3.5 pb-2 text-[10px] font-bold tracking-[0.16em] uppercase text-slate-400">
                Priority Store Actions
              </p>
              <div className="space-y-1">
                {priorityNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-blue-600' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && (
                        <span className="font-mono text-[11px] font-bold text-[#f0b429]">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="px-3.5 pb-2 text-[10px] font-bold tracking-[0.16em] uppercase text-slate-400">
                Growth & Settings
              </p>
              <div className="space-y-1">
                {managementNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2">
            <button
              type="button"
              onClick={() => setIsCreatingStore(true)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-blue-600 text-xs font-semibold text-slate-700 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Store</span>
            </button>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-6xl w-full mx-auto min-w-0">
          {/* Mobile & Tablet Horizontal Navigation Strip (Ordered by Priority) */}
          <div className="flex md:hidden items-center gap-4 overflow-x-auto pb-2.5 mb-4 border-b border-slate-200 text-xs font-semibold text-slate-600">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1.5 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeTab === item.id
                    ? 'text-blue-600 border-b-2 border-blue-600 font-bold'
                    : 'text-slate-500'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="font-mono text-[10px] text-[#f0b429]">
                    ({item.badge})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Always-On-Top Store Digital Score Banner (Visible at Top of Screen on Non-Dashboard Tabs) */}
          {activeTab !== 'dashboard' && (
            <div className="mb-5 p-3.5 sm:p-4 rounded-2xl bg-white border border-[#8a6a1f]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('score')}
                  className="w-12 h-12 rounded-xl bg-blue-50 border border-[#f0b429] flex flex-col items-center justify-center shrink-0 cursor-pointer"
                >
                  <span className="text-base font-extrabold text-[#f8cf6b] font-mono tabular-nums leading-none">
                    {liveScoreSummary.overallScore}
                  </span>
                  <span className="text-[9px] font-mono text-[#f0b429] mt-0.5">
                    /100
                  </span>
                </button>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#f0b429]">
                      Store Digital Score: {liveScoreSummary.overallScore}/100
                    </span>
                    <span className="text-xs font-mono font-bold text-[#f8cf6b]">
                      · {liveGbpRating.toFixed(1)} ★ GBP
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {liveScoreSummary.topOpportunities.length > 0
                      ? `Next Boost: ${liveScoreSummary.topOpportunities[0].recommendedAction}`
                      : 'All 6 local SEO & Google Business Profile pillars are optimized!'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={topBarAutoImproving}
                  onClick={async () => {
                    if (topBarAutoImproving) return;
                    setTopBarAutoImproving(true);
                    try {
                      await runFullStoreAutoImprovement({
                        store: activeStore,
                        posts,
                        offers,
                        reviews,
                      });
                    } finally {
                      setTopBarAutoImproving(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {topBarAutoImproving
                    ? 'Auto-Improving...'
                    : liveScoreSummary.overallScore < 100
                    ? 'Improve Score Auto'
                    : 'Autopilot 100%'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('reviews')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'reviews'
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-slate-200 text-slate-700 hover:border-blue-600'
                  }`}
                >
                  Reviews{pendingReviewsCount > 0 ? ` (${pendingReviewsCount})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('posts')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'posts'
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-slate-200 text-slate-700 hover:border-blue-600'
                  }`}
                >
                  + Post
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('offers')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'offers'
                      ? 'border-blue-600 text-blue-600 bg-blue-50'
                      : 'border-slate-200 text-slate-700 hover:border-blue-600'
                  }`}
                >
                  + Offer
                </button>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              <TrialStatusDashboardWidget
                subscription={subscription}
                store={activeStore}
                onOpenUpgradeModal={() => {
                  setCreditBlockedMessage(null);
                  setUpgradeModalOpen(true);
                }}
                onOpenSettingsTab={() => setActiveTab('settings')}
              />
              <DashboardView
                store={activeStore}
                posts={posts}
                offers={offers}
                reviews={reviews}
                onNavigate={(tab) => setActiveTab(tab)}
              />
            </div>
          )}
          {activeTab === 'profile' && <StoreProfileView store={activeStore} />}
          {activeTab === 'posts' && (
            <PostsView store={activeStore} posts={posts} />
          )}
          {activeTab === 'offers' && (
            <OffersView store={activeStore} offers={offers} />
          )}
          {activeTab === 'reviews' && (
            <ReviewsView store={activeStore} reviews={reviews} />
          )}
          {activeTab === 'score' && (
            <DigitalScoreView
              store={activeStore}
              posts={posts}
              offers={offers}
              reviews={reviews}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}
          {activeTab === 'google' && (
            <GoogleProfileView
              store={activeStore}
              posts={posts}
              offers={offers}
              reviews={reviews}
            />
          )}
          {activeTab === 'automation' && (
            <AutomationCenterView store={activeStore} posts={posts} />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsView
              store={activeStore}
              posts={posts}
              offers={offers}
              reviews={reviews}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              store={activeStore}
              subscription={subscription}
              onSubscriptionUpdated={(updated) => setSubscription(updated)}
              onOpenUpgradeModal={() => {
                setCreditBlockedMessage(null);
                setUpgradeModalOpen(true);
              }}
              userEmail={user.email}
              onAddAnotherStore={() => setIsCreatingStore(true)}
              onSwitchStore={() => setIsSelectingStoreScreen(true)}
              onStoreDeleted={() => {
                setSelectedStoreId(null);
                setActiveTab('dashboard');
              }}
            />
          )}
          {activeTab === 'admin' && isAuthorizedAdmin && (
            <AdminTrialReportView adminEmail={user.email || ''} />
          )}

          {/* Trial Expiry & Credit Exhaustion Upgrade Modal */}
          <TrialExpiryUpgradeModal
            isOpen={upgradeModalOpen}
            onClose={() => setUpgradeModalOpen(false)}
            subscription={subscription}
            store={activeStore}
            userId={user.uid}
            userEmail={user.email}
            blockedMessage={creditBlockedMessage}
            onSubscriptionUpdated={(updated) => setSubscription(updated)}
          />

          {/* Global Workspace Footer */}
          <footer className="mt-10 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[#f0b429]">Stallwale.in</span>
              <span aria-hidden="true">·</span>
              <span>
                Copyright © {new Date().getFullYear()} Stallwale.in. All rights reserved.
              </span>
            </div>
            <span className="tracking-wider uppercase text-[11px] text-slate-400">
              DISCOVER <span className="text-[#f0b429] mx-1">•</span> CONNECT{' '}
              <span className="text-[#f0b429] mx-1">•</span> GROW
            </span>
          </footer>
        </main>
      </div>

      {/* Mobile Bottom Navigation (5 Priority Store Actions) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-1.5 py-1.5 grid grid-cols-5">
        {mobileBottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`relative min-h-[44px] flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors ${
                isActive ? 'text-blue-600 bg-blue-50/60' : 'text-slate-500'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4 mb-0.5" />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-3 font-mono text-[9px] font-extrabold text-[#f0b429]">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="truncate max-w-[64px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
