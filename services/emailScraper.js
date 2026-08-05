const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

// Name words to ignore
const ignoreWords = [
  'info', 'sales', 'support', 'contact', 'hello', 'hi', 'email', 'admin',
  'help', 'marketing', 'office', 'team', 'business', 'service', 'enquiry',
  'enquiries', 'billing', 'accounts', 'careers', 'jobs', 'hr', 'press',
  'media', 'news', 'webmaster', 'postmaster', 'hostmaster', 'abuse',
  'noreply', 'no-reply', 'mail', 'test', 'user', 'client', 'customer'
];

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  const junkDomains = [
    'example.com', 'test.com', 'domain.com', 'email.com',
    'sentry.io', 'ingest.', 'localhost', '127.0.0.1',
    'mail.ru', 'yandex.ru', 'rambler.ru',
  ];
  return junkDomains.some(d => lower.includes(d)) ||
         /^[a-f0-9]{20,}@/i.test(email) ||
         /^[0-9]{8,}@/i.test(email);
}

function extractEmails(text) {
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)].filter(e => !isJunkEmail(e));
}

function extractPhones(text) {
  const matches = text.match(phoneRegex) || [];
  return [...new Set(matches)].filter(p => p.length >= 10 && p.length <= 16);
}

function cleanName(name) {
  if (!name || name === 'Contact') return name;
  
  // Remove numbers
  let cleaned = name.replace(/[0-9]/g, '').trim();
  
  // Split by common separators
  let words = cleaned.split(/[._\-\s]+/).filter(Boolean);
  
  // Filter out junk words
  words = words.filter(w => !ignoreWords.includes(w.toLowerCase()));
  
  // Filter out short nonsense
  words = words.filter(w => w.length >= 2 && !/^[a-z]{1,2}$/i.test(w));
  
  if (words.length === 0) return '';
  
  // Capitalize each word
  words = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  
  // If only one word and it looks like a username, return empty
  if (words.length === 1 && words[0].length <= 5 && /[A-Z][a-z]{1,4}/.test(words[0])) {
    return '';
  }
  
  return words.join(' ');
}

function deriveNameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/);
  const nameParts = parts
    .filter(p => p.length > 1 && !/^\d+$/.test(p))
    .filter(p => !ignoreWords.includes(p.toLowerCase()))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));
  return nameParts.join(' ') || '';
}

function extractCompanyFromDomain(domain) {
  let company = domain
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|app|dev|agency|digital|media|biz|info|us|uk|ae|in)$/i, '');
  
  company = company
    .split(/[-.]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  
  return company || domain;
}

// Try to get company name from meta tags
function extractMetaCompany($) {
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName) return ogSiteName;
  
  const twitterSite = $('meta[name="twitter:site"]').attr('content');
  if (twitterSite) return twitterSite.replace('@', '');
  
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
    
    $('script, style, noscript, iframe, nav, footer').remove();
    
    let text = $('body').text();
    let emails = extractEmails(text);
    let phones = extractPhones(text);

    // mailto links
    $('a[href^="mailto:"]').each((i, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (emailRegex.test(mail) && !isJunkEmail(mail)) {
        emails.push(mail);
      }
    });

    // Get company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    let companyName = extractMetaCompany($) || extractCompanyFromDomain(domain);

    // Find contact page
    const internalLinks = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|team|about)/i.test(href)) {
        internalLinks.push(href);
      }
    });

    // Scrape contact page
    for (const link of internalLinks.slice(0, 2)) {
      try {
        let contactUrl = link;
        if (!contactUrl.startsWith('http')) {
          contactUrl = new URL(contactUrl, baseUrl).href;
        }
        const contactRes = await axios.get(contactUrl, { 
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $c = cheerio.load(contactRes.data);
        $c('script, style, noscript, nav, footer').remove();
        const contactText = $c('body').text();
        emails = emails.concat(extractEmails(contactText));
        phones = phones.concat(extractPhones(contactText));
      } catch (e) {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    
    // Pick best email - prefer business emails over personal
    const businessEmails = uniqueEmails.filter(e => 
      !/@gmail\.|@yahoo\.|@hotmail\.|@outlook\./i.test(e)
    );
    const primaryEmail = businessEmails[0] || uniqueEmails[0] || '';
    const primaryPhone = uniquePhones[0] || '';

    // Derive name from best email
    const derivedName = deriveNameFromEmail(primaryEmail);
    const finalName = cleanName(derivedName);

    return {
      name: finalName || 'Business Contact',
      email: primaryEmail,
      phone: primaryPhone,
      company: companyName,
      allEmails: uniqueEmails.slice(0, 5),
    };
  } catch (error) {
    return { name: '', email: '', phone: '', company: '', allEmails: [] };
  }
}

module.exports = { scrapeWebsite };
