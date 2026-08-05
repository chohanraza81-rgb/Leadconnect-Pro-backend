const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

// Junk email patterns to reject
const junkPatterns = [
  'example.com', 'test.com', 'domain.com', 'email.com', 'mail.com',
  'sentry.io', 'ingest.', 'yourdomain', 'localhost', '127.0.0.1',
  'xxxx', 'noreply', 'no-reply', 'donotreply', 'spam', 'fake',
];

function isJunkEmail(email) {
  const lower = email.toLowerCase();
  return junkPatterns.some(pattern => lower.includes(pattern)) ||
         /^[a-f0-9]{32}@/i.test(email) || // hash-based IDs
         /^\d{10,}@/i.test(email) || // numeric IDs
         /@mail\.ru$/i.test(email) || // personal Russian emails
         /@gmail\.com$/i.test(email) || // personal Gmail (unlikely to be business)
         /@yahoo\./i.test(email) ||
         /@hotmail\./i.test(email) ||
         /@outlook\./i.test(email);
}

function extractEmails(text) {
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)].filter(e => !isJunkEmail(e));
}

function extractPhones(text) {
  const matches = text.match(phoneRegex) || [];
  return [...new Set(matches)].filter(p => p.length >= 10 && p.length <= 15);
}

function deriveNameFromEmail(email) {
  if (!email) return 'Contact';
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/);
  const nameParts = parts
    .filter(p => p.length > 1 && !/^\d+$/.test(p))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1));
  return nameParts.join(' ') || 'Contact';
}

function extractCompanyFromDomain(domain) {
  // Convert domain to company name
  let company = domain
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|io|co|ai|app|dev)$/i, '');
  
  // Capitalize words
  company = company
    .split(/[-.]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  
  return company;
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
    
    // Remove script, style, noscript tags
    $('script, style, noscript, iframe').remove();
    
    let text = $('body').text();
    let emails = extractEmails(text);
    let phones = extractPhones(text);

    // Extract mailto links
    $('a[href^="mailto:"]').each((i, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0].trim();
      if (emailRegex.test(mail) && !isJunkEmail(mail)) {
        emails.push(mail);
      }
    });

    // Look for contact/team/about pages
    const internalLinks = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && /(contact|team|about|support|info|help)/i.test(href)) {
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
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const $c = cheerio.load(contactRes.data);
        $c('script, style, noscript').remove();
        const contactText = $c('body').text();
        emails = emails.concat(extractEmails(contactText));
        phones = phones.concat(extractPhones(contactText));
      } catch (e) {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    const primaryEmail = uniqueEmails[0] || '';
    const primaryPhone = uniquePhones[0] || '';

    // Get domain for company name
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    const companyName = extractCompanyFromDomain(domain);

    return {
      name: deriveNameFromEmail(primaryEmail),
      email: primaryEmail,
      phone: primaryPhone,
      emails: uniqueEmails,
      phones: uniquePhones,
      company: companyName,
    };
  } catch (error) {
    return { name: 'Contact', email: '', phone: '', emails: [], phones: [], company: '' };
  }
}

module.exports = { scrapeWebsite };
