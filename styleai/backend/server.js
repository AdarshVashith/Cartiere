const path = require('path')
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') })
  } catch (e) {}
}
const express = require('express')
const fetch = require('node-fetch')
const FormData = require('form-data')
const fs = require('fs/promises')
const os = require('os')
const { runVTOPipeline } = require('./vto_pipeline')
let gradioClientPromise = null
console.log('SERPAPI_KEY value:', 
  process.env.SERPAPI_KEY 
    ? process.env.SERPAPI_KEY.substring(0, 10) + '...' 
    : 'NOT FOUND'
)
console.log('REMOVEBG_API_KEY value:', 
  process.env.REMOVEBG_API_KEY 
    ? process.env.REMOVEBG_API_KEY.substring(0, 5) + '...' 
    : 'NOT FOUND'
)
console.log('.env file path:', path.resolve('.env'))
console.log('Keys loaded:')
console.log('SERPAPI_KEY:', process.env.SERPAPI_KEY ? 'SET' : 'MISSING')
console.log('REMOVEBG_API_KEY:', process.env.REMOVEBG_API_KEY ? 'SET' : 'MISSING')
console.log('REPLICATE_API_KEY:', process.env.REPLICATE_API_KEY ? 'SET' : 'MISSING')
console.log('GROQ_API_KEY:', process.env.GROQ_API_KEY ? 'SET' : 'MISSING')
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'MISSING')

const app = express()
const configuredFrontendUrls = [
  process.env.FRONTEND_URL,
  process.env.VITE_FRONTEND_URL
].filter(Boolean)
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp'
const GEMINI_IMAGE_FALLBACK_MODEL =
  process.env.GEMINI_IMAGE_FALLBACK_MODEL || 'gemini-1.5-flash'
const GEMINI_IMAGE_CANDIDATE_MODELS = [
  GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_FALLBACK_MODEL
].filter(Boolean)
let geminiModelListCache = null

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin
  const allowOrigin = requestOrigin && configuredFrontendUrls.includes(requestOrigin)
    ? requestOrigin
    : configuredFrontendUrls[0] || '*'

  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 
    'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 
    'Content-Type, Authorization, Accept')
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  next()
})

app.use(express.json({ limit: '50mb' }))

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null

    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing authorization token' })
    }

    const firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY
    if (!firebaseApiKey) {
      return res.status(500).json({ success: false, error: 'Firebase API key not configured for auth verification' })
    }

    const verifyResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    )

    const verifyData = await verifyResponse.json()
    if (!verifyResponse.ok || !verifyData.users?.length) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' })
    }

    req.user = verifyData.users[0]
    next()
  } catch (error) {
    console.error('Auth verification error:', error.message)
    return res.status(401).json({ success: false, error: 'Authentication failed' })
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Backend running', 
    endpoints: [
      '/api/generate-avatar',
      '/api/try-on',
      '/api/visual-search', 
      '/api/remove-bg'
    ]
  })
})

async function waitForReplicatePrediction(predictionId) {
  let attempts = 0

  while (attempts < 60) {
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`
        }
      }
    )

    if (!pollRes.ok) {
      const errData = await pollRes.json()
      throw new Error(errData.detail || errData.error || JSON.stringify(errData))
    }

    const result = await pollRes.json()
    console.log(`Poll ${attempts + 1}: ${result.status}`)

    if (result.status === 'succeeded' || result.status === 'failed') {
      return result
    }

    attempts += 1
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  throw new Error('Replicate prediction timed out')
}

/**
 * Helper to download an image URL into a Blob
 */
async function urlToBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image from ${url}`);
  return response.blob();
}

