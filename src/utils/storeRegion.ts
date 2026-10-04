import { SubscriptionCurrency } from '../types';

export type StoreBillingRegion = 'INDIA' | 'MIDDLE_EAST';

const OUTSIDE_INDIA_KEYWORDS = [
  // Countries & Region terms outside India
  'uae',
  'united arab emirates',
  'emirates',
  'middle east',
  'outside india',
  'international',
  'gcc',
  'saudi',
  'saudi arabia',
  'ksa',
  'qatar',
  'oman',
  'kuwait',
  'bahrain',
  'jordan',
  'lebanon',
  'egypt',
  'iraq',
  // UAE Emirates & Major Cities
  'dubai',
  'abu dhabi',
  'abudhabi',
  'sharjah',
  'ajman',
  'ras al khaimah',
  'fujairah',
  'umm al quwain',
  'al ain',
  'jumeirah',
  'deira',
  'bur dubai',
  'karama',
  'al barsha',
  'business bay',
  'downtown dubai',
  'marina',
  'jlt',
  'mussafah',
  'khalifa city',
  // Other GCC / Middle East Major Cities
  'riyadh',
  'jeddah',
  'mecca',
  'makkah',
  'medina',
  'madinah',
  'dammam',
  'khobar',
  'doha',
  'lusail',
  'al wakrah',
  'muscat',
  'salalah',
  'sohar',
  'manama',
  'muharraq',
  'kuwait city',
  'salmiya',
  'hawally',
  'amman',
  'beirut',
  'cairo',
];

const OUTSIDE_INDIA_PHONE_PREFIXES = [
  '+971', // UAE
  '+966', // Saudi Arabia
  '+974', // Qatar
  '+968', // Oman
  '+965', // Kuwait
  '+973', // Bahrain
  '+962', // Jordan
  '+961', // Lebanon
  '00971',
  '00966',
  '00974',
  '00968',
  '00965',
  '00973',
];

/**
 * Determines whether a store belongs to an All-India location (strictly INR ₹499 / 30 days)
 * or Outside India / Middle East location (strictly AED 60 / 30 days).
 */
export function resolveStoreBillingRegion(store?: {
  country?: string;
  city?: string;
  address?: string;
  phone?: string;
  website?: string;
} | null): {
  region: StoreBillingRegion;
  currency: SubscriptionCurrency;
  amount: number;
  priceDisplay: string;
  countryLabel: string;
} {
  if (!store) {
    return {
      region: 'INDIA',
      currency: 'INR',
      amount: 499,
      priceDisplay: '₹499 / 30 days',
      countryLabel: '🇮🇳 All India Location',
    };
  }

  const rawCountry = String(store.country || '').trim().toLowerCase();

  // Check if city/address/phone explicitly indicates outside India / Middle East first
  const phoneClean = String(store.phone || '').replace(/\s+/g, '');
  if (
    OUTSIDE_INDIA_PHONE_PREFIXES.some((prefix) => phoneClean.startsWith(prefix)) ||
    (phoneClean.startsWith('+') && !phoneClean.startsWith('+91'))
  ) {
    return {
      region: 'MIDDLE_EAST',
      currency: 'AED',
      amount: 60,
      priceDisplay: 'AED 60 / 30 days',
      countryLabel: '🇦🇪 Middle East / Outside India Location',
    };
  }

  const websiteClean = String(store.website || '').trim().toLowerCase();
  if (
    websiteClean.endsWith('.ae') ||
    websiteClean.includes('.ae/') ||
    websiteClean.endsWith('.sa') ||
    websiteClean.endsWith('.qa') ||
    websiteClean.endsWith('.om') ||
    websiteClean.endsWith('.kw') ||
    websiteClean.endsWith('.bh')
  ) {
    return {
      region: 'MIDDLE_EAST',
      currency: 'AED',
      amount: 60,
      priceDisplay: 'AED 60 / 30 days',
      countryLabel: '🇦🇪 Middle East / Outside India Location',
    };
  }

  const combinedLocation = `${store.city || ''} ${store.address || ''} ${store.country || ''}`
    .toLowerCase()
    .replace(/[,.-]/g, ' ');

  const words = combinedLocation.split(/\s+/).filter(Boolean);
  const isOutsideIndiaByKeyword = OUTSIDE_INDIA_KEYWORDS.some((kw) => {
    if (kw.includes(' ')) {
      return combinedLocation.includes(kw);
    }
    return words.includes(kw);
  });

  if (isOutsideIndiaByKeyword) {
    return {
      region: 'MIDDLE_EAST',
      currency: 'AED',
      amount: 60,
      priceDisplay: 'AED 60 / 30 days',
      countryLabel: '🇦🇪 Middle East / Outside India Location',
    };
  }

  // If store.country was explicitly set to something other than India
  if (
    rawCountry &&
    rawCountry !== 'india' &&
    rawCountry !== 'in' &&
    rawCountry !== 'inr' &&
    !rawCountry.includes('all india')
  ) {
    return {
      region: 'MIDDLE_EAST',
      currency: 'AED',
      amount: 60,
      priceDisplay: 'AED 60 / 30 days',
      countryLabel: '🇦🇪 Middle East / Outside India Location',
    };
  }

  return {
    region: 'INDIA',
    currency: 'INR',
    amount: 499,
    priceDisplay: '₹499 / 30 days',
    countryLabel: '🇮🇳 All India Location',
  };
}
