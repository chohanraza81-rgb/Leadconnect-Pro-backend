const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

function extractEmails(text) {
  if (!text) return [];
  const blocked = ['example.com', 'test.com', 'sentry.io', 'ingest.', 'yourdomain', 'domain.com'];
  return [...new Set((text.match(emailRegex) || []).filter(e => !blocked.some(b => e.includes(b))))];
}

function extractPhones(text) {
  if (!text) return [];
  return [...new Set((text.match(phoneRegex) || []).filter(p => p.replace(/[^0-9]/g, '').length >= 10))];
}

function cleanName(name) {
  if (!name) return '';
  const cleaned = name.replace(/[0-9]/g, '').replace(/[^\w\s]/g, '').trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  return words.length >= 2 ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
}

function extractNameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0];
  const parts = local.split(/[._\-]+/).filter(p => p.length > 1 && !/^\d+$/.test(p));
  if (parts.length >= 2) {
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  return '';
}

async function scrapeWebsite(baseUrl) {
  try {
    const { data } = await axios.get(baseUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const $ = cheerio.load(data);
    $('script, style, noscript, iframe, nav, footer, header').remove();
    const bodyText = $('body').text();
    let emails = extractEmails(bodyText);
    let phones = extractPhones(bodyText);

    // mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = decodeURIComponent($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
      if (emailRegex.test(mail)) emails.push(mail);
    });

    // tel links
    $('a[href^="tel:"]').each((_, el) => {
      const phone = $(el).attr('href').replace('tel:', '').trim();
      if (phone.replace(/[^0-9+]/g, '').length >= 10) phones.push(phone);
    });

    // Company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    let company = $('meta[property="og:site_name"]').attr('content') ||
                  $('title').text()?.split(/[|\-–]/)[0]?.trim() ||
                  domain.replace(/\.(com|org|net|io|co|agency|digital|media).*/i, '')
                       .split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Also try contact page
    const contactLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|about|team|get-in-touch|connect)/i.test(href) && !href.startsWith('#') && !href.startsWith('javascript')) {
        contactLinks.push(href);
      }
    });

    for (const link of contactLinks.slice(0, 2)) {
      try {
        let contactUrl = link.startsWith('http') ? link : new URL(link, baseUrl).href;
        const res = await axios.get(contactUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $c = cheerio.load(res.data);
        $c('script, style, noscript, nav, footer').remove();
        const text = $c('body').text();
        emails = emails.concat(extractEmails(text));
        phones = phones.concat(extractPhones(text));
      } catch {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];

    // Prefer business emails
    const businessEmails = uniqueEmails.filter(e => !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e));
    const primaryEmail = businessEmails[0] || uniqueEmails[0] || '';
    const primaryPhone = uniquePhones[0] || '';

    // Name
    let name = cleanName(extractNameFromEmail(primaryEmail));
    if (!name) {
      const metaAuthor = $('meta[name="author"]').attr('content');
      name = cleanName(metaAuthor) || 'Contact';
    }

    return {
      name,
      email: primaryEmail,
      phone: primaryPhone,
      company,
    };
  } catch (e) {
    return { name: '', email: '', phone: '', company: '' };
  }
}

module.exports = { scrapeWebsite };
