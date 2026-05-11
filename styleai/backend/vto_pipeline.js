const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

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
async function runVTOPipeline(personUrl, topUrl, bottomUrl) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Using gemini-2.5-flash-image for stable multimodal image output
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-image",
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  });

  console.log("Gemini SDK (2.5 Flash): Preparing multimodal VTO request...");

  try {
    const imageParts = [];
    imageParts.push(await imageUrlToPart(personUrl)); // Avatar
    if (topUrl) imageParts.push(await imageUrlToPart(topUrl)); // Top
    if (bottomUrl) imageParts.push(await imageUrlToPart(bottomUrl)); // Bottom

    const prompt = `You are a photorealistic fashion AI. 
    I have provided an avatar of a person and images of clothing. 
    TASK: Synthesize a single new image of the person wearing the provided clothes.
    - KEEP the identity, face, and background identical to the avatar.
    - Apply the garments naturally to the body.
    - OUTPUT: You must respond with the processed IMAGE.`;

    // Multimodal output syntax for Gemini 2.0+ 
    // If the model is 2.5, it should support this.
    const result = await model.generateContent([
      prompt,
      ...imageParts
    ], {
      responseModalities: ["IMAGE"]
    });

    const response = await result.response;
    
    if (!response.candidates || response.candidates.length === 0) {
      const feedback = response.promptFeedback || {};
      throw new Error(`Gemini returned no candidates. Block Reason: ${feedback.blockReason || 'Safety systems triggered'}`);
    }

    const parts = response.candidates[0].content.parts;
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      // If no image, check for text (which means it didn't generate an image)
      const textPart = parts.find(p => p.text);
      if (textPart) {
        throw new Error(`Gemini responded with text instead of an image: "${textPart.text.substring(0, 100)}..."`);
      }
      throw new Error("Gemini generation failed: No image was returned in the part list.");
    }

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

  } catch (error) {
    console.error("Gemini VTO Error:", error.message);
    throw error;
  }
}

module.exports = { runVTOPipeline };
