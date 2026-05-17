const fetch = require('node-fetch');

function buildIndiaStoreSearches(query) {
  const encodedQuery = encodeURIComponent(query || 'fashion item');
  return [
    {
      store: 'Amazon India',
      title: 'Search on Amazon',
      link: `https://www.amazon.in/s?k=${encodedQuery}`,
      price: '',
      delivery: ''
    },
    {
      store: 'Flipkart',
      title: 'Search on Flipkart',
      link: `https://www.flipkart.com/search?q=${encodedQuery}`,
      price: '',
      delivery: ''
    },
    {
      store: 'Myntra',
      title: 'Search on Myntra',
      link: `https://www.myntra.com/${encodedQuery}`,
      price: '',
      delivery: ''
    },
    {
      store: 'AJIO',
      title: 'Search on AJIO',
      link: `https://www.ajio.com/search/?text=${encodedQuery}`,
      price: '',
      delivery: ''
    }
  ];
}

function mergePreferredStores(primaryStores, fallbackStores) {
  const seen = new Set();
  const merged = [];
  for (const store of [...primaryStores, ...fallbackStores]) {
    const key = String(store.store || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(store);
  }
  return merged;
}

function buildFallbackProductImage(itemName, category) {
  const prompt = `premium ecommerce product photo of ${itemName || 'fashion item'}, category ${category || 'fashion'}, on a clean light background, studio lighting, realistic clothing catalog image`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=600&height=800&nologo=true&seed=42`;
}

function extractPriceAmount(priceValue) {
  if (typeof priceValue === 'number' && Number.isFinite(priceValue)) return priceValue;
  if (typeof priceValue !== 'string') return null;
  const cleaned = priceValue.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { wardrobe, profile, maxBudget } = req.body || {};
    const groqKey = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

    if (!groqKey) throw new Error('GROQ_API_KEY is not configured');

    const wardrobeText = Array.isArray(wardrobe) && wardrobe.length
      ? wardrobe.map(c => `${c.name} (${c.category}, ${c.color})`).join(', ')
      : 'No items yet';

    const prompt = `You are a senior fashion buyer and personal stylist AI.
Recommend 6 items the user does not already own. Recommendations must fill wardrobe gaps, align with the user's style personality, improve their overall look, be relevant for a shopper in India, and stay within the stated budget when possible.

Wardrobe: ${wardrobeText}
Profile: Gender: ${profile?.gender || 'unspecified'}, Skin tone: ${profile?.skinTone || 'neutral'}, Body type: ${profile?.bodyType || 'unspecified'}, Age: ${profile?.age || 'unspecified'}
Budget: ${maxBudget ? `INR ${maxBudget}` : 'No fixed budget provided'}

Return ONLY valid JSON in this exact shape:
{
  "items": [
    {
      "name": "White Oxford Button-Down Shirt",
      "category": "Shirt",
      "reason": "Short why this was shown",
      "matchScore": 92,
      "estimatedPrice": 3499,
      "searchQuery": "white oxford button down shirt men slim fit india",
      "wardrobeGap": "The wardrobe lacks a crisp formal shirt.",
      "styleBenefit": "It sharpens the overall wardrobe and improves versatility.",
      "personalityFit": "It suits a polished, refined style personality.",
      "outfitLogic": "It pairs with dark trousers, blazers, and loafers for clean smart outfits.",
      "occasions": ["Work", "Dinner", "Smart Casual"],
      "pairWith": ["Black chinos", "Navy blazer", "Leather loafers"],
      "confidence": 93
    }
  ]
}

Use category values from: Shirt, Pant, Jacket, Shoes, Accessory`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You are a senior fashion buyer AI. Respond only with JSON.' },
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
    const rawText = groqData?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawText);
    const numericBudget = Number(maxBudget) > 0 ? Number(maxBudget) : null;
    const rawItems = Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [];
    const serpApiKey = process.env.SERPAPI_KEY || process.env.VITE_SERPAPI_KEY;

    const enrichedItems = await Promise.all(
      rawItems.map(async (item) => {
        const nextItem = {
          name: item.name || 'Recommended item',
          category: item.category || 'Accessory',
          reason: item.reason || 'Recommended to strengthen a wardrobe gap.',
          matchScore: Math.max(60, Math.min(98, Number(item.matchScore) || 60)),
          estimatedPrice: Math.max(299, Math.round(Number(item.estimatedPrice) || 2499)),
          searchQuery: item.searchQuery || item.name || 'fashion item',
          wardrobeGap: item.wardrobeGap || 'This fills a missing category or wardrobe gap.',
          styleBenefit: item.styleBenefit || 'This helps the user look more polished and versatile.',
          personalityFit: item.personalityFit || 'This aligns with the user profile and wardrobe direction.',
          outfitLogic: item.outfitLogic || 'This works with several existing outfit combinations.',
          occasions: Array.isArray(item.occasions) ? item.occasions.slice(0, 4) : [],
          pairWith: Array.isArray(item.pairWith) ? item.pairWith.slice(0, 4) : [],
          confidence: Math.max(60, Math.min(98, Number(item.confidence) || Number(item.matchScore) || 60)),
          stores: [],
          fallbackImageUrl: buildFallbackProductImage(item.name || 'fashion item', item.category || 'Accessory')
        };

        if (!serpApiKey) return nextItem;

        try {
          const serpRes = await fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(nextItem.searchQuery)}&api_key=${serpApiKey}&num=8&gl=in&hl=en`);
          const serpData = await serpRes.json();

          if (Array.isArray(serpData.shopping_results) && serpData.shopping_results.length > 0) {
            const stores = serpData.shopping_results.slice(0, 8).map((result) => ({
              store: result.source || 'Store',
              title: result.title || nextItem.name,
              link: result.link || '',
              price: result.price || '',
              priceValue: extractPriceAmount(result.price),
              delivery: result.delivery || '',
              thumbnail: result.thumbnail || result.image || ''
            })).filter((store) => store.link);

            const first = serpData.shopping_results[0];
            nextItem.productImageUrl = first.thumbnail || first.image;
            nextItem.productLink = first.link;
            nextItem.productSource = first.source;
            nextItem.stores = mergePreferredStores(
              stores.filter((store) => /amazon|flipkart|myntra|ajio/i.test(store.store)),
              buildIndiaStoreSearches(nextItem.searchQuery)
            );
            const pricedStores = nextItem.stores.filter((store) => Number.isFinite(store.priceValue));
            const lowestPriceStore = pricedStores.sort((a, b) => a.priceValue - b.priceValue)[0] || nextItem.stores[0];
            if (lowestPriceStore?.price) nextItem.priceLabel = lowestPriceStore.price;
            if (Number.isFinite(lowestPriceStore?.priceValue)) nextItem.bestPrice = lowestPriceStore.priceValue;
          }
        } catch (error) {
          console.error('Discover enrichment error:', error.message);
          nextItem.stores = buildIndiaStoreSearches(nextItem.searchQuery);
        }

        if (!nextItem.stores.length) nextItem.stores = buildIndiaStoreSearches(nextItem.searchQuery);
        if (!nextItem.productImageUrl) nextItem.productImageUrl = nextItem.fallbackImageUrl;

        return nextItem;
      })
    );

    const budgetFilteredItems = numericBudget
      ? enrichedItems.filter((item) => {
          const comparablePrice = Number.isFinite(item.bestPrice) ? item.bestPrice : item.estimatedPrice;
          return comparablePrice <= numericBudget;
        })
      : enrichedItems;

    const finalItems = (budgetFilteredItems.length ? budgetFilteredItems : enrichedItems).slice(0, 6);

    res.status(200).json({ success: true, items: finalItems });
  } catch (error) {
    console.error('Discover items error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};
