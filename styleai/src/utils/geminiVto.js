import callBackend from './apiClient';

export const runFrontendVTO = async (avatarUrl, clothImageUrl, category, clothName) => {
  const MODEL = 'gemini-2.5-flash-image'; 

  console.log('Starting Frontend VTO...', { category, clothName, model: MODEL });

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

  const resData = await callBackend('/api/try-on-gemini', {
    avatarImg,
    clothImg,
    prompt
  });

  const vtoData = resData.data;
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
  console.log('Generating isolated garment image via Gemini...', { description });

  const prompt = `Generate a single isolated clothing product image for wardrobe cataloging.
Garment Specifications: ${description}

Hard requirements:
- Show ONLY the garment itself
- No human model
- No mannequin body, hands, face, props, hanger, shelf, floor, or styling scene
- Front-facing product presentation
- Entire garment fully visible inside the frame
- Preserve the EXACT color, fabric, cut, trim, stitching, hardware, and proportions
- Clean e-commerce presentation
- Transparent or perfectly removable plain background
- Sharp edges around the garment
- Do not invent extra accessories or matching pieces unless they are part of the same garment`;

  const resData = await callBackend('/api/generate-garment-gemini', {
    prompt
  });

  const data = resData.data;
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
