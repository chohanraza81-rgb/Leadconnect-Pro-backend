// Map common country names / codes to ISO Alpha‑2 codes
const countryMap = {
  'united states': 'US', 'usa': 'US', 'us': 'US', 'america': 'US',
  'united kingdom': 'UK', 'uk': 'UK', 'england': 'UK', 'gb': 'UK', 'great britain': 'UK',
  'canada': 'CA', 'ca': 'CA',
  'australia': 'AU', 'au': 'AU',
  'germany': 'DE', 'de': 'DE', 'deutschland': 'DE',
  'singapore': 'SG', 'sg': 'SG',
  'saudi arabia': 'SA', 'ksa': 'SA', 'sa': 'SA',
  'united arab emirates': 'AE', 'uae': 'AE', 'dubai': 'AE', 'ae': 'AE',
  'pakistan': 'PK', 'pk': 'PK',
  'india': 'IN', 'in': 'IN',
  'turkey': 'TR', 'tr': 'TR',
  'malaysia': 'MY', 'my': 'MY',
};

function normalizeCountryCode(input) {
  if (!input) return '';
  const clean = input.trim().toLowerCase();
  // If already a 2‑letter code, return uppercase
  if (clean.length === 2) return clean.toUpperCase();
  return countryMap[clean] || '';
}

module.exports = { normalizeCountryCode };
