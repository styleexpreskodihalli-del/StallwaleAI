import { BusinessCategory, StoreRecord } from '../types';

export type AudienceFocus = 'men' | 'women' | 'unisex';

export interface CuratedPromoImage {
  label: string;
  url: string;
  focus?: AudienceFocus;
}

/**
 * Detects whether a store is Men-focused, Women-focused, or Unisex/Both
 * based on store name, businessType, services, description, and SEO keywords.
 */
export function detectStoreAudienceFocus(store: {
  name?: string;
  category?: BusinessCategory | string;
  businessType?: string;
  services?: string;
  description?: string;
  seoKeywords?: string[];
}): AudienceFocus {
  const combined = [
    store.name || '',
    store.businessType || '',
    store.services || '',
    store.description || '',
    ...(Array.isArray(store.seoKeywords) ? store.seoKeywords : []),
  ]
    .join(' ')
    .toLowerCase();

  // Explicit unisex check
  if (
    /\bunisex\b/.test(combined) ||
    /\b(men\s*(&|and)\s*women|ladies\s*(&|and)\s*gents|family\s+salon|all\s+genders)\b/.test(
      combined
    )
  ) {
    return 'unisex';
  }

  const isMen =
    /\b(men|mens|men's|male|gents|gent's|gentlemen|barber|barbershop|beard|shave|fade)\b/.test(
      combined
    );
  const isWomen =
    /\b(women|womens|women's|female|ladies|lady|bridal|bride|saree|lehenga)\b/.test(
      combined
    );

  if (isMen && isWomen) return 'unisex';
  if (isMen) return 'men';
  if (isWomen) return 'women';
  return 'unisex';
}

const SALON_IMAGES: Record<AudienceFocus, CuratedPromoImage[]> = {
  men: [
    {
      label: "Men's Haircut & Fade Studio",
      url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Beard Trim & Men's Grooming",
      url: 'https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: 'Classic Barber & Hot Towel Shave',
      url: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Men's Executive Styling",
      url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
  ],
  women: [
    {
      label: "Women's Hair Styling & Blowout",
      url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Hair Color & Keratin Care',
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Bridal & Glamour Makeup Studio',
      url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
  ],
  unisex: [
    {
      label: "Men's Haircut & Beard Grooming (His)",
      url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Women's Styling & Color Care (Hers)",
      url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: "Men's Precision Barber & Styling (His)",
      url: 'https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Women's Hair Spa & Keratin (Hers)",
      url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Modern Unisex Salon Interior (Both)',
      url: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=85',
      focus: 'unisex',
    },
  ],
};

const BEAUTY_SPA_IMAGES: Record<AudienceFocus, CuratedPromoImage[]> = {
  men: [
    {
      label: "Men's Facial & Skin Detox",
      url: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Men's Grooming & Massage Therapy",
      url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Men's Beard & Scalp Wellness",
      url: 'https://images.unsplash.com/photo-1621607512214-68297480165e?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
  ],
  women: [
    {
      label: "Women's Luxury Spa & Facial",
      url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Glow Skincare & Aromatherapy',
      url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Bridal Beauty & Wellness Package',
      url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
  ],
  unisex: [
    {
      label: "Men's Deep Tissue & Skin Therapy (His)",
      url: 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Women's Relaxing Spa & Facial (Hers)",
      url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Unisex Wellness & Massage Sanctuary (Both)',
      url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=85',
      focus: 'unisex',
    },
    {
      label: 'Organic Skincare & Glow Studio (Hers)',
      url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
  ],
};

const CLOTHING_IMAGES: Record<AudienceFocus, CuratedPromoImage[]> = {
  men: [
    {
      label: "Men's Menswear & Tailored Suits",
      url: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Men's Casual & Streetwear Collection",
      url: 'https://images.unsplash.com/photo-1490578474895-699cd4e2cf59?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Men's Shirts & Accessories rack",
      url: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
  ],
  women: [
    {
      label: "Women's Boutique & Designer Wear",
      url: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: "Women's Seasonal Fashion Sale",
      url: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
  ],
  unisex: [
    {
      label: "Men's Fashion & Tailored Collection (His)",
      url: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=1200&q=85',
      focus: 'men',
    },
    {
      label: "Women's Boutique & Apparel (Hers)",
      url: 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&w=1200&q=85',
      focus: 'women',
    },
    {
      label: 'Unisex Fashion & Lifestyle Store (Both)',
      url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=1200&q=85',
      focus: 'unisex',
    },
  ],
};

const GENERAL_CATEGORY_IMAGES: Record<string, CuratedPromoImage[]> = {
  Restaurant: [
    {
      label: 'Signature Dining Table & Platter',
      url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Chef Special & Family Feast',
      url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Gourmet Main Course',
      url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  Cafe: [
    {
      label: 'Artisan Coffee & Fresh Pastries',
      url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Cozy Cafe Ambience & Espresso',
      url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  'Retail Store': [
    {
      label: 'In-Store Shopping Showcase',
      url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Featured Retail Collection',
      url: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  'Grocery Store': [
    {
      label: 'Fresh Produce & Daily Essentials',
      url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Organic Market Aisle',
      url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  Hotel: [
    {
      label: 'Luxury Suite & Hospitality',
      url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85',
    },
    {
      label: 'Boutique Hotel Lounge',
      url: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  Preschool: [
    {
      label: 'Creative Early Learning & Play',
      url: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  School: [
    {
      label: 'Campus & Classroom Excellence',
      url: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  'Professional Service': [
    {
      label: 'Client Advisory & Consultation',
      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=85',
    },
  ],
  Other: [
    {
      label: 'Local Business Storefront',
      url: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=85',
    },
  ],
};

/**
 * Returns the curated promotional images tailored to both the business category
 * AND the audience gender focus (Men-only, Women-only, or Unisex/Both).
 */
export function getStorePromotionalGallery(
  store: Pick<
    StoreRecord,
    'name' | 'category' | 'businessType' | 'services' | 'description' | 'seoKeywords'
  >,
  overrideFocus?: AudienceFocus
): {
  detectedFocus: AudienceFocus;
  activeFocus: AudienceFocus;
  supportsGenderFocus: boolean;
  images: CuratedPromoImage[];
} {
  const detectedFocus = detectStoreAudienceFocus(store);
  const activeFocus = overrideFocus || detectedFocus;
  const cat = store.category || 'Other';

  if (cat === 'Salon') {
    return {
      detectedFocus,
      activeFocus,
      supportsGenderFocus: true,
      images: SALON_IMAGES[activeFocus] || SALON_IMAGES.unisex,
    };
  }

  if (cat === 'Beauty & Spa') {
    return {
      detectedFocus,
      activeFocus,
      supportsGenderFocus: true,
      images: BEAUTY_SPA_IMAGES[activeFocus] || BEAUTY_SPA_IMAGES.unisex,
    };
  }

  if (cat === 'Clothing Store') {
    return {
      detectedFocus,
      activeFocus,
      supportsGenderFocus: true,
      images: CLOTHING_IMAGES[activeFocus] || CLOTHING_IMAGES.unisex,
    };
  }

  const list =
    GENERAL_CATEGORY_IMAGES[cat] || GENERAL_CATEGORY_IMAGES['Retail Store'];
  return {
    detectedFocus,
    activeFocus,
    supportsGenderFocus: false,
    images: list,
  };
}
