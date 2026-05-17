const fetch = require('node-fetch');

const CATEGORY_OPTIONS = [
  'Top',
  'Bottom',
  'Dress',
  'Jacket',
  'Shoes',
  'Accessory',
  'Suit',
  'Sportswear'
];

const UNKNOWN_DETAIL = 'Not clearly visible';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeText(value, fallback = UNKNOWN_DETAIL) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map(entry => String(entry || '').trim())
    .filter(Boolean);
}

function inferCategoryFromGarment(garmentName = '') {
  const garment = garmentName.toLowerCase();
  if (/(shoe|sneaker|loafer|heel|boot|sandal)/.test(garment)) return 'Shoes';
  if (/(dress|gown)/.test(garment)) return 'Dress';
  if (/(jacket|coat|blazer|hoodie|outerwear)/.test(garment)) return 'Jacket';
  if (/(jean|pant|trouser|short|skirt|bottom|cargo|legging)/.test(garment)) return 'Bottom';
  if (/(suit)/.test(garment)) return 'Suit';
  if (/(sport|jersey|track|athletic|gym)/.test(garment)) return 'Sportswear';
  if (/(bag|belt|cap|hat|scarf|watch|jewelry|accessory)/.test(garment)) return 'Accessory';
  return 'Top';
}

function extractGeminiTextPayload(geminiData) {
  const candidates = Array.isArray(geminiData?.candidates) ? geminiData.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return '{}';
}

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

    const prompt = `You are a senior fashion archivist and product analyst. Inspect this single clothing item image in exhaustive detail.

Your job is to extract every visual clue the image reliably supports. Be concrete and avoid vague words like "nice" or "stylish".
Allowed categories: ${CATEGORY_OPTIONS.join(', ')}

Inspect and infer when visible. If a detail cannot be confidently seen, write "Not clearly visible" instead of leaving it blank.
- garment name should be specific and useful for a wardrobe UI
- garment type
- best wardrobe category from the allowed categories
- exact dominant color and secondary color
- pattern or print
- fabric/material and surface texture
- fit/silhouette
- sleeve length
- neckline or collar style
- hem/cuff/placket details
- closure/hardware
- pockets/panels/stitching
- embellishments/logos/graphics
- likely season
- likely use occasions
- gender presentation if obvious from the garment cut only

Return ONLY valid JSON in exactly this shape:
{
  "query": "specific google shopping search query for this item",
  "garment": "specific garment name including color",
  "suggestedCategory": "one of ${CATEGORY_OPTIONS.join(', ')}",
  "details": "single dense paragraph describing the garment precisely for image reconstruction",
  "analysis": {
    "dominantColor": "string",
    "secondaryColors": ["string"],
    "pattern": "string",
    "material": "string",
    "texture": "string",
    "fit": "string",
    "silhouette": "string",
    "sleeveLength": "string",
    "necklineOrCollar": "string",
    "hemDetails": "string",
    "closure": "string",
    "hardware": "string",
    "pockets": "string",
    "stitching": "string",
    "embellishments": "string",
    "season": "string",
    "occasion": ["string"],
    "genderPresentation": "string",
    "confidenceNotes": "string"
  }
}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
    let rawText = extractGeminiTextPayload(geminiData);
    
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
          query: 'clothing item',
          garment: 'Clothing Item',
          suggestedCategory: 'Top',
          details: 'Style details were partially extracted from the uploaded garment image.',
          analysis: {
            dominantColor: UNKNOWN_DETAIL,
            secondaryColors: [],
            pattern: UNKNOWN_DETAIL,
            material: UNKNOWN_DETAIL,
            texture: UNKNOWN_DETAIL,
            fit: UNKNOWN_DETAIL,
            silhouette: UNKNOWN_DETAIL,
            sleeveLength: UNKNOWN_DETAIL,
            necklineOrCollar: UNKNOWN_DETAIL,
            hemDetails: UNKNOWN_DETAIL,
            closure: UNKNOWN_DETAIL,
            hardware: UNKNOWN_DETAIL,
            pockets: UNKNOWN_DETAIL,
            stitching: UNKNOWN_DETAIL,
            embellishments: UNKNOWN_DETAIL,
            season: UNKNOWN_DETAIL,
            occasion: [],
            genderPresentation: UNKNOWN_DETAIL,
            confidenceNotes: 'Model response could not be parsed cleanly.'
          }
        };
      }
    }

    const garmentName = firstNonEmpty(analysis.garment, analysis.query, 'Detected garment');
    const normalizedCategory = CATEGORY_OPTIONS.includes(analysis.suggestedCategory)
      ? analysis.suggestedCategory
      : inferCategoryFromGarment(garmentName);

    const normalizedAnalysis = {
      dominantColor: normalizeText(analysis?.analysis?.dominantColor),
      secondaryColors: normalizeList(analysis?.analysis?.secondaryColors),
      pattern: normalizeText(analysis?.analysis?.pattern),
      material: normalizeText(analysis?.analysis?.material),
      texture: normalizeText(analysis?.analysis?.texture),
      fit: normalizeText(analysis?.analysis?.fit),
      silhouette: normalizeText(analysis?.analysis?.silhouette),
      sleeveLength: normalizeText(analysis?.analysis?.sleeveLength),
      necklineOrCollar: normalizeText(analysis?.analysis?.necklineOrCollar),
      hemDetails: normalizeText(analysis?.analysis?.hemDetails),
      closure: normalizeText(analysis?.analysis?.closure),
      hardware: normalizeText(analysis?.analysis?.hardware),
      pockets: normalizeText(analysis?.analysis?.pockets),
      stitching: normalizeText(analysis?.analysis?.stitching),
      embellishments: normalizeText(analysis?.analysis?.embellishments),
      season: normalizeText(analysis?.analysis?.season),
      occasion: normalizeList(analysis?.analysis?.occasion),
      genderPresentation: normalizeText(analysis?.analysis?.genderPresentation),
      confidenceNotes: normalizeText(analysis?.analysis?.confidenceNotes, 'Generated from visual analysis')
    };

    const normalizedSummary = firstNonEmpty(
      analysis.details,
      `${garmentName}. Dominant color: ${normalizedAnalysis.dominantColor}. Material: ${normalizedAnalysis.material}. Pattern: ${normalizedAnalysis.pattern}. Texture: ${normalizedAnalysis.texture}. Fit: ${normalizedAnalysis.fit}. Collar/neckline: ${normalizedAnalysis.necklineOrCollar}. Sleeve length: ${normalizedAnalysis.sleeveLength}. Hem details: ${normalizedAnalysis.hemDetails}. Closure and hardware: ${normalizedAnalysis.closure}, ${normalizedAnalysis.hardware}.`
    );

    res.status(200).json({
      success: true,
      details: {
        garment: garmentName,
        suggestedCategory: normalizedCategory,
        reconstructionPrompt: normalizedSummary,
        query: String(analysis.query || garmentName),
        summary: normalizedSummary,
        color: normalizedAnalysis.dominantColor,
        brand: 'Detected Style',
        analysis: normalizedAnalysis
      },
      results: [
        {
          title: garmentName,
          link: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(analysis.query || garmentName || 'clothing item')}`,
          source: 'AI Vision'
        }
      ]
    });

  } catch (error) {
    console.error('Visual Search Error:', error.message);
    res.status(500).json({ success: false, error: `Visual search failed: ${error.message}` });
  }
};
