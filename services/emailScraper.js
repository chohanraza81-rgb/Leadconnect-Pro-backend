const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

// Strong block list
const BLOCKED_DOMAINS = [
  'example.com', 'test.com', 'domain.com', 'sentry.io', 'ingest.',
  'mail.ru', 'yandex.ru', 'rambler.ru', 'gmail.com', 'yahoo.com',
  'hotmail.com', 'outlook.com', 'live.com', 'aol.com', 'protonmail.com',
];

const JUNK_WORDS = [
  'info', 'sales', 'support', 'contact', 'hello', 'hi', 'email',
  'admin', 'help', 'marketing', 'office', 'team', 'noreply', 'no-reply',
  'mail', 'test', 'user', 'client', 'b8d3cb12f8cd4751b13bc07a51aa6cf2',
];

function isBlocked(email) {
  const lower = email.toLowerCase();
  if (BLOCKED_DOMAINS.some(d => lower.includes(d))) return true;
  if (/^[a-f0-9]{20,}@/i.test(email)) return true;
  if (/^[0-9]{8,}@/i.test(email)) return true;
  if (/@\d+\./.test(email)) return true;
  return false;
}

function extractEmails(text) {
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)].filter(e => !isBlocked(e));
}

function extractPhones(text) {
  const matches = text.match(phoneRegex) || [];
  return [...new Set(matches)]
    .filter(p => p.replace(/[^0-9]/g, '').length >= 10)
    .filter(p => p.replace(/[^0-9]/g, '').length <= 15);
}

function cleanName(name) {
  if (!name || name === 'Contact') return '';
  let cleaned = name.replace(/[0-9]/g, '').trim();
  let words = cleaned.split(/[._\-\s]+/).filter(Boolean);
  words = words.filter(w => !JUNK_WORDS.includes(w.toLowerCase()));
  words = words.filter(w => w.length >= 3);
  words = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length >= 2 ? words.join(' ') : '';
}

function extractCompanyFromMeta($) {
  const selectors = [
    'meta[property="og:site_name"]',
    'meta[name="twitter:site"]',
    'meta[name="application-name"]',
    'meta[name="author"]',
    'title',
  ];
  for (const sel of selectors) {
    const val = $(sel).attr('content') || $(sel).text();
    if (val && val.length > 2 && val.length < 60) return val.trim();
  }
  return null;
}

async function scrapeWebsite(baseUrl) {
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
    let emails = extractEmails(bodyText);
    let phones = extractPhones(bodyText);

    // mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (!isBlocked(mail)) emails.push(mail);
    });

    // Company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    let companyName = extractCompanyFromMeta($) || domain.replace(/\.(com|org|net|io|co).*/i, '').replace(/[-.]/g, ' ');
    companyName = companyName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Contact page links
    const contactLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|team|about|support)/i.test(href)) contactLinks.push(href);
    });

    for (const link of contactLinks.slice(0, 2)) {
      try {
        let url = link.startsWith('http') ? link : new URL(link, baseUrl).href;
        const res = await axios.get(url, { timeout: 5000 });
        const $c = cheerio.load(res.data);
        $c('script, style, noscript, nav, footer, header').remove();
        const text = $c('body').text();
        emails = emails.concat(extractEmails(text));
        phones = phones.concat(extractPhones(text));
        $c('a[href^="mailto:"]').each((_, el) => {
          const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
          if (!isBlocked(mail)) emails.push(mail);
        });
      } catch {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    const businessEmails = uniqueEmails.filter(e => 
      !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e)
    );
    const bestEmail = businessEmails[0] || uniqueEmails[0] || '';
    const bestPhone = uniquePhones[0] || '';

    // Derive name
    let name = '';
    if (bestEmail) {
      const local = bestEmail.split('@')[0];
      const parts = local.split(/[._-]/).filter(p => p.length >= 3 && !/\d/.test(p));
      name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }

    return {
      name: cleanName(name) || 'Team',
      email: bestEmail,
      phone: bestPhone,
      company: companyName,
    };
  } catch {
    return { name: '', email: '', phone: '', company: '' };
  }
}

module.exports = { scrapeWebsite };
