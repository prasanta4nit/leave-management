/** ISO 3166-1 alpha-2 countries offered in pickers. Add more as the company grows. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: 'IN', name: 'India' },
  { code: 'IL', name: 'Israel' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'PL', name: 'Poland' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
];

export const countryName = (code: string | null | undefined) =>
  code ? COUNTRIES.find((c) => c.code === code)?.name ?? code : '—';
