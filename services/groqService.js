const axios = require('axios');
const { getConfig } = require('./config');

async function generateEmailSequence({ firstName, company, offer }) {
  const apiKey = getConfig().groqApiKey;
  if (!apiKey || !apiKey.startsWith('gsk_')) {
    throw new Error('Invalid Groq API key');
  }

  const name = firstName === 'Team' ? 'there' : firstName;

  const prompt = `You are a world-class B2B outreach specialist.

Write 3 personalized outreach messages for ${name} at ${company}. Offer: ${offer}

RULES:
- Keep each message under 80 words
- Be direct, warm, and professional
- No fake templates, make it specific to ${company}

Format exactly:
EMAIL_1
[Day 1 email - Introduction with value proposition]

EMAIL_2
[Day 3 WhatsApp message - Casual, friendly follow-up]

EMAIL_3
[Day 7 email - Final polite follow-up with clear CTA]

Separate each with the exact marker: ---`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert B2B outreach writer. Write personalized, non-generic emails.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8,
        max_tokens: 900,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const text = response.data.choices[0].message.content;
    const parts = text.split('---').map(p => p.trim()).filter(p => p.length > 10);

    if (parts.length < 3) {
      return [
        `Hi ${name},\n\nI've been following ${company}'s work - impressive stuff. I wanted to reach out because ${offer}.\n\nWould you be open to a 10-minute call this week?\n\nBest`,
        `Hey ${name}, just following up on my email. Quick question - would ${offer} be valuable for ${company} right now? Let me know either way. Cheers!`,
        `Hi ${name},\n\nLast follow-up from me. If now isn't the right time for ${offer}, no worries at all. If it is, just reply and we'll set up a quick call.\n\nBest`
      ];
    }

    return parts.slice(0, 3);
  } catch (error) {
    console.error('Groq API error:', error.response?.data || error.message);
    return [
      `Hi ${name},\n\nI came across ${company} and wanted to reach out. ${offer}\n\nWould you be open to a quick chat?\n\nBest`,
      `Hey ${name}, following up on my email. ${offer} - let me know if interested!`,
      `Hi ${name},\n\nLast message from me. If ${offer} sounds interesting, just reply. If not, no worries!\n\nBest`
    ];
  }
}

module.exports = { generateEmailSequence };
