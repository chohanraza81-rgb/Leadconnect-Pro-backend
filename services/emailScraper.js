const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/g;

function extractEmails(text) {
  return [...new Set(text.match(emailRegex) || [])];
}

function extractPhones(text) {
  return [...new Set(text.match(phoneRegex) || [])].filter(p => p.length > 8);
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

async function scrapeWebsite(baseUrl) {
  try {
    const { data } = await axios.get(baseUrl, { timeout: 8000 });
    const $ = cheerio.load(data);
    let text = $('body').text();
    let emails = extractEmails(text);
    let phones = extractPhones(text);

    // mailto links
    $('a[href^="mailto:"]').each((i, el) => {
      const mail = $(el).attr('href').replace('mailto:', '').split('?')[0];
      if (emailRegex.test(mail)) emails.push(mail);
    });

    // contact page
    const contactLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && /contact/i.test(href)) contactLinks.push(href);
    });

    if (contactLinks.length > 0) {
      let contactUrl = contactLinks[0];
      if (!contactUrl.startsWith('http')) contactUrl = new URL(contactUrl, baseUrl).href;
      try {
        const contactRes = await axios.get(contactUrl, { timeout: 5000 });
        const $c = cheerio.load(contactRes.data);
        const contactText = $c('body').text();
        emails = emails.concat(extractEmails(contactText));
        phones = phones.concat(extractPhones(contactText));
      } catch (e) {}
    }

    const uniqueEmails = [...new Set(emails)];
    const uniquePhones = [...new Set(phones)];
    return {
      name: deriveNameFromEmail(uniqueEmails[0]),
      email: uniqueEmails[0] || '',
      phone: uniquePhones[0] || '',
      emails: uniqueEmails,
      phones: uniquePhones,
    };
  } catch (error) {
    return { name: 'Contact', email: '', phone: '', emails: [], phones: [] };
  }
}

module.exports = { scrapeWebsite };
