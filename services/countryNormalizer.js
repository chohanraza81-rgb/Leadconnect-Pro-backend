const countryMap = {
  // United States
  'united states': 'US', 'usa': 'US', 'us': 'US', 'america': 'US', 'u.s.': 'US',
  // United Kingdom
  'united kingdom': 'UK', 'uk': 'UK', 'england': 'UK', 'gb': 'UK', 'great britain': 'UK',
  // Canada
  'canada': 'CA', 'ca': 'CA',
  // Australia
  'australia': 'AU', 'au': 'AU',
  // Germany
  'germany': 'DE', 'de': 'DE', 'deutschland': 'DE',
  // Singapore
  'singapore': 'SG', 'sg': 'SG',
  // Saudi Arabia
  'saudi arabia': 'SA', 'ksa': 'SA', 'sa': 'SA',
  // UAE
  'united arab emirates': 'AE', 'uae': 'AE', 'dubai': 'AE', 'ae': 'AE',
  // Pakistan
  'pakistan': 'PK', 'pk': 'PK',
  // India (fixed misspellings)
  'india': 'IN', 'in': 'IN', 'indian': 'IN', 'bharat': 'IN',
  // Turkey
  'turkey': 'TR', 'tr': 'TR',
  // Malaysia
  'malaysia': 'MY', 'my': 'MY',
};

function normalizeCountryCode(input) {
  if (!input) return '';
  const clean = input.trim().toLowerCase();
  // If already 2-letter code, return uppercase
  if (clean.length === 2) return clean.toUpperCase();
  return countryMap[clean] || '';
}

module.exports = { normalizeCountryCode };