async function createGroqJsonResponse({ systemPrompt, userPrompt, maxTokens = 1000 }) {
  if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_key_here') {
    throw new Error('GROQ_API_KEY missing or not configured')
  }

  const makeGroqRequest = async (useJsonMode) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: maxTokens,
        temperature: 0.2,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    const data = await response.json()
    return { response, data }
  }

  const extractJsonObject = (text) => {
    try {
      return JSON.parse(text)
    } catch (error) {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start === -1 || end === -1 || end <= start) {
        throw error
      }

      const candidate = text.slice(start, end + 1)
      return JSON.parse(candidate)
    }
  }

  let { response, data } = await makeGroqRequest(true)

  if (!response.ok) {
    const groqError = data?.error?.message || 'Groq request failed'
    const shouldRetryWithoutJsonMode =
      groqError.toLowerCase().includes('failed to generate json') ||
      groqError.toLowerCase().includes('failed_generation')

    if (shouldRetryWithoutJsonMode) {
      console.warn('Groq JSON mode failed, retrying without strict JSON mode')
      const retry = await makeGroqRequest(false)
      response = retry.response
      data = retry.data
    }
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Groq request failed')
  }

  const responseText = data?.choices?.[0]?.message?.content
  if (!responseText) {
    throw new Error('Groq returned an empty response')
  }

  return {
    rawText: responseText,
    parsed: extractJsonObject(responseText)
  }
}

