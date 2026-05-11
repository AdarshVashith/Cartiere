module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { avatarUrl, clothImageUrl, category, clothName } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!avatarUrl || !clothImageUrl) {
      return res.status(400).json({ error: 'Missing avatarUrl or clothImageUrl' });
    }
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

    // Fetch images helper
    const getB64 = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Fetch failed: ${url}`);
      const b = await r.arrayBuffer();
      return { 
        data: Buffer.from(b).toString('base64'), 
        mimeType: r.headers.get('content-type')?.split(';')[0] || 'image/jpeg' 
      };
    };

    const [avatarImg, clothImg] = await Promise.all([
      getB64(avatarUrl),
      getB64(clothImageUrl)
    ]);

    const prompt = `You are an AI fashion assistant. 
Reference Image 1: A person (user's avatar).
Reference Image 2: A clothing item (${clothName || 'garment'}, ${category || 'fashion'}).

Task: Generate a photorealistic image of the person in Image 1 wearing the item in Image 2.
- Keep the person's identity, face, and body exactly the same.
- Apply the item naturally to their body.
- Background: Neutral studio gray/white.
- Full body shot.
- High resolution, professional fashion photography.`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: avatarImg },
              { inlineData: clothImg },
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
      console.error('Gemini Try-On Error:', err);
      throw new Error(`Gemini API returned ${geminiRes.status}`);
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

    if (!imageBase64) throw new Error('Gemini did not return a try-on image');

    res.status(200).json({ 
      success: true, 
      imageUrl: `data:${imageMime};base64,${imageBase64}`
    });

  } catch (error) {
    console.error('Vercel VTO Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
