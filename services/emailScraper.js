const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

function isBlocked(email) {
  const blocked = ['example.com', 'test.com', 'sentry.io', 'ingest.', 'mail.ru', 'yandex.ru',
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com'];
  return blocked.some(d => email.toLowerCase().includes(d)) ||
    /^[a-f0-9]{20,}@/i.test(email) ||
    /@\d+\./.test(email);
}

function extractEmails(text) {
  return [...new Set((text.match(emailRegex) || []).filter(e => !isBlocked(e)))];
}

function extractPhones(text) {
  return [...new Set((text.match(phoneRegex) || [])
    .map(p => p.trim())
    .filter(p => {
      const digits = p.replace(/[^0-9+]/g, '');
      return digits.length >= 7 && digits.length <= 15 && !/^123456/.test(digits) && !/^0{5,}/.test(digits);
    })
    .filter(p => !p.includes('162.220') && !p.includes('192.168') && !p.includes('10.0.'))
  )];
}

function extractName($) {
  // Try multiple ways to find a person's name
  
  // 1. Schema.org Person
  const schemaName = $('[itemtype*="Person"] [itemprop="name"]').first().text().trim();
  if (schemaName && schemaName.split(' ').length >= 2) return schemaName;

  // 2. Author meta
  const author = $('meta[name="author"]').attr('content');
  if (author && author.split(' ').length >= 2 && !author.includes('WordPress')) return author;

  // 3. Team member heading
  const teamNames = [];
  $('h1, h2, h3, h4, .name, .team-name, .member-name, [class*="founder"], [class*="ceo"]').each((_, el) => {
    const text = $(el).text().trim();
    const words = text.split(' ');
    if (words.length >= 2 && words.length <= 4 && 
        !text.includes('Contact') && !text.includes('About') && 
        !text.includes('Service') && !text.includes('Home') &&
        text.length < 40) {
      teamNames.push(text);
    }
  });
  if (teamNames.length > 0) return teamNames[0];

  return null;
}

function extractCompanyFromMeta($) {
  return $('meta[property="og:site_name"]').attr('content') ||
         $('meta[name="twitter:site"]').attr('content')?.replace('@', '') ||
         $('title').text()?.split(/[|\-–]/)[0]?.trim() ||
         null;
}

function cleanName(name) {
  if (!name) return null;
  const cleaned = name.replace(/[0-9]/g, '').replace(/[^\w\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 2) return null;
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function cleanPhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9+\-()\s.]/g, '').trim();
  // Fix common issues
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Remove fake numbers
  if (/^123456|^0{5,}|^1{5,}/.test(cleaned.replace(/[^0-9]/g, ''))) return '';
  return cleaned;
}

async function scrapeWebsite(baseUrl) {
  const result = { name: '', email: '', phone: '', company: '' };
  
  try {
    const { data } = await axios.get(baseUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const $ = cheerio.load(data);
    $('script, style, noscript, iframe, nav, footer, header').remove();

    const bodyText = $('body').text();
    const emails = extractEmails(bodyText);
    const phones = extractPhones(bodyText);

    // mailto + tel links
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = decodeURIComponent($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
      if (!isBlocked(mail) && emailRegex.test(mail)) emails.push(mail);
    });
    $('a[href^="tel:"]').each((_, el) => {
      const phone = $(el).attr('href').replace('tel:', '').trim();
      phones.push(phone);
    });

    // Company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    result.company = extractCompanyFromMeta($) || 
      domain.replace(/\.(com|org|net|io|co|agency|digital|media).*/i, '')
        .split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Name from page
    result.name = cleanName(extractName($)) || '';

    // Contact page scraping
    const contactUrls = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|team|about)/i.test(href) && !href.startsWith('#') && !href.startsWith('javascript')) {
        contactUrls.push(href);
      }
    });

    for (const link of contactUrls.slice(0, 2)) {
      try {
        let url = link.startsWith('http') ? link : new URL(link, baseUrl).href;
        const res = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $c = cheerio.load(res.data);
        $c('script, style, noscript, nav, footer').remove();
        const text = $c('body').text();
        emails.push(...extractEmails(text));
        phones.push(...extractPhones(text));
        if (!result.name) result.name = cleanName(extractName($c)) || '';
      } catch {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    const bizEmails = uniqueEmails.filter(e => !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e));
    
    result.email = bizEmails[0] || uniqueEmails[0] || '';
    result.phone = cleanPhone(uniquePhones[0]) || '';

    // Derive name from email if still empty
    if (!result.name && result.email) {
      const local = result.email.split('@')[0];
      const parts = local.split(/[._-]/)
        .filter(p => p.length >= 3 && !/\d/.test(p))
        .filter(p => !['info', 'sales', 'support', 'contact', 'hello', 'admin', 'partners', 'team', 'marketing', 'office', 'billing', 'accounts'].includes(p.toLowerCase()));
      if (parts.length >= 2) {
        result.name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }

    if (!result.name) result.name = 'Decision Maker';

  } catch (e) {}

  return result;
}

module.exports = { scrapeWebsite };
