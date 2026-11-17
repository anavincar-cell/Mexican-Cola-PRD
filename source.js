// Works out where a visitor came from, for the report.
// 1. A tagged link: ?utm_source=instagram (or the short form ?ref=instagram).
// 2. Otherwise the site that sent them (only the site name, never the full address).
// 3. Otherwise "direct": they typed the address, scanned an untagged code, or the source is hidden.

const KNOWN_SITES = [
  [/(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com)$/, 'email'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)(line\.me|line-apps\.com)$/, 'line'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com)$/, 'search'],
];

// Keeps only simple tag text: lowercase letters, numbers, dot, dash, underscore.
function tag(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 60);
}

function siteName(referrer) {
  try {
    const host = new URL(String(referrer)).hostname.toLowerCase();
    return /^[a-z0-9.-]+$/.test(host) ? host.slice(0, 100) : '';
  } catch {
    return '';
  }
}

function classify({ utm_source, ref, utm_medium, utm_campaign, referrer } = {}, ownHost = '') {
  const site = siteName(referrer);
  const referrerHost = site && site !== String(ownHost).toLowerCase().split(':')[0] ? site : '';
  let source = tag(utm_source) || tag(ref);
  if (!source && referrerHost) {
    const known = KNOWN_SITES.find(([re]) => re.test(referrerHost));
    source = known ? known[1] : referrerHost.replace(/^www\./, '');
  }
  return {
    source: source || 'direct',
    medium: tag(utm_medium),
    campaign: tag(utm_campaign),
    referrer: referrerHost,
  };
}

module.exports = { classify };
