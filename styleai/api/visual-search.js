const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { imageUrl } = req.body;
    if (!imageUrl) throw new Error('No image URL provided');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    // Fetch and encode the clothing image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error('Could not fetch clothing image');
    const buffer = await imgRes.buffer();
    const mimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const base64 = buffer.toString('base64');

    const prompt = `You are a technical fashion analyst. Analyze this clothing item image in deep detail.
Specifically identify:
- Exact Color and Shade (e.g. Navy blue, Olive green, Crimson red, Pastel pink). THIS IS CRITICAL. Do not misjudge the color.
- Fabric texture (e.g. open-knit, weave type, weight)
- Pattern details (e.g. geometric, checkered, solid)
- Hardware (e.g. buttons, zippers, material)
- Cut and fit (e.g. collar style, hem type, silhouette)

Return ONLY valid JSON in exactly this shape:
{
  "query": "specific google shopping search query for this item",
  "garment": "specific garment name including the exact color (e.g. Men's Navy Blue Open-Knit Polo)",
  "details": "A comprehensive paragraph describing ALL identified features (fabric, pattern, hardware, cut) to be used as a technical image generation prompt",
  "visualMatches": [
    { "title": "Suggested similar item name", "visualDescription": "detailed description for image generation" },
    { "title": "Suggested similar item name 2", "visualDescription": "detailed description for image generation" },
    { "title": "Suggested similar item name 3", "visualDescription": "detailed description for image generation" }
  ]
}`;

    // Call Gemini 2.0 Flash (stable and vision-capable)
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini visual search error:', errText);
      throw new Error(`Gemini API error: ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Clean up potential markdown formatting that Gemini sometimes adds even with responseMimeType
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let analysis = {};
    try {
      analysis = JSON.parse(rawText);
    } catch (e1) {
      console.warn('First JSON parse failed:', e1.message);
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
           analysis = JSON.parse(jsonMatch[0]);
        } else {
           throw new Error("No JSON object found");
        }
      } catch (e2) {
        console.error('Fallback JSON parse failed:', e2.message);
        console.log('Raw text was:', rawText);
        // Provide a safe fallback instead of crashing
        analysis = {
          query: "clothing item",
          garment: "Clothing Item",
          details: "Style details not fully extracted.",
          visualMatches: [
            { title: "Similar Item 1", visualDescription: "similar fashion clothing item" },
            { title: "Similar Item 2", visualDescription: "similar fashion clothing item" }
          ]
        };
      }
    }

    if (!analysis.visualMatches || !analysis.visualMatches.length) {
      analysis.visualMatches = [
        { title: "Similar Item", visualDescription: analysis.garment || "fashion item" }
      ];
    }

    // Build visual results using Pollinations AI for similar item images
    const results = (analysis.visualMatches || []).map((m) => {
      const imgPrompt = `Professional e-commerce product photo, ${m.visualDescription}, clean white background, studio lighting, fashion magazine quality`;
      return {
        title: String(m.title || 'Similar Item'),
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?width=600&height=600&nologo=true&seed=${Math.floor(Math.random() * 99999)}`,
        link: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(analysis.query || m.title)}`,
        source: 'AI Vision'
      };
    });

    res.status(200).json({
      success: true,
      details: {
        garment: String(analysis.garment || 'Clothing Item'),
        material: String(analysis.details || ''),
        brand: 'Detected Style'
      },
      results
    });

  } catch (error) {
    console.error('Visual Search Error:', error.message);
    res.status(500).json({ success: false, error: `Visual search failed: ${error.message}` });
  }
};