// ENDPOINT 1 — Generate avatar with Replicate Flux
app.post('/api/generate-avatar', async (req, res) => {
  try {
    const { facePhotoUrl, gender, bodyType, height, age } = req.body

    console.log('=== Generate Avatar ===')
    console.log({ gender, bodyType, height, age, facePhotoUrl })

    if (!facePhotoUrl) {
      throw new Error('No face photo URL provided')
    }

    const prompt = `Full body photo of this exact person,
      ${gender}, ${bodyType} body build,
      ${height}cm tall, ${age} years old,
      standing straight facing forward,
      hands relaxed at sides,
      wearing casual modern outfit,
      plain white background,
      fashion lookbook photography,
      full body visible from head to toe,
      high quality sharp professional photo,
      studio lighting`

    const startResponse = await fetch(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          input: {
            prompt: prompt,
            input_image: facePhotoUrl,
            output_format: 'jpg',
            output_quality: 90,
            safety_tolerance: 2,
            prompt_upsampling: true
          }
        })
      }
    )

    if (!startResponse.ok) {
      const errData = await startResponse.json()
      throw new Error(errData.detail || errData.error || JSON.stringify(errData))
    }

    let result = await startResponse.json()
    console.log('Prediction ID:', result.id)

    if (result.status !== 'succeeded' && result.status !== 'failed') {
      result = await waitForReplicatePrediction(result.id)
    }

    if (result.status === 'failed') {
      throw new Error('Generation failed: ' + (result.error || 'Unknown'))
    }

    if (!result.output) {
      throw new Error('No output received')
    }

    const imageUrl = Array.isArray(result.output)
      ? result.output[0]
      : result.output

    const imgRes = await fetch(imageUrl)
    const imgBuffer = await imgRes.arrayBuffer()
    const base64 = Buffer.from(imgBuffer).toString('base64')

    console.log('=== Avatar Generated Successfully ===')
    res.json({ success: true, base64, url: imageUrl })

  } catch (err) {
    console.error('Avatar error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ENDPOINT 2 — Virtual try-on with Hugging Face Inference
app.post('/api/try-on', async (req, res) => {
  try {
    const { avatarUrl, clothImageUrl, category } = req.body

    console.log('=== Virtual Try-On (Hugging Face) ===')
    if (!avatarUrl || !clothImageUrl) {
      throw new Error('Missing avatarUrl or clothImageUrl')
    }

    // Determine if it's a top or bottom
    const isBottom = ['Bottom', 'Pants', 'Skirt', 'Shorts', 'Pants (Jeans)'].includes(category);
    
    const resultImage = await runVTOPipeline(
      avatarUrl,
      isBottom ? null : clothImageUrl,
      isBottom ? clothImageUrl : null
    );

    res.json({
      success: true,
      imageUrl: resultImage,
      provider: 'gemini'
    })
  } catch (err) {
    console.error('Try-on error details:', err)
    res.status(500).json({ success: false, error: err.message, provider: 'gemini' })
  }
})

// ENDPOINT 2B — Full outfit preview with Hugging Face VTO pipeline
app.post('/api/generate-outfit-preview', async (req, res) => {
  try {
    const { avatarUrl, items } = req.body

    if (!avatarUrl || !Array.isArray(items)) {
      throw new Error('Missing avatarUrl or items')
    }

    // Sort items into Top and Bottom categories for the 2-step pipeline
    // Sort items into Top and Bottom categories (case-insensitive)
    const topItem = items.find(i => {
      const cat = (i.category || '').toLowerCase();
      return ['top', 'jacket', 'dress', 'suit', 'sportswear', 'shirt', 'upperwear'].includes(cat);
    });
    
    const bottomItem = items.find(i => {
      const cat = (i.category || '').toLowerCase();
      return ['bottom', 'pants', 'skirt', 'shorts', 'pants (jeans)', 'lowerwear'].includes(cat);
    });

    if (!topItem && !bottomItem) {
      throw new Error('No compatible garments (Top or Bottom) found for preview')
    }

    console.log(`Outfit Preview: Top=${topItem?.name || 'none'}, Bottom=${bottomItem?.name || 'none'}`);

    const resultImage = await runVTOPipeline(
      avatarUrl, 
      topItem?.imageUrl || null, 
      bottomItem?.imageUrl || null
    );

    res.json({
      success: true,
      imageUrl: resultImage,
      provider: 'gemini'
    })
  } catch (err) {
    console.error('Outfit preview error details:', err)
    res.status(500).json({ 
      success: false, 
      error: err.message || "Preview service is currently unavailable.",
      provider: 'gemini' 
    })
  }
})

// ENDPOINT 3 — Google Lens visual search
app.post('/api/visual-search', async (req, res) => {
  try {
    const { imageUrl } = req.body
    console.log('=== Visual Search ===')
    console.log('Image URL:', imageUrl)
    console.log('SerpApi Key:', process.env.SERPAPI_KEY ? 'SET' : 'MISSING')

    if (!imageUrl) throw new Error('No image URL provided')
    if (!process.env.SERPAPI_KEY) {
      throw new Error('SERPAPI_KEY missing from .env')
    }

    const serpUrl = new URL('https://serpapi.com/search.json')
    serpUrl.searchParams.set('engine', 'google_lens')
    serpUrl.searchParams.set('url', imageUrl)
    serpUrl.searchParams.set('api_key', process.env.SERPAPI_KEY)

    console.log('Calling SerpApi...')
    const response = await fetch(serpUrl.toString())
    const data = await response.json()

    console.log('SerpApi response status:', response.status)
    console.log('SerpApi error:', data.error || 'none')

    if (data.error) throw new Error(data.error)

    const results = (data.visual_matches || [])
      .slice(0, 6)
      .map(item => ({
        title: item.title || 'Similar item',
        imageUrl: item.thumbnail || item.image,
        link: item.link || '',
        source: item.source || ''
      }))
      .filter(item => item.imageUrl)

    console.log('Results found:', results.length)
    if (results.length === 0) {
      return res.json({
        success: true,
        fallback: true,
        results: [
          {
            title: 'Original upload',
            imageUrl,
            link: '',
            source: 'fallback'
          }
        ]
      })
    }

    res.json({ success: true, results })

  } catch (err) {
    console.error('Visual search error:', err.message)
    const { imageUrl } = req.body || {}
    return res.json({
      success: true,
      fallback: true,
      error: err.message,
      results: imageUrl
        ? [
            {
              title: 'Original upload',
              imageUrl,
              link: '',
              source: 'fallback'
            }
          ]
        : []
    })
  }
})

// ENDPOINT 4 — Remove background
app.post('/api/remove-bg', async (req, res) => {
  try {
    const { imageUrl } = req.body
    
    console.log('=== Remove Background ===')
    console.log('Image URL:', imageUrl)
    console.log('API Key:', 
      process.env.REMOVEBG_API_KEY ? 'SET' : 'MISSING')

    if (!imageUrl) {
      throw new Error('No image URL provided')
    }

    if (!process.env.REMOVEBG_API_KEY) {
      throw new Error('REMOVEBG_API_KEY missing')
    }

    // Use query string approach instead of form-data
    const params = new URLSearchParams({
      image_url: imageUrl,
      size: 'auto'
    })

    const response = await fetch(
      'https://api.remove.bg/v1.0/removebg?' + params.toString(),
      {
        method: 'POST',
        headers: {
          'X-Api-Key': process.env.REMOVEBG_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    )

    console.log('Remove.bg status:', response.status)

    if (!response.ok) {
      const errText = await response.text()
      console.error('Remove.bg error:', errText)
      
      // If remove.bg fails use original image without bg removal
      console.log('Falling back to original image...')
      return res.json({ 
        success: true, 
        dataUrl: imageUrl,
        fallback: true
      })
    }

    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    console.log('Background removed successfully')
    res.json({ success: true, base64, dataUrl })

  } catch (err) {
    console.error('Remove bg error:', err.message)
    
    // Fallback — return original image if removal fails
    res.json({ 
      success: true, 
      dataUrl: req.body.imageUrl,
      fallback: true,
      error: err.message
    })
  }
})

// ENDPOINT 5 — Generate Outfit of the Day with Groq
app.post('/api/generate-outfit', async (req, res) => {
  try {
    const { occasion, timeOfDay, destination, vibe, weather, profile, wardrobe } = req.body

    console.log('=== Generate Outfit Recommendation ===')
    console.log({ occasion, timeOfDay, destination, vibe, weather })

    const systemPrompt = `You are a professional fashion stylist AI. 
    You select outfits from a user's existing wardrobe.
    Always respond with ONLY valid JSON. No markdown, no explanation outside the JSON object.`

    const wardrobeList = wardrobe.map(item => 
      `- ID: ${item.id}, Name: ${item.name}, Category: ${item.category}, Color: ${item.color}`
    ).join('\n')

    const userPrompt = `
    Please recommend an outfit from my wardrobe based on the following context:

    USER PROFILE:
    - Gender: ${profile.gender}
    - Body Type: ${profile.bodyType}
    - Skin Tone: ${profile.skinTone}

    CURRENT WEATHER:
    - Temperature: ${weather.temp}°C
    - Condition: ${weather.description}

    DAILY CONTEXT:
    - Occasion: ${occasion}
    - Time of Day: ${timeOfDay}
    - Destination: ${destination}
    - Vibe/Goal: ${vibe}

    AVAILABLE WARDROBE ITEMS:
    ${wardrobeList}

    INSTRUCTIONS:
    1. Select 2-3 items from the wardrobe list that would make a great cohesive outfit for this specific occasion and weather.
    2. Provide a creative name for the outfit (2-4 words).
    3. Explain why this works (2-3 sentences), mentioning the temperature and skin tone.
    4. Provide a style score (70-98).
    5. Include 3 complementary hex colors for this look.
    6. Add one short hair tip.

    JSON SCHEMA TO RETURN:
    {
      "success": true,
      "outfitName": "string",
      "whyThisWorks": "string",
      "items": [
        { "id": "string", "name": "string", "category": "string", "color": "string", "imageUrl": "string", "reason": "string" }
      ],
      "hairTip": "string",
      "colorPalette": ["#hex1", "#hex2", "#hex3"],
      "styleScore": number
    }
    `

    const groqResponse = await createGroqJsonResponse({
      systemPrompt,
      userPrompt,
      maxTokens: 800
    })
    console.log('Groq Raw Response:', groqResponse.rawText)

    try {
      const outfitRecommendation = groqResponse.parsed
      
      // Ensure imageUrls are preserved from the original wardrobe
      outfitRecommendation.items = outfitRecommendation.items.map(recItem => {
        const originalItem = wardrobe.find(w => w.id === recItem.id)
        return {
          ...recItem,
          imageUrl: originalItem ? originalItem.imageUrl : recItem.imageUrl
        }
      })

      res.json(outfitRecommendation)
    } catch (parseError) {
      console.error('Failed to parse Groq response:', parseError)
      res.status(500).json({ success: false, error: 'AI generated invalid response format' })
    }

  } catch (err) {
    console.error('Outfit generation error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// ENDPOINT 6 — Discover Wardrobe Gaps
app.post('/api/discover-items', requireAuth, async (req, res) => {
  try {
    const { wardrobe, profile } = req.body

    console.log('=== Discover Items ===')
    console.log('Authenticated user:', req.user?.localId || 'unknown')

    if (!Array.isArray(wardrobe)) {
      throw new Error('Wardrobe must be an array')
    }

    if (!profile || typeof profile !== 'object') {
      throw new Error('Profile is required')
    }

    const systemPrompt = `You are a fashion buyer AI. Analyze a user's wardrobe and recommend specific items they need.
Respond with ONLY valid JSON. No markdown, no preamble.`

    const wardrobeList = wardrobe.length > 0
      ? wardrobe
          .map(item => `- Name: ${item.name || 'Unnamed item'}, Category: ${item.category || 'Unknown'}, Color: ${item.color || 'Unknown'}`)
          .join('\n')
      : 'No items in wardrobe'

    const userPrompt = `
    Profile summary:
    - Gender: ${profile?.gender || 'Unknown'}
    - Age: ${profile?.age || 'Unknown'}
    - Body Type: ${profile?.bodyType || 'Unknown'}
    - Skin Tone: ${profile?.skinTone || 'Unknown'}

    Current wardrobe inventory:
    ${wardrobeList}

    What 6 items should this person buy next? For each item provide:
    name (specific product name), category, reason (why they need it, mention wardrobe gaps),
    matchScore (60-98, how well it fills a gap), estimatedPrice (USD integer),
    searchQuery (a Google Shopping search string for this exact item)

    Expected response JSON:
    {
      "items": [
        {
          "name": "White Oxford Button-Down Shirt",
          "category": "Shirt",
          "reason": "No formal shirts in wardrobe — needed for Work occasions",
          "matchScore": 92,
          "estimatedPrice": 45,
          "searchQuery": "white oxford button down shirt men slim fit"
        }
      ]
    }
    `

    const groqResponse = await createGroqJsonResponse({
      systemPrompt,
      userPrompt,
      maxTokens: 1000
    })
    console.log('Groq Raw Response for Discover:', groqResponse.rawText)

    let parsedResponse
    try {
      parsedResponse = groqResponse.parsed
    } catch (parseError) {
      console.error('Failed to parse Groq response:', parseError)
      return res.status(500).json({ success: false, error: 'AI generated invalid response format' })
    }

    const items = Array.isArray(parsedResponse.items) ? parsedResponse.items.slice(0, 6) : []
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const enrichedItem = {
          name: item.name || 'Recommended item',
          category: item.category || 'Accessory',
          reason: item.reason || 'Recommended to strengthen a wardrobe gap.',
          matchScore: Math.max(60, Math.min(98, Number(item.matchScore) || 60)),
          estimatedPrice: Math.max(1, Math.round(Number(item.estimatedPrice) || 25)),
          searchQuery: item.searchQuery || item.name || 'fashion item'
        }

        if (!process.env.SERPAPI_KEY) {
          return enrichedItem
        }

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 2500)
          const serpUrl = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(enrichedItem.searchQuery)}&api_key=${process.env.SERPAPI_KEY}&num=1`
          const serpRes = await fetch(serpUrl, { signal: controller.signal })
          clearTimeout(timeout)
          const serpData = await serpRes.json()

          if (serpData.shopping_results && serpData.shopping_results.length > 0) {
            const result = serpData.shopping_results[0]
            enrichedItem.productImageUrl = result.thumbnail
            enrichedItem.productLink = result.link
            enrichedItem.productSource = result.source
          }
        } catch (e) {
          console.error('SerpAPI error for item', item.name, e.message || e)
        }

        return enrichedItem
      })
    )

    res.json({ success: true, items: enrichedItems })

  } catch (err) {
    console.error('Discover items error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

const PORT = Number(process.env.PORT || 3001)

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`=== Backend running on http://localhost:${PORT} ===`)
    console.log('Endpoints ready:')
    console.log('  POST /api/generate-avatar')
    console.log('  POST /api/try-on')
    console.log('  POST /api/visual-search')
    console.log('  POST /api/remove-bg')
    console.log('  POST /api/generate-outfit')
    console.log('  POST /api/discover-items')
  })

  server.on('error', (err) => {
    console.error('Backend startup error:', err.message)
  })
}

module.exports = app
