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
  process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
const GEMINI_IMAGE_FALLBACK_MODEL =
  process.env.GEMINI_IMAGE_FALLBACK_MODEL || 'gemini-2.5-flash-image'
const GEMINI_IMAGE_CANDIDATE_MODELS = [
  GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_FALLBACK_MODEL
].filter(Boolean)
let geminiModelListCache = null
const WARDROBE_CATEGORY_OPTIONS = [
  'Top',
  'Bottom',
  'Dress',
  'Jacket',
  'Shoes',
  'Accessory',
  'Suit',
  'Sportswear'
]
const UNKNOWN_DETAIL = 'Not clearly visible'

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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function normalizeText(value, fallback = UNKNOWN_DETAIL) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback
  return value.map(entry => String(entry || '').trim()).filter(Boolean)
}

function inferCategoryFromGarment(garmentName = '') {
  const garment = garmentName.toLowerCase()
  if (/(shoe|sneaker|loafer|heel|boot|sandal)/.test(garment)) return 'Shoes'
  if (/(dress|gown)/.test(garment)) return 'Dress'
  if (/(jacket|coat|blazer|hoodie|outerwear)/.test(garment)) return 'Jacket'
  if (/(jean|pant|trouser|short|skirt|bottom|cargo|legging)/.test(garment)) return 'Bottom'
  if (/(suit)/.test(garment)) return 'Suit'
  if (/(sport|jersey|track|athletic|gym)/.test(garment)) return 'Sportswear'
  if (/(bag|belt|cap|hat|scarf|watch|jewelry|accessory)/.test(garment)) return 'Accessory'
  return 'Top'
}

function extractGeminiTextPayload(geminiData) {
  const candidates = Array.isArray(geminiData?.candidates) ? geminiData.candidates : []
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    for (const part of parts) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text.trim()
      }
    }
  }
  return '{}'
}

function parseJsonFromText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Model returned empty JSON text')
  }

  try {
    return JSON.parse(rawText)
  } catch (error) {
    const start = rawText.indexOf('{')
    const end = rawText.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw error
    }
    return JSON.parse(rawText.slice(start, end + 1))
  }
}

function buildIndiaStoreSearches(query) {
  const encodedQuery = encodeURIComponent(query || 'fashion item')
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
      title: 'Explore Flipkart',
      link: `https://www.flipkart.com/search?q=${encodedQuery}`,
      price: '',
      delivery: ''
    },
    {
      store: 'Myntra',
      title: 'Explore Myntra',
      link: `https://www.myntra.com/${encodedQuery}`,
      price: '',
      delivery: ''
    },
    {
      store: 'AJIO',
      title: 'Explore AJIO',
      link: `https://www.ajio.com/search/?text=${encodedQuery}`,
      price: '',
      delivery: ''
    }
  ]
}

