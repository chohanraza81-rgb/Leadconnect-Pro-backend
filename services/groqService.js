const axios = require('axios');
const { getConfig } = require('./config');

async function generateEmailSequence({ firstName, company, offer }) {
  const apiKey = getConfig().groqApiKey;
  
  if (!apiKey || !apiKey.startsWith('gsk_')) {
    throw new Error('Invalid Groq API key');
  }

  const prompt = `Write a 3-step outreach email sequence.

Context:
- Recipient: ${firstName}, CEO of ${company}
- Offer: ${offer}
- Tone: Direct, professional, friendly

Format:
Email 1 (Day 1 - Introduction):
[Write a short email introducing yourself and the offer]

---

Email 2 (Day 3 - Follow-up WhatsApp style):
[Write a casual WhatsApp follow-up message]

---

Email 3 (Day 7 - Final follow-up email):
[Write a final email with a clear call to action]

IMPORTANT: Separate each email with --- exactly as shown. Keep emails under 100 words each.`;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert B2B outreach writer. Write concise, effective emails.' 
          },
          { 
            role: 'user', 
            content: prompt 
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const text = response.data.choices[0].message.content;
    const emails = text.split('---').map(e => e.trim()).filter(e => e.length > 0);
    
    if (emails.length < 3) {
      // If splitting fails, create generic emails
      return [
        `Hi ${firstName},\n\nI came across ${company} and wanted to reach out. ${offer}\n\nWould you be open to a quick chat?\n\nBest regards`,
        `Hi ${firstName}, following up on my previous message. ${offer} - would love to discuss how this could benefit ${company}. Let me know if interested!`,
        `Hi ${firstName}, one last follow-up. If the timing isn't right, no worries. But if you'd like to explore ${offer}, I'm here. Just reply to this email.\n\nBest regards`
      ];
    }
    
    return emails;
  } catch (error) {
    console.error('Groq API error:', error.response?.data || error.message);
    throw new Error('Failed to generate email sequence');
  }
}

module.exports = { generateEmailSequence };
