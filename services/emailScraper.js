const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

const BLOCKED_DOMAINS = [
  'example.com', 'test.com', 'domain.com', 'sentry.io', 'ingest.',
  'mail.ru', 'yandex.ru', 'gmail.com', 'yahoo.com', 'hotmail.com',
  'outlook.com', 'live.com', 'aol.com', 'protonmail.com', 'icloud.com',
];

function isBlocked(email) {
  const lower = email.toLowerCase();
  if (BLOCKED_DOMAINS.some(d => lower.includes(d))) return true;
  if (/^[a-f0-9]{20,}@/i.test(email)) return true;
  if (/@\d+\./.test(email)) return true;
  return false;
}

function extractEmails(text) {
  return [...new Set((text.match(emailRegex) || []).filter(e => !isBlocked(e)))];
}

function extractPhones(text) {
  return [...new Set(
    (text.match(phoneRegex) || [])
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => {
        const digits = p.replace(/[^0-9+]/g, '');
        return digits.length >= 10 && digits.length <= 15;
      })
  )];
}

function cleanName(name) {
  if (!name || name === 'Contact') return '';
  const cleaned = name.replace(/[0-9]/g, '').trim();
  const words = cleaned.split(/[._\-\s]+/)
    .filter(w => w.length >= 3)
    .filter(w => !['info', 'sales', 'support', 'contact', 'hello', 'email', 'admin', 'help', 'team', 'noreply', 'mail', 'test', 'user'].includes(w.toLowerCase()))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length >= 2 ? words.join(' ') : '';
}

async function scrapeWebsite(baseUrl) {
  const result = { name: '', email: '', phone: '', company: '', allEmails: [], allPhones: [] };
  
  try {
    const { data } = await axios.get(baseUrl, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    const $ = cheerio.load(data);
    
    // Remove noise
    $('script, style, noscript, iframe, nav, footer, header, .cookie, .popup, .modal, .ad, .banner').remove();

    // Get ALL text
    const bodyText = $('body').text();
    result.allEmails = extractEmails(bodyText);
    result.allPhones = extractPhones(bodyText);

    // mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const mail = decodeURIComponent($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
      if (!isBlocked(mail) && emailRegex.test(mail)) result.allEmails.push(mail);
    });

    // tel links
    $('a[href^="tel:"]').each((_, el) => {
      const phone = $(el).attr('href').replace('tel:', '').trim();
      if (phone.replace(/[^0-9+]/g, '').length >= 10) result.allPhones.push(phone);
    });

    // Company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    result.company = $('meta[property="og:site_name"]').attr('content') ||
                     $('title').text()?.split('|')[0]?.split(' - ')[0]?.trim() ||
                     domain.replace(/\.(com|org|net|io|co|agency|digital|media).*/i, '')
                       .split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Find AND SCRAPE contact/team/about pages
    const pagesToScrape = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|team|about|support|get-in-touch|connect)/i.test(href) && !href.startsWith('#') && !href.startsWith('javascript')) {
        pagesToScrape.push(href);
      }
    });

    // Also try common paths
    const commonPaths = ['/contact', '/contact-us', '/about', '/team', '/get-in-touch', '/connect'];
    for (const path of commonPaths) {
      pagesToScrape.push(new URL(path, baseUrl).href);
    }

    // Scrape each page (max 5)
    const scrapedUrls = new Set();
    for (const link of pagesToScrape.slice(0, 5)) {
      try {
        let url = link.startsWith('http') ? link : new URL(link, baseUrl).href;
        if (scrapedUrls.has(url)) continue;
        scrapedUrls.add(url);
        
        const res = await axios.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $c = cheerio.load(res.data);
        $c('script, style, noscript, nav, footer').remove();
        const text = $c('body').text();
        result.allEmails = result.allEmails.concat(extractEmails(text));
        result.allPhones = result.allPhones.concat(extractPhones(text));
        $c('a[href^="mailto:"]').each((_, el) => {
          const mail = decodeURIComponent($(el).attr('href') || '').replace('mailto:', '').split('?')[0].trim();
          if (!isBlocked(mail)) result.allEmails.push(mail);
        });
        $c('a[href^="tel:"]').each((_, el) => {
          const phone = $(el).attr('href').replace('tel:', '').trim();
          if (phone.replace(/[^0-9+]/g, '').length >= 10) result.allPhones.push(phone);
        });
      } catch {}
    }

    // Deduplicate
    result.allEmails = [...new Set(result.allEmails)];
    result.allPhones = [...new Set(result.allPhones)];

    // Pick best business email (not personal)
    const bizEmails = result.allEmails.filter(e => 
      !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\.|@icloud\.|@proton\.|@live\./i.test(e)
    );
    result.email = bizEmails[0] || result.allEmails[0] || '';
    result.phone = result.allPhones[0] || '';

    // Derive name
    if (result.email) {
      const local = result.email.split('@')[0];
      result.name = cleanName(local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' '));
    }
    
    if (!result.name) {
      // Try to find a person's name in meta or headings
      const metaAuthor = $('meta[name="author"]').attr('content');
      if (metaAuthor) result.name = cleanName(metaAuthor);
    }
    
    if (!result.name) result.name = 'Team';

  } catch (e) {
    // Return empty result on total failure
  }

  return result;
}

module.exports = { scrapeWebsite };
