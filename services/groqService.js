const axios = require('axios');
const { getConfig } = require('./config');

async function generateEmailSequence({ firstName, company, offer }) {
  const apiKey = getConfig().groqApiKey;
  const prompt = `Write a 3-step outreach sequence to ${firstName}, CEO of ${company}. Tone: Direct, professional. Offer: ${offer}. 
Email 1 (Day 1): Introduction and value proposition. 
Email 2 (Day 3): Follow-up with social proof. 
Email 3 (Day 7): Final call to action. 
Separate each email with ---.`;

  const response = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'mixtral-8x7b-32768',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const text = response.data.choices[0].message.content;
  return text.split('---').map(e => e.trim()).filter(e => e);
}

module.exports = { generateEmailSequence };
