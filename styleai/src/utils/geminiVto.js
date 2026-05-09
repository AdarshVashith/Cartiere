export const runFrontendVTO = async (avatarUrl, clothImageUrl, category, clothName) => {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL = 'gemini-2.0-flash'; 

  console.log('Starting Frontend VTO...', { category, clothName, model: MODEL });

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');

  // Helper with timeout
  const fetchWithTimeout = async (url, options = {}, timeout = 25000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  };

  // Helper to fetch and resize via wsrv.nl Proxy (bypasses CORS and reduces size)
  const getProxiedImage = async (url) => {
    try {
      // Using wsrv.nl to proxy and resize to 800px width
      const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=800&output=jpg&q=85`;
      console.log(`Fetching via proxy: ${proxiedUrl}`);
      
      const res = await fetchWithTimeout(proxiedUrl);
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          resolve({ inlineData: { mimeType: 'image/jpeg', data: base64data } });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('Proxy fetch failed, trying direct...', e);
      // Fallback to direct fetch if proxy fails
      const res = await fetchWithTimeout(url);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ inlineData: { mimeType: blob.type, data: reader.result.split(',')[1] } });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  };

  console.log('Fetching images via proxy...');
  const [avatarImg, clothImg] = await Promise.all([
    getProxiedImage(avatarUrl),
    getProxiedImage(clothImageUrl)
  ]);
  console.log('Images ready. Requesting Gemini VTO...');

  const prompt = `Task: Photorealistic Virtual Try-On.
Reference Image 1: A person (user's avatar).
Reference Image 2: A clothing item (${clothName || 'garment'}, ${category || 'fashion'}).

Generate a high-resolution professional fashion image of the person from Image 1 wearing the item from Image 2.
- Preserve identity and pose.
- Natural blending.
- Studio background.`;

  const vtoRes = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            avatarImg,
            clothImg,
            { text: prompt }
          ]
        }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    },
    60000 // 60s timeout for generation
  );

  if (!vtoRes.ok) {
    const errText = await vtoRes.text();
    console.error('Gemini VTO Error:', errText);
    throw new Error(`Gemini VTO failed: ${vtoRes.status}`);
  }

  const vtoData = await vtoRes.json();
  console.log('Gemini response received.');
  
  let imageBase64 = null;
  let imageMime = 'image/png';
  
  const candidates = vtoData?.candidates || [];
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

  if (!imageBase64) throw new Error('AI did not return an image. Please try again.');
  return `data:${imageMime};base64,${imageBase64}`;
};

/**
 * Generates a clean, studio-quality image of a garment based on details and reference image.
 * Uses Gemini 2.5 Flash Image for high-fidelity reconstruction.
 */
export const generateCleanGarmentImage = async (originalImageUrl, description) => {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL = 'gemini-2.0-flash';

  console.log('Generating Clean Garment Image via Gemini (Text-to-Image)...', { description });

  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is missing');

  const prompt = `Generate a high-fashion photography studio shot.
Model: A professional high-fashion model wearing the specified garment.
Garment Specifications: ${description}
Setting: Professional studio photography.
Background: Pure, seamless white (#FFFFFF).
Constraint 1: The garment's EXACT COLOR and SHADE must match the description perfectly.
Constraint 2: The garment worn by the model MUST EXACTLY match the analyzed details (fabric texture, cut, fit, pattern, and hardware). Do not alter the garment's design.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt }
          ]
        }],
        generationConfig: { responseModalities: ['IMAGE'] }
      })
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini Generation Error:', errText);
    throw new Error(`Gemini generation failed: ${res.status}`);
  }

  const data = await res.json();
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

  if (!imageBase64) throw new Error('Gemini did not return an image.');
  return `data:${imageMime};base64,${imageBase64}`;
};