function mergePreferredStores(primaryStores, fallbackStores) {
  const seen = new Set()
  const merged = []

  for (const store of [...primaryStores, ...fallbackStores]) {
    const key = String(store.store || '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(store)
  }

  return merged
}

function buildFallbackProductImage(itemName, category) {
  const prompt = `premium ecommerce product photo of ${itemName || 'fashion item'}, category ${category || 'fashion'}, on a clean light background, studio lighting, realistic clothing catalog image`
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=600&height=800&nologo=true&seed=42`
}

function extractPriceAmount(priceValue) {
  if (typeof priceValue === 'number' && Number.isFinite(priceValue)) return priceValue
  if (typeof priceValue !== 'string') return null
  const cleaned = priceValue.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
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

// ENDPOINT 3 — Detailed cloth analysis for wardrobe intake
app.post('/api/visual-search', async (req, res) => {
  try {
    const { imageUrl } = req.body
    console.log('=== Visual Search ===')
    console.log('Image URL:', imageUrl)
    console.log('Gemini Key:', process.env.GEMINI_API_KEY ? 'SET' : 'MISSING')

    if (!imageUrl) throw new Error('No image URL provided')
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY missing from .env')
    }

    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('Could not fetch clothing image')
    const buffer = await imgRes.buffer()
    const mimeType = imgRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
    const base64 = buffer.toString('base64')

    const prompt = `You are a senior fashion archivist and product analyst. Inspect this single clothing item image in exhaustive detail.

Your job is to extract every visual clue the image reliably supports. Be concrete and avoid vague words like "nice" or "stylish".
If a detail cannot be confidently seen, write "Not clearly visible" instead of leaving it blank.
Allowed categories: ${WARDROBE_CATEGORY_OPTIONS.join(', ')}

Inspect and infer when visible:
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
  "suggestedCategory": "one of ${WARDROBE_CATEGORY_OPTIONS.join(', ')}",
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
}`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    )

    const geminiData = await response.json()
    if (!response.ok) {
      throw new Error(geminiData?.error?.message || `Gemini API error: ${response.status}`)
    }

    let rawText = extractGeminiTextPayload(geminiData)
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim()

    let analysis = {}
    try {
      analysis = JSON.parse(rawText)
    } catch (e1) {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0])
        } else {
          throw e1
        }
      } catch (e2) {
        console.error('Visual analysis parse failed:', e2.message)
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
        }
      }
    }

    const garmentName = firstNonEmpty(analysis.garment, analysis.query, 'Detected garment')
    const normalizedCategory = WARDROBE_CATEGORY_OPTIONS.includes(analysis.suggestedCategory)
      ? analysis.suggestedCategory
      : inferCategoryFromGarment(garmentName)

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
    }

    const normalizedSummary = firstNonEmpty(
      analysis.details,
      `${garmentName}. Dominant color: ${normalizedAnalysis.dominantColor}. Material: ${normalizedAnalysis.material}. Pattern: ${normalizedAnalysis.pattern}. Texture: ${normalizedAnalysis.texture}. Fit: ${normalizedAnalysis.fit}. Collar/neckline: ${normalizedAnalysis.necklineOrCollar}. Sleeve length: ${normalizedAnalysis.sleeveLength}. Hem details: ${normalizedAnalysis.hemDetails}. Closure and hardware: ${normalizedAnalysis.closure}, ${normalizedAnalysis.hardware}.`
    )

    return res.json({
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
          imageUrl,
          link: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(analysis.query || garmentName || 'clothing item')}`,
          source: 'AI Vision'
        }
      ]
    })

  } catch (err) {
    console.error('Visual search error:', err.message)
    return res.status(500).json({ success: false, error: err.message })
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
    const { wardrobe, profile, maxBudget } = req.body

    console.log('=== Discover Items ===')
    console.log('Authenticated user:', req.user?.localId || 'unknown')

    if (!Array.isArray(wardrobe)) {
      throw new Error('Wardrobe must be an array')
    }

    if (!profile || typeof profile !== 'object') {
      throw new Error('Profile is required')
    }

    const systemPrompt = `You are a senior fashion buyer and personal stylist AI.
Recommend items the user does NOT already own, and explain the style logic clearly.
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
    - Occupation: ${profile?.job || 'Unknown'}
    - City: ${profile?.city || 'Unknown'}
    - Style interests: ${Array.isArray(profile?.styleInterests) && profile.styleInterests.length ? profile.styleInterests.join(', ') : 'Not provided'}
    - Clothing needs: ${Array.isArray(profile?.lifestyleNeeds) && profile.lifestyleNeeds.length ? profile.lifestyleNeeds.join(', ') : 'Not provided'}
    - Target aesthetic: ${profile?.targetAesthetic || 'Not provided'}
    - Architect summary: ${profile?.architectSummary || 'Not provided'}

    Current wardrobe inventory:
    ${wardrobeList}

    Budget:
    - Maximum budget per product: ${maxBudget ? `INR ${maxBudget}` : 'No fixed budget provided'}

    What 6 items should this person buy next? Recommendations must:
    - assume the wardrobe submitted is the user's complete wardrobe
    - fill gaps in the current wardrobe
    - match the user's likely style personality, field of interest, and profile
    - improve outfit versatility, polish, layering, contrast, or occasion coverage
    - cover the kinds of clothing this person would realistically require for their lifestyle and goals
    - avoid recommending items they effectively already own
    - be relevant for a shopper in India
    - stay within the stated budget when possible

    For each item provide:
    - name: specific product name
    - category: one of Shirt, Pant, Jacket, Shoes, Accessory
    - reason: short 1-2 sentence explanation of why this item is being shown
    - matchScore: 60-98
    - estimatedPrice: INR integer
    - searchQuery: an India-friendly shopping search string for this exact item
    - wardrobeGap: what is missing from the wardrobe
    - styleBenefit: how this improves the user's overall look
    - personalityFit: how it matches the user's style personality
    - outfitLogic: practical styling logic for how it works with existing wardrobe pieces
    - occasions: array of 2-4 occasions where it will help
    - pairWith: array of 2-4 wardrobe item types or pieces it pairs with
    - confidence: integer 60-98

    Expected response JSON:
    {
      "items": [
        {
          "name": "White Oxford Button-Down Shirt",
          "category": "Shirt",
          "reason": "No formal shirts in wardrobe — needed for Work occasions",
          "matchScore": 92,
          "estimatedPrice": 3499,
          "searchQuery": "white oxford button down shirt men slim fit india",
          "wardrobeGap": "The wardrobe lacks a crisp formal shirt.",
          "styleBenefit": "It sharpens the overall wardrobe and gives cleaner structure near the face.",
          "personalityFit": "This works for someone building a polished, versatile, quietly refined style.",
          "outfitLogic": "It can be paired with dark trousers, layered under a blazer, or worn open with chinos.",
          "occasions": ["Work", "Dinner", "Smart Casual"],
          "pairWith": ["Black chinos", "Navy blazer", "Leather loafers"],
          "confidence": 93
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

    const numericBudget = Number(maxBudget) > 0 ? Number(maxBudget) : null
    const items = Array.isArray(parsedResponse.items) ? parsedResponse.items.slice(0, 8) : []
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const enrichedItem = {
          name: item.name || 'Recommended item',
          category: item.category || 'Accessory',
          reason: item.reason || 'Recommended to strengthen a wardrobe gap.',
          matchScore: Math.max(60, Math.min(98, Number(item.matchScore) || 60)),
          estimatedPrice: Math.max(299, Math.round(Number(item.estimatedPrice) || 2499)),
          searchQuery: item.searchQuery || item.name || 'fashion item',
          wardrobeGap: item.wardrobeGap || 'This fills a missing category or styling gap in the current wardrobe.',
          styleBenefit: item.styleBenefit || 'This recommendation adds polish and improves outfit flexibility.',
          personalityFit: item.personalityFit || 'It aligns with the user profile and current style direction.',
          outfitLogic: item.outfitLogic || 'It works across multiple outfits and adds stronger styling range.',
          occasions: Array.isArray(item.occasions) ? item.occasions.slice(0, 4) : [],
          pairWith: Array.isArray(item.pairWith) ? item.pairWith.slice(0, 4) : [],
          confidence: Math.max(60, Math.min(98, Number(item.confidence) || Number(item.matchScore) || 60)),
          stores: [],
          fallbackImageUrl: buildFallbackProductImage(item.name || 'fashion item', item.category || 'Accessory')
        }

        if (!process.env.SERPAPI_KEY) {
          return enrichedItem
        }

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 2500)
          console.log(`SerpAPI request for: ${enrichedItem.searchQuery}`)
          const serpUrl = `https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(enrichedItem.searchQuery)}&api_key=${process.env.SERPAPI_KEY}&num=8&gl=in&hl=en`
          const serpRes = await fetch(serpUrl, { signal: controller.signal })
          clearTimeout(timeout)
          const serpData = await serpRes.json()
          console.log(`SerpAPI results found: ${serpData.shopping_results?.length || 0}`)

            if (serpData.shopping_results && serpData.shopping_results.length > 0) {
              const rawStores = serpData.shopping_results
                .map((result) => ({
                  store: result.source || 'Store',
                  title: result.title || enrichedItem.name,
                  link: result.link || result.product_link || '',
                  price: result.price || '',
                  priceValue: extractPriceAmount(result.price),
                  delivery: result.delivery || '',
                  thumbnail: result.thumbnail || result.image || ''
                }))
                .filter((store) => store.link)

              // Sort by price (cheapest first)
              const pricedStores = rawStores
                .filter(s => Number.isFinite(s.priceValue))
                .sort((a, b) => a.priceValue - b.priceValue)
              
              const unpricedStores = rawStores.filter(s => !Number.isFinite(s.priceValue))
              const sortedStores = [...pricedStores, ...unpricedStores]

              // Take top 4 for the UI
              const candidateStores = sortedStores.slice(0, 4)

              // Step 2: Resolve stores into direct merchant links (PDP)
              await Promise.all(candidateStores.map(async (store) => {
                const lowerStore = store.store.toLowerCase();
                const isMajorStore = lowerStore.includes('amazon') || 
                                     lowerStore.includes('myntra') || 
                                     lowerStore.includes('flipkart') || 
                                     lowerStore.includes('ajio');

                // Try to resolve via Google Product ID if available
                const originalResult = serpData.shopping_results.find(r => r.source === store.store && r.title === store.title);
                if (originalResult?.product_id) {
                  try {
                    const productUrl = `https://serpapi.com/search.json?engine=google_product&product_id=${originalResult.product_id}&api_key=${process.env.SERPAPI_KEY}&gl=in&hl=en`
                    const productRes = await fetch(productUrl);
                    const productData = await productRes.json();
                    if (productData.sellers_results?.online_sellers) {
                      const seller = productData.sellers_results.online_sellers.find(s => s.name.toLowerCase().includes(lowerStore));
                      if (seller?.link) {
                        console.log(`Resolved ${store.store} via Product ID to: ${seller.link.substring(0, 40)}...`);
                        store.link = seller.link;
                        return;
                      }
                    }
                  } catch (e) {
                    console.error('Product ID resolution failed', e.message);
                  }
                }

                // Fallback to organic search
                if (isMajorStore || store.link.includes('google.com')) {
                  try {
                    let siteFilter = '';
                    if (lowerStore.includes('amazon')) siteFilter = 'site:amazon.in';
                    else if (lowerStore.includes('myntra')) siteFilter = 'site:myntra.com';
                    else if (lowerStore.includes('flipkart')) siteFilter = 'site:flipkart.com';
                    else if (lowerStore.includes('ajio')) siteFilter = 'site:ajio.com';

                    const searchQuery = `${store.title} ${siteFilter} buy`;
                    const organicUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(searchQuery)}&api_key=${process.env.SERPAPI_KEY}&num=3&gl=in&hl=en`
                    const organicRes = await fetch(organicUrl)
                    const organicData = await organicRes.json()
                    
                    if (organicData.organic_results && organicData.organic_results.length > 0) {
                      const bestLink = organicData.organic_results.find(res => 
                        res.link.includes('/dp/') || res.link.includes('/p/') || 
                        res.link.includes('/buy') || res.link.includes('/product') ||
                        res.link.includes('.html')
                      ) || organicData.organic_results[0];

                      if (bestLink?.link) {
                        console.log(`Resolved ${store.store} via Organic to: ${bestLink.link.substring(0, 40)}...`)
                        store.link = bestLink.link
                      }
                    }
                  } catch (e) {
                    console.error('Organic resolution failed for', store.store, e.message)
                  }
                }
              }))

              enrichedItem.stores = candidateStores

              // The very first result in candidateStores is our "Best Match" (cheapest)
              const bestMatch = candidateStores[0] || serpData.shopping_results[0]
              
              enrichedItem.productImageUrl = bestMatch.thumbnail || bestMatch.image || bestMatch.image_url
              enrichedItem.productLink = bestMatch.link || bestMatch.product_link
              enrichedItem.productSource = bestMatch.store || bestMatch.source || 'Shop'
              
              if (bestMatch.price) {
                enrichedItem.priceLabel = bestMatch.price
              }
              if (Number.isFinite(bestMatch.priceValue)) {
                enrichedItem.bestPrice = bestMatch.priceValue
              }
            }
          } catch (e) {
            console.error('SerpAPI error for item', item.name, e.message || e)
            enrichedItem.stores = buildIndiaStoreSearches(enrichedItem.searchQuery)
          }

          if (!enrichedItem.stores || !enrichedItem.stores.length) {
            enrichedItem.stores = buildIndiaStoreSearches(enrichedItem.searchQuery)
          }

          if (!enrichedItem.productImageUrl) {
            enrichedItem.productImageUrl = enrichedItem.fallbackImageUrl
          }

          return enrichedItem
        })
      )

    const budgetFilteredItems = numericBudget
      ? enrichedItems.filter((item) => {
          const comparablePrice = Number.isFinite(item.bestPrice) ? item.bestPrice : item.estimatedPrice
          return comparablePrice <= numericBudget
        })
      : enrichedItems

    const finalItems = (budgetFilteredItems.length ? budgetFilteredItems : enrichedItems).slice(0, 6)

    res.json({ success: true, items: finalItems })

  } catch (err) {
    console.error('Discover items error:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/image-architect', requireAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType, targetAesthetic, profile, wardrobe } = req.body

    if (!imageBase64 || !mimeType) {
      throw new Error('Image upload is required')
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY missing or not configured')
    }

    const systemPrompt = `Role: Expert Image Architect and Biometric Stylist.
Objective: Deconstruct the user's uploaded image to identify aesthetic leakage and provide a technical roadmap to reach the chosen target aesthetic.
Return ONLY valid JSON. No markdown, no preamble.`

    const wardrobeList = Array.isArray(wardrobe) && wardrobe.length
      ? wardrobe
          .map(item => `- ${item.name || 'Unnamed'} (${item.category || 'Unknown'}, ${item.color || 'Unknown'})`)
          .join('\n')
      : 'No wardrobe items provided'

    const userPrompt = `
Target aesthetic: ${targetAesthetic || 'Quiet Luxury'}

Profile:
- Gender: ${profile?.gender || 'Unknown'}
- Age: ${profile?.age || 'Unknown'}
- Body Type: ${profile?.bodyType || 'Unknown'}
- Skin Tone: ${profile?.skinTone || 'Unknown'}
- Occupation: ${profile?.job || 'Unknown'}
- Style interests: ${Array.isArray(profile?.styleInterests) && profile.styleInterests.length ? profile.styleInterests.join(', ') : 'Not provided'}
- Clothing needs: ${Array.isArray(profile?.lifestyleNeeds) && profile.lifestyleNeeds.length ? profile.lifestyleNeeds.join(', ') : 'Not provided'}

Wardrobe snapshot:
${wardrobeList}

Analyze the image in four phases:
1. Chromatic & Skin Tone Mapping
2. Silhouette & Geometric Gap Analysis
3. Grooming & Structural Engineering
4. Missing Link recommendations

Then generate outfit suggestions based on this analysis.

JSON shape:
{
  "phase1": {
    "hexCodes": ["#000000"],
    "undertone": "",
    "contrastRatio": "",
    "powerPalette": ["#000000"],
    "colorSummary": ""
  },
  "phase2": {
    "proportions": "",
    "hemlineAdvice": "",
    "volumeAnalysis": "",
    "frameAdvice": "",
    "shoulderHipAlignment": ""
  },
  "phase3": {
    "faceShape": "",
    "hairstyles": ["", "", ""],
    "groomingSpecs": "",
    "muscleFocus": ["", ""],
    "biologicalGoals": ""
  },
  "phase4": {
    "hardware": ["", ""],
    "footwear": ["", ""],
    "missingLinkSummary": ""
  },
  "outfitSuggestions": [
    {
      "name": "",
      "category": "Shirt",
      "reason": "",
      "styleUpgrade": "",
      "searchQuery": "",
      "estimatedPrice": 3500
    }
  ],
  "summary": ""
}
`

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `${systemPrompt}\n\n${userPrompt}` },
              { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            response_mime_type: 'application/json'
          }
        })
      }
    )

    const geminiData = await geminiResponse.json()
    if (!geminiResponse.ok) {
      throw new Error(geminiData?.error?.message || 'Gemini image architect request failed')
    }

    const rawText = extractGeminiTextPayload(geminiData)
    const parsed = parseJsonFromText(rawText)
    const outfitSuggestions = Array.isArray(parsed.outfitSuggestions) ? parsed.outfitSuggestions.slice(0, 6) : []

    const enrichedSuggestions = outfitSuggestions.map((item) => ({
      name: item.name || 'Architect recommendation',
      category: item.category || 'Accessory',
      reason: item.reason || 'Recommended from the biometric style analysis.',
      styleUpgrade: item.styleUpgrade || 'This supports the target aesthetic and improves visual structure.',
      searchQuery: item.searchQuery || item.name || 'fashion item',
      estimatedPrice: Math.max(499, Math.round(Number(item.estimatedPrice) || 2999)),
      fallbackImageUrl: buildFallbackProductImage(item.name || 'fashion item', item.category || 'Accessory')
    }))

    res.json({
      success: true,
      analysis: {
        phase1: parsed.phase1 || {},
        phase2: parsed.phase2 || {},
        phase3: parsed.phase3 || {},
        phase4: parsed.phase4 || {},
        summary: parsed.summary || ''
      },
      outfitSuggestions: enrichedSuggestions
    })
  } catch (err) {
    console.error('Image architect error:', err.message)
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
    console.log('  POST /api/image-architect')
  })

  server.on('error', (err) => {
    console.error('Backend startup error:', err.message)
  })
}

module.exports = app
