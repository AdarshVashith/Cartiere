// utils/generateAvatar.js
// Generates a unique 2D avatar per user using Google Gemini image generation API.
// Falls back to DiceBear if Gemini fails.

const GEMINI_API_KEY = 'AIzaSyB3XD2wzc51dbtoFyko1Gbhfuvry892QVc';
const GEMINI_MODEL = 'gemini-2.0-flash';

/**
 * Generate a unique 2D cartoon avatar for a user using Gemini API.
 * @param {string} email - The user's email (used as a unique seed).
 * @returns {Promise<string>} - A data URL (base64) or fallback URL for the avatar image.
 */
export async function generateAvatar(email) {
  const seed = email.toLowerCase().trim();

  // Build a unique prompt per email
  const hashCode = [...seed].reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const hue = Math.abs(hashCode) % 360;
  const styles = ['minimalist', 'geometric', 'watercolor', 'flat illustration', 'cartoon'];
  const styleIdx = Math.abs(hashCode >> 8) % styles.length;
  const style = styles[styleIdx];

  const prompt = `Create a single cute ${style}-style 2D avatar portrait for a fashion app user. 
Use a dominant color hue of ${hue} degrees. 
The avatar should be a friendly, stylish character bust/portrait with a clean solid background. 
Square format, centered face, modern aesthetic. No text, no watermark.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Gemini API error:', response.status, errText);
      throw new Error(`Gemini API returned ${response.status}`);
    }

    const data = await response.json();

    const candidates = data?.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part?.inlineData?.mimeType?.startsWith('image/')) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }

    console.warn('No image found in Gemini response, falling back to DiceBear');
  } catch (err) {
    console.warn('Gemini avatar generation failed, using DiceBear fallback:', err.message);
  }

  // Fallback: DiceBear deterministic avatar
  const encodedSeed = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodedSeed}`;
}
