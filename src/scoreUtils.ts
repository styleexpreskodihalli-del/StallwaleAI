import {
  StoreRecord,
  PostRecord,
  OfferRecord,
  ReviewRecord,
  ReviewSentiment,
  WorkspaceTab,
} from './types';

export function analyzeReviewSentiment(review: {
  rating: number;
  reviewText: string;
  sentiment?: ReviewSentiment;
}): ReviewSentiment {
  if (
    review.sentiment === 'Positive' ||
    review.sentiment === 'Neutral' ||
    review.sentiment === 'Negative'
  ) {
    return review.sentiment;
  }

  const text = String(review.reviewText || '').toLowerCase();
  const negWords = [
    'bad',
    'worst',
    'terrible',
    'rude',
    'slow',
    'disappointed',
    'poor',
    'overpriced',
    'dirty',
    'unprofessional',
    'never again',
    'awful',
    'horrible',
    'waste',
  ];
  const posWords = [
    'great',
    'amazing',
    'excellent',
    'best',
    'wonderful',
    'friendly',
    'loved',
    'fantastic',
    'recommend',
    'clean',
    'professional',
    'polite',
    'awesome',
    'happy',
  ];

  const hasNeg = negWords.some((w) => text.includes(w));
  const hasPos = posWords.some((w) => text.includes(w));

  const rating = Number(review.rating) || 5;
  if (rating >= 4) {
    if (hasNeg && !hasPos && rating === 4) return 'Neutral';
    return 'Positive';
  }
  if (rating <= 2) {
    return 'Negative';
  }
  if (hasNeg && !hasPos) return 'Negative';
  if (hasPos && !hasNeg) return 'Positive';
  return 'Neutral';
}

export interface ScorePillar {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  percentage: number;
  statusText: string;
  missingText: string;
  recommendedAction: string;
  targetTab: WorkspaceTab;
}

export interface DigitalScoreSummary {
  overallScore: number;
  pillars: ScorePillar[];
  topOpportunities: ScorePillar[];
}

export function getStoreGbpRating(store: StoreRecord): number {
  if (
    typeof store.gbpAverageRating === 'number' &&
    store.gbpAverageRating >= 1 &&
    store.gbpAverageRating <= 5
  ) {
    return Number(store.gbpAverageRating.toFixed(1));
  }
  return 4.7;
}

