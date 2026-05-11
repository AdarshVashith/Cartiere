module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { occasion, timeOfDay, gender, skinTone, vibe, wardrobe } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const wardrobeText = (wardrobe || []).map(c => `${c.name} (${c.category}, ${c.color})`).join(', ');

    const prompt = `Act as a professional fashion stylist. Generate a personalized outfit recommendation from the user's wardrobe.
    Occasion: ${occasion}
    Time: ${timeOfDay}
    Vibe: ${vibe}
    User Attributes: ${gender}, ${skinTone}
    Wardrobe: ${wardrobeText || 'Empty'}

    Respond as valid JSON:
    {
      "name": "Outfit Name",
      "description": "Why this works",
      "items": [{"name": "Exact Name from Wardrobe", "category": "Top/Bottom/Shoes"}],
      "stylingTip": "One pro tip"
    }`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini error: ${geminiRes.status} - ${err}`);
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const outfitResult = JSON.parse(rawText);

    res.status(200).json({ success: true, outfit: outfitResult });

  } catch (error) {
    console.error('Generate Outfit API Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
