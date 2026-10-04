export const BUSINESS_CATEGORIES = [
  'Restaurant',
  'Salon',
  'Beauty & Spa',
  'Retail Store',
  'Clothing Store',
  'Grocery Store',
  'Cafe',
  'Hotel',
  'Preschool',
  'School',
  'Professional Service',
  'Other',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const BRAND_TONES = [
  'Warm & Friendly',
  'Professional & Polished',
  'Energetic & Promotional',
  'Luxury & Refined',
] as const;

export type BrandTone = (typeof BRAND_TONES)[number];

export interface StoreRecord {
  id: string;
  ownerId: string;
  name: string;
  category: BusinessCategory;
  businessType: string;
  description: string;
  address: string;
  city: string;
  country?: string;
  phone: string;
  website: string;
  openingHours: string;
  services: string;
  seoKeywords?: string[];
  socialLinks: string;
  tone: BrandTone;
  brandVoicePreset?: string;
  brandVoicePositiveTemplate?: string;
  brandVoiceNeutralTemplate?: string;
  brandVoiceNegativeTemplate?: string;
  brandVoiceSignOff?: string;
  gbpConnected: boolean;
  googleAccountId?: string;
  gbpAccountEmail: string;
  gbpAccountId?: string;
  gbpLocationId: string;
  gbpTokenStatus?: string;
  gbpLastSync: string;
  gbpSyncError?: string;
  gbpAverageRating?: number;
  gbpTotalReviewCount?: number;
  autoDailyPosts: boolean;
  dailyPostScheduleDate?: string;
  dailyPostScheduleTime?: string;
  autoReviewReplies: boolean;
  autoOfferReminders: boolean;
  autoProfileMonitoring: boolean;
  autoScoreMonitoring: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostRecord {
  id: string;
  ownerId: string;
  storeId: string;
  postType: 'Update' | 'Offer' | 'Event';
  headline: string;
  description: string;
  cta: string;
  imageConcept: string;
  imageUrl?: string;
  status: 'Draft' | 'Scheduled' | 'Published';
  scheduledDate?: string;
  scheduledTime?: string;
  gbpLocalPostName?: string;
  gbpPublishedAt?: string;
  gbpSyncNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OfferRecord {
  id: string;
  ownerId: string;
  storeId: string;
  title: string;
  description: string;
  discount: string;
  startDate: string;
  endDate: string;
  terms: string;
  cta: string;
  imageUrl?: string;
  imagePrompt?: string;
  status: 'Draft' | 'Active' | 'Deactivated';
  gbpLocalPostName?: string;
  gbpPublishedAt?: string;
  gbpSyncNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ReviewSentiment = 'Positive' | 'Neutral' | 'Negative';

export interface ReviewRecord {
  id: string;
  ownerId: string;
  storeId: string;
  customerName: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
  replyText: string;
  responseStatus: 'Needs Response' | 'Draft Saved' | 'Replied';
  sentiment?: ReviewSentiment;
  gbpReviewName?: string;
  gbpReplySyncedAt?: string;
  gbpSyncNote?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type WorkspaceTab =
  | 'dashboard'
  | 'profile'
  | 'posts'
  | 'offers'
  | 'reviews'
  | 'score'
  | 'google'
  | 'automation'
  | 'analytics'
  | 'settings'
  | 'admin';

export type AdminTrialStatusBadge =
  | 'ACTIVE TRIAL'
  | 'CREDITS EXHAUSTED'
  | 'TRIAL EXPIRED'
  | 'PAID'
  | 'PAYMENT PENDING'
  | 'PAYMENT FAILED'
  | 'CANCELLED';

export type AdminDatePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'CUSTOM_RANGE';

export type AdminCreditFilterBucket =
  | 'ALL'
  | 'USED_ANY'
  | '0'
  | '1_10'
  | '11_25'
  | '26_49'
  | '50';

export interface AdminTrialUserRow {
  userId: string;
  userName: string;
  email: string;
  storeName: string;
  country: string;
  currency: SubscriptionCurrency;
  trialStartedAt: string;
  trialEndsAt: string;
  creditsUsed: number;
  creditLimit: number;
  creditsRemaining: number;
  trialStatus: AdminTrialStatusBadge;
  subscriptionStatus: SubscriptionStatus;
  lastActivityAt: string;
  paid: boolean;
  paidAt: string;
  isGrandfathered: boolean;
  daysBeforeConversion?: number | null;
  creditsAtConversion?: number | null;
}

export interface AdminFeatureUsageRow {
  featureKey: string;
  featureLabel: string;
  creditsConsumed: number;
  percentageOfTotal: number;
  eventCount: number;
}

export interface AdminFunnelStage {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

export interface AdminAlertConfig {
  highUsagePercentThreshold: number;
  unusualDailyCreditsThreshold: number;
}

export interface AdminUsageAlerts {
  config: AdminAlertConfig;
  highUsageUsersCount: number;
  exhaustedAllCreditsCount: number;
  unusualHighAiUsageCount: number;
  highUsageUsers: Array<{
    userId: string;
    userName: string;
    email: string;
    storeName: string;
    creditsUsed: number;
    creditLimit: number;
  }>;
  exhaustedUsers: Array<{
    userId: string;
    userName: string;
    email: string;
    storeName: string;
    creditsUsed: number;
    creditLimit: number;
  }>;
  unusualUsageUsers: Array<{
    userId: string;
    userName: string;
    email: string;
    storeName: string;
    creditsIn24h: number;
    eventsIn24h: number;
  }>;
}

export interface AdminCostControlSummary {
  costDataAvailable: boolean;
  message?: string;
  totalTrialAiRequests: number;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  estimatedAiCostUsd: number | null;
  estimatedCostPerTrialUserUsd: number | null;
  estimatedCostPerConvertedCustomerUsd: number | null;
}

export interface AdminTrialReportResponse {
  authorizedAdminEmail: string;
  generatedAt: string;
  dateRange: {
    preset: AdminDatePreset;
    startDate: string;
    endDate: string;
  };
  kpis: {
    newTrialUsers: number;
    trialUsersWhoUsedCredits: number;
    trialUsersWhoNeverUsedCredits: number;
    totalCreditsConsumed: number;
    averageCreditsPerUser: number;
    trialsExhausted: number;
    trialsExpiredByTime: number;
    paidConversions: number;
    conversionRatePercent: number;
    totalEligibleTrials: number;
    averageCreditsBeforeConversion: number;
    averageDaysBeforeConversion: number;
  };
  funnel: AdminFunnelStage[];
  featureBreakdown: AdminFeatureUsageRow[];
  alerts: AdminUsageAlerts;
  costControl: AdminCostControlSummary;
  pagination: {
    page: number;
    pageSize: number;
    totalMatchingUsers: number;
    totalPages: number;
  };
  users: AdminTrialUserRow[];
}

export type SubscriptionStatus =
  | 'TRIAL'
  | 'TRIAL_EXPIRED'
  | 'ACTIVE'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export type SubscriptionPlan = 'MONTHLY';
export type BillingCycle = '30_DAYS';
export type SubscriptionCurrency = 'INR' | 'AED';

export type CreditActionKey =
  | 'SIMPLE_AI_GENERATION'
  | 'AI_REVIEW_RESPONSE'
  | 'AI_OFFER_GENERATION'
  | 'DIGITAL_SCORE_ANALYSIS'
  | 'COMPETITOR_ANALYSIS'
  | 'LARGE_AI_ANALYSIS'
  | 'simple_ai_generation'
  | 'ai_review_response'
  | 'ai_offer_content_generation'
  | 'digital_score_analysis'
  | 'competitor_analysis'
  | 'large_ai_analysis'
  | 'batch_review_response';

export interface UsageEventRecord {
  id: string;
  userId: string;
  storeId: string;
  action: CreditActionKey;
  creditsConsumed: number;
  timestamp: string;
  status: 'SUCCEEDED' | 'REJECTED_INSUFFICIENT_CREDITS' | 'REJECTED_TRIAL_EXPIRED';
  metadata?: Record<string, unknown>;
}

export interface AdminCreditAnalyticsSummary {
  totalTrialUsers: number;
  trialUsersWhoUsedAi: number;
  totalCreditsConsumed: number;
  totalCreditsRemaining: number;
  totalCreditsRemainingAcrossTrialUsers: number;
  averageCreditsPerUser: number;
  creditCostTable: Record<string, number>;
  mostExpensiveOperations: Array<{
    action: CreditActionKey;
    totalCredits: number;
    eventCount: number;
    invocations: number;
  }>;
  recentEvents: UsageEventRecord[];
}

export interface SubscriptionRecord {
  userId: string;
  email: string;
  subscriptionStatus: SubscriptionStatus;
  plan: SubscriptionPlan;
  currency: SubscriptionCurrency;
  amount: number;
  billingCycle: BillingCycle;
  trialStartedAt: string;
  trialEndsAt: string;
  trialCreditLimit: number;
  trialCreditsUsed: number;
  trialCreditsRemaining: number;
  subscriptionId: string;
  customerId: string;
  razorpayCustomerId: string;
  razorpaySubscriptionId: string;
  razorpayPlanId: string;
  paymentLink?: string;
  paymentLinkINR?: string;
  paymentLinkAED?: string;
  lastPaymentId: string;
  subscriptionStartDate: string;
  trialStartDate: string;
  trialEndDate: string;
  currentBillingPeriodStart: string;
  currentBillingPeriodEnd: string;
  nextRenewalDate: string;
  paymentStatus: string;
  provider: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  isGrandfathered?: boolean;
  lastWebhookEvent?: string;
  lastWebhookAt?: string;
  accessAllowed: boolean;
  aiOperationsAllowed: boolean;
  trialDaysRemaining?: number;
  daysRemainingInTrial?: number;
  daysRemainingInPeriod?: number;
  userMessage?: string;
  lowCreditWarning?: string;
}