export function calculateDigitalScore(
  store: StoreRecord,
  posts: PostRecord[],
  offers: OfferRecord[],
  reviews: ReviewRecord[]
): DigitalScoreSummary {
  // 1. Google Profile (20 pts)
  const gbpScore = store.gbpConnected ? 20 : 4;
  const gbpPillar: ScorePillar = {
    id: 'google-profile',
    label: 'Google Profile',
    score: gbpScore,
    maxScore: 20,
    percentage: Math.round((gbpScore / 20) * 100),
    statusText: store.gbpConnected
      ? 'Your Google Business Profile is connected and syncing'
      : 'Your Google Business Profile is not connected yet',
    missingText: store.gbpConnected
      ? 'All core Google synchronization hooks are active'
      : 'Missing live Google Business Profile connection for automatic publishing',
    recommendedAction: store.gbpConnected ? 'Review Connection' : 'Connect Google Profile',
    targetTab: 'google',
  };

  // 2. Store Information (15 pts)
  let infoPoints = 3; // name & category always present
  const missingFields: string[] = [];
  if (store.description && store.description.trim().length > 15) infoPoints += 3;
  else missingFields.push('business description');
  if (store.address && store.city && store.phone) infoPoints += 3;
  else missingFields.push('complete address & phone');
  if (store.openingHours && store.openingHours.trim().length > 3) infoPoints += 3;
  else missingFields.push('opening hours');
  if (store.services && store.services.trim().length > 3) infoPoints += 3;
  else missingFields.push('services list');

  const infoPillar: ScorePillar = {
    id: 'store-info',
    label: 'Store Information',
    score: infoPoints,
    maxScore: 15,
    percentage: Math.round((infoPoints / 15) * 100),
    statusText:
      infoPoints === 15
        ? 'Your store profile information is complete'
        : `Your store profile is ${Math.round((infoPoints / 15) * 100)}% complete`,
    missingText:
      missingFields.length > 0
        ? `Missing: ${missingFields.join(', ')}`
        : 'All essential business details and services are filled out',
    recommendedAction: 'Update Store Profile',
    targetTab: 'profile',
  };

  // 3. Reviews (15 pts)
  const totalReviews = reviews.length;
  const gbpRating = getStoreGbpRating(store);
  let reviewScore = 0;
  if (totalReviews >= 3 || gbpRating >= 4.5) reviewScore = 15;
  else if (totalReviews > 0) reviewScore = 12;
  else reviewScore = 8;

  const reviewsPillar: ScorePillar = {
    id: 'reviews',
    label: 'Reviews',
    score: reviewScore,
    maxScore: 15,
    percentage: Math.round((reviewScore / 15) * 100),
    statusText:
      totalReviews > 0
        ? `${gbpRating.toFixed(1)} ★ GBP rating · ${totalReviews} synced reviews`
        : `${gbpRating.toFixed(1)} ★ Google Business Profile rating`,
    missingText:
      totalReviews >= 3 || gbpRating >= 4.5
        ? `Strong ${gbpRating.toFixed(1)} ★ Google Business Profile rating and customer sentiment`
        : 'Sync your Google Profile or invite customers to leave feedback',
    recommendedAction: 'Manage Reviews',
    targetTab: 'reviews',
  };

  // 4. Review Responses (15 pts)
  const needsResponseCount = reviews.filter((r) => r.responseStatus !== 'Replied').length;
  const repliedCount = reviews.filter((r) => r.responseStatus === 'Replied').length;
  let responseScore = 5;
  if (totalReviews === 0) {
    responseScore = 5;
  } else if (needsResponseCount === 0) {
    responseScore = 15;
  } else {
    responseScore = Math.max(4, Math.round((repliedCount / totalReviews) * 15));
  }

  const reviewResponsesPillar: ScorePillar = {
    id: 'review-responses',
    label: 'Review Responses',
    score: responseScore,
    maxScore: 15,
    percentage: Math.round((responseScore / 15) * 100),
    statusText:
      totalReviews === 0
        ? 'No pending reviews in your inbox'
        : needsResponseCount === 0
        ? '100% of customer reviews have received an owner reply'
        : `${needsResponseCount} ${needsResponseCount === 1 ? 'review has' : 'reviews have'} not received a response`,
    missingText:
      needsResponseCount > 0
        ? `Replying to ${needsResponseCount} pending ${needsResponseCount === 1 ? 'review' : 'reviews'} boosts local search trust`
        : 'All customer reviews are answered',
    recommendedAction: 'Reply to Reviews',
    targetTab: 'reviews',
  };

  // 5. Posts (15 pts)
  const publishedPosts = posts.filter((p) => p.status === 'Published');
  let postScore = 2;
  if (publishedPosts.length >= 2) postScore = 15;
  else if (publishedPosts.length === 1) postScore = 11;
  else if (posts.length > 0) postScore = 6;

  const postsPillar: ScorePillar = {
    id: 'posts',
    label: 'Posts',
    score: postScore,
    maxScore: 15,
    percentage: Math.round((postScore / 15) * 100),
    statusText:
      publishedPosts.length > 0
        ? `${publishedPosts.length} published Google ${publishedPosts.length === 1 ? 'post' : 'posts'}`
        : 'Your store has not published a Google post recently',
    missingText:
      publishedPosts.length >= 2
        ? 'Consistent Google posting cadence'
        : 'Publish at least 2 updates or specials to maximize local visibility',
    recommendedAction: 'Create Google Post',
    targetTab: 'posts',
  };

  // 6. Offers (10 pts)
  const activeOffers = offers.filter((o) => o.status === 'Active');
  const offerScore = activeOffers.length >= 1 ? 10 : offers.length > 0 ? 5 : 2;
  const offersPillar: ScorePillar = {
    id: 'offers',
    label: 'Offers',
    score: offerScore,
    maxScore: 10,
    percentage: Math.round((offerScore / 10) * 100),
    statusText:
      activeOffers.length > 0
        ? `${activeOffers.length} active promotional ${activeOffers.length === 1 ? 'offer' : 'offers'} live`
        : 'No active promotional offers running right now',
    missingText:
      activeOffers.length > 0
        ? 'Promotional offer is attracting local searchers'
        : 'Stores with an active offer get higher click-through rates on Google',
    recommendedAction: 'Create Offer',
    targetTab: 'offers',
  };

  // 7. Customer Engagement & Automation (10 pts)
  const enabledAutomations = [
    store.autoDailyPosts,
    store.autoReviewReplies,
    store.autoOfferReminders,
    store.autoProfileMonitoring,
    store.autoScoreMonitoring,
  ].filter(Boolean).length;

  const engagementScore = Math.max(2, enabledAutomations * 2);
  const engagementPillar: ScorePillar = {
    id: 'engagement',
    label: 'Customer Engagement',
    score: engagementScore,
    maxScore: 10,
    percentage: Math.round((engagementScore / 10) * 100),
    statusText: `${enabledAutomations} of 5 store growth automations enabled`,
    missingText:
      enabledAutomations === 5
        ? 'All automated monitoring and engagement workflows are active'
        : `${5 - enabledAutomations} automation workflows are currently turned off`,
    recommendedAction: 'Configure Automation',
    targetTab: 'automation',
  };

  const pillars = [
    gbpPillar,
    reviewsPillar,
    reviewResponsesPillar,
    postsPillar,
    offersPillar,
    infoPillar,
    engagementPillar,
  ];

  const overallScore = pillars.reduce((sum, p) => sum + p.score, 0);
  const topOpportunities = [...pillars]
    .filter((p) => p.percentage < 100)
    .sort((a, b) => a.percentage - b.percentage);

  return {
    overallScore,
    pillars,
    topOpportunities,
  };
}
