module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { avatarUrl, items } = req.body;
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!avatarUrl || !items?.length) {
      return res.status(400).json({ success: false, error: 'Missing avatarUrl or items' });
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const getB64 = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Fetch failed for ${url}`);
      const b = await r.arrayBuffer();
      return { 
        data: Buffer.from(b).toString('base64'), 
        mimeType: r.headers.get('content-type')?.split(';')[0] || 'image/jpeg' 
      };
    };

    // Grab first few garments
    const garments = items.filter(i => i.imageUrl).slice(0, 3);
    const [avatarImg, ...clothImgs] = await Promise.all([
      getB64(avatarUrl),
      ...garments.map(i => getB64(i.imageUrl))
    ]);

    const outfitDesc = items.map(i => `${i.category}: ${i.name}`).join(', ');

    const prompt = `Task: Photorealistic Virtual Try-On.
Reference Image 1: The person (user's avatar).
Clothing Items: ${outfitDesc}.

Generate a high-resolution professional fashion image of the EXACT person from Reference Image 1 wearing the specified outfit. 
- Preserve facial identity and skin tone 100%.
- Background: Clean studio white/gray.
- Full body pose.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: avatarImg },
              ...clothImgs.map(img => ({ inlineData: img })),
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE']
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini error: ${geminiRes.status} - ${err}`);
    }

    const data = await geminiRes.json();
    let imageBase64 = null;
    let imageMime = 'image/png';

    const candidates = data?.candidates || [];
    for (const cand of candidates) {
      const parts = cand?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data;
          imageMime = part.inlineData.mimeType;
          break;
        }
      }
      if (imageBase64) break;
    }

    if (!imageBase64) throw new Error('Gemini failed to return an image candidate');

    res.status(200).json({ 
      success: true, 
      imageUrl: `data:${imageMime};base64,${imageBase64}`,
      provider: 'gemini-vto'
    });

  } catch (error) {
    console.error('VTO Preview Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
