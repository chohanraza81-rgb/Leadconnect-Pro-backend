const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

function isBlocked(email) {
  const blocked = [
    'example.com', 'test.com', 'sentry.io', 'ingest.', 'mail.ru', 'yandex.ru',
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com',
    'google.com', 'copyright@', 'no-reply@', 'noreply@',
  ];
  const lower = email.toLowerCase();
  return blocked.some(d => lower.includes(d)) ||
    /^[a-f0-9]{20,}@/i.test(email) ||
    /@\d+\./.test(email) ||
    lower.includes('support') && lower.includes('google');
}

function extractEmails(text) {
  return [...new Set((text.match(emailRegex) || []).filter(e => !isBlocked(e)))];
}

function extractPhones($) {
  const phones = [];
  
  // Look for phone patterns in text
  const bodyText = $('body').text();
  
  // Pakistan phone patterns
  const pkPatterns = [
    /(?:\+92[\s-]?|0)(3\d{2})[\s-]?\d{3}[\s-]?\d{4}/g,
    /03\d{2}[\s-]?\d{3}[\s-]?\d{4}/g,
    /\+92[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}/g,
  ];
  
  // US/International patterns
  const intlPatterns = [
    /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g,
    /\d{3}[\s.-]\d{3}[\s.-]\d{4}/g,
    /\+\d{1,3}[\s-]\d{2,4}[\s-]\d{2,4}[\s-]\d{2,4}/g,
  ];

  // Try Pakistan patterns first
  for (const pattern of pkPatterns) {
    const matches = bodyText.match(pattern) || [];
    phones.push(...matches);
  }
  
  // Try international patterns
  if (phones.length === 0) {
    for (const pattern of intlPatterns) {
      const matches = bodyText.match(pattern) || [];
      phones.push(...matches);
    }
  }

  // Also check tel: links
  $('a[href^="tel:"]').each((_, el) => {
    const phone = $(el).attr('href').replace('tel:', '').trim();
    if (phone.replace(/[^0-9+]/g, '').length >= 10) phones.push(phone);
  });

  // Clean and validate
  return [...new Set(phones)]
    .map(p => p.trim())
    .filter(p => {
      const digits = p.replace(/[^0-9+]/g, '');
      // Must be 10-13 digits
      if (digits.length < 10 || digits.length > 14) return false;
      // Remove fake numbers
      if (/^0{5,}/.test(digits)) return false;
      if (/^1{5,}/.test(digits)) return false;
      if (/^123456/.test(digits)) return false;
      if (/(\d)\1{6,}/.test(digits)) return false;
      // Must start with valid prefix
      if (!digits.startsWith('0') && !digits.startsWith('+') && !digits.startsWith('1')) return false;
      return true;
    });
}

function extractName($) {
  // Try schema.org
  const schema = $('[itemtype*="Person"] [itemprop="name"]').first().text().trim();
  if (schema && schema.split(' ').length >= 2 && schema.length < 40) return schema;

  // Try meta author
  const author = $('meta[name="author"]').attr('content');
  if (author && author.split(' ').length >= 2 && author.length < 40 && !author.includes('WordPress')) return author;

  // Try headings
  const headings = [];
  $('h1, h2, h3, [class*="name"], [class*="title"]').each((_, el) => {
    const text = $(el).text().trim();
    const words = text.split(' ');
    if (words.length >= 2 && words.length <= 4 && text.length < 40 &&
        !/(contact|about|service|product|home|welcome|menu|search|login)/i.test(text)) {
      headings.push(text);
    }
  });
  
  return headings[0] || '';
}

function extractCompany($, domain) {
  return $('meta[property="og:site_name"]').attr('content') ||
         $('title').text()?.split(/[|\-–]/)[0]?.trim() ||
         domain.replace(/\.(com|org|net|io|co|pk|ae).*/i, '')
           .split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function cleanName(name) {
  if (!name) return '';
  const cleaned = name.replace(/[0-9]/g, '').replace(/[^\w\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  if (words.length < 2) return '';
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
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
    const phones = extractPhones($);

    // mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = decodeURIComponent($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
      if (!isBlocked(mail) && emailRegex.test(mail)) emails.push(mail);
    });

    // Company
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    result.company = extractCompany($, domain);

    // Name
    result.name = cleanName(extractName($));

    // Contact pages
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
        phones.push(...extractPhones($c));
        if (!result.name) result.name = cleanName(extractName($c));
      } catch {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    
    // Prefer business emails
    const bizEmails = uniqueEmails.filter(e => 
      !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e)
    );
    
    result.email = bizEmails[0] || uniqueEmails[0] || '';
    result.phone = uniquePhones[0] || '';

    // Derive name from email
    if (!result.name && result.email) {
      const local = result.email.split('@')[0];
      const parts = local.split(/[._-]/)
        .filter(p => p.length >= 3 && !/\d/.test(p))
        .filter(p => !['info', 'sales', 'support', 'contact', 'hello', 'admin', 'chairman', 'partners', 'team', 'marketing'].includes(p.toLowerCase()));
      if (parts.length >= 1) {
        result.name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
    }

    if (!result.name) result.name = 'Decision Maker';

  } catch (e) {}

  return result;
}

module.exports = { scrapeWebsite };
