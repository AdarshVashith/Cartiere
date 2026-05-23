const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_IMAGE_FALLBACK_MODEL =
  process.env.GEMINI_IMAGE_FALLBACK_MODEL || "gemini-2.5-flash-image";
const GEMINI_VTO_MODELS = [...new Set([
  GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_FALLBACK_MODEL
].filter(Boolean))];

function isQuotaError(error) {
  const message = String(error?.message || error || "");
  return /429|quota|rate.?limit|too many requests/i.test(message);
}

function attachErrorCode(error, code) {
  error.code = code;
  return error;
}

/**
 * Helper to download an image URL and convert to SDK part
 */
async function imageUrlToPart(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image from ${url}`);
  const buffer = await response.buffer();
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: response.headers.get("content-type") || "image/jpeg"
    }
  };
}

/**
 * Main Gemini VTO Pipeline — Single-step composition using the official SDK
 */
async function runVTOPipeline(personUrl, topUrl, bottomUrl, garmentMeta = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const topName = garmentMeta.topName || "top garment";
    const bottomName = garmentMeta.bottomName || "bottom garment";
    const contentParts = [
      {
        text: `You are a photorealistic virtual try-on fashion editor.
Create exactly one full-body studio image using the provided references.

Reference 1 is the person avatar and must control:
- facial identity
- body shape
- skin tone
- pose
- camera angle
- gray studio background

Important wardrobe editing rules:
- Remove the avatar's original clothing and replace it with the supplied garments.
- If a TOP garment reference is provided, the final image must show that exact top as the person's upper-body clothing.
- If a BOTTOM garment reference is provided, the final image must show that exact bottom as the person's lower-body clothing.
- If both are provided, the final result must include BOTH garments together in the same outfit.
- Do not keep the avatar's original shirt, pants, or layering if replacement garments are provided.
- Match garment color, silhouette, sleeve length, neckline, hem, waistband, texture, and fit as closely as possible.
- Keep the result realistic, balanced, and cleanly composited.
- Return IMAGE only.`
      },
      { text: "Reference 1: person avatar." },
      await imageUrlToPart(personUrl)
    ];

    if (topUrl) {
      contentParts.push({ text: `Reference 2: TOP garment. Use this exact top: ${topName}. This must replace the avatar's original upper-body clothing.` });
      contentParts.push(await imageUrlToPart(topUrl));
    }

    if (bottomUrl) {
      contentParts.push({ text: `Reference ${topUrl ? "3" : "2"}: BOTTOM garment. Use this exact bottom: ${bottomName}. This must replace the avatar's original lower-body clothing.` });
      contentParts.push(await imageUrlToPart(bottomUrl));
    }

    let lastError = null;

    for (const modelName of GEMINI_VTO_MODELS) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      });

      console.log(`Gemini VTO: attempting model ${modelName}...`);

      try {
        const result = await model.generateContent(contentParts, {
          responseModalities: ["IMAGE"]
        });

        const response = await result.response;

        if (!response.candidates || response.candidates.length === 0) {
          const feedback = response.promptFeedback || {};
          throw new Error(`Gemini returned no candidates. Block Reason: ${feedback.blockReason || "Safety systems triggered"}`);
        }

        const parts = response.candidates[0].content.parts;
        const imagePart = parts.find(p => p.inlineData);

        if (!imagePart) {
          const textPart = parts.find(p => p.text);
          if (textPart) {
            throw new Error(`Gemini responded with text instead of an image: "${textPart.text.substring(0, 100)}..."`);
          }
          throw new Error("Gemini generation failed: No image was returned in the part list.");
        }

        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      } catch (error) {
        lastError = error;
        console.error(`Gemini VTO Error (${modelName}):`, error.message);

        const isLastModel = modelName === GEMINI_VTO_MODELS[GEMINI_VTO_MODELS.length - 1];
        if (!isQuotaError(error) || isLastModel) {
          break;
        }
      }
    }

    if (isQuotaError(lastError)) {
      throw attachErrorCode(
        new Error("Virtual try-on is temporarily unavailable because the Gemini image quota has been exceeded."),
        "VTO_QUOTA_EXCEEDED"
      );
    }

    throw lastError || new Error("Virtual try-on failed.");

  } catch (error) {
    console.error("Gemini VTO Error:", error.message);
    throw error;
  }
}

module.exports = { runVTOPipeline };
