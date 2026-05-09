module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { wardrobe, profile } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const wardrobeText = (wardrobe || [])
      .map(c => `${c.name} (${c.category}, ${c.color})`)
      .join(', ');

    const prompt = `You are a luxury fashion stylist AI. Analyze this wardrobe and recommend 6 items that would fill style gaps or complement existing pieces.

Wardrobe: ${wardrobeText || 'No items yet'}
Profile: Gender: ${profile?.gender || 'unspecified'}, Skin tone: ${profile?.skinTone || 'neutral'}

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "name": "Item Name",
      "category": "Shirt",
      "reason": "One sentence styling rationale",
      "matchScore": 92,
      "estimatedPrice": 45,
      "searchQuery": "specific google shopping search query"
    }
  ]
}

Use category values from: Shirt, Pant, Jacket, Shoes, Accessory`;

    const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
    if (!groqKey) throw new Error('GROQ_API_KEY is not configured');

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a luxury fashion stylist AI. Respond only with JSON.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      throw new Error(`Groq API error: ${groqRes.status} - ${err}`);
    }

    const groqData = await groqRes.json();
    const rawText = groqData.choices[0].message.content || '{}';
    const parsed = JSON.parse(rawText);
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

    // Enrich with images
    const enrichedItems = rawItems.map(item => {
      const imgPrompt = `Professional studio photo of ${item.name}, fashion, white background, high quality`;
      const productImageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=400&height=500&nologo=true&seed=${Math.floor(Math.random() * 9999)}`;
      const productLink = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.searchQuery || item.name)}`;
      return {
        ...item,
        productImageUrl,
        productLink
      };
    });

    res.status(200).json({ success: true, items: enrichedItems });

  } catch (error) {
    console.error('Discover items error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
