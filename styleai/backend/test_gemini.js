const { runVTOPipeline } = require('./vto_pipeline');
require('dotenv').config();

async function testGemini() {
  console.log("=== Testing Gemini 2.0 Flash VTO Model ===");
  console.log("Using API Key:", process.env.GEMINI_API_KEY ? "SET (ends in " + process.env.GEMINI_API_KEY.slice(-4) + ")" : "MISSING");
  
  // Sample URLs (Unsplash public images)
  const avatarUrl = "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400"; // Person
  const topUrl = "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400";    // Shirt
  
  try {
    console.log("Sending request to Gemini... reaching out to multimodal composer...");
    const result = await runVTOPipeline(avatarUrl, topUrl, null);
    
    if (result && result.startsWith('data:image')) {
      console.log("✅ SUCCESS! Gemini returned a valid base64 image string.");
      console.log("Result length:", result.length, "bytes");
    } else {
      console.log("❌ FAILURE: Gemini returned an unexpected result format:", result);
    }
  } catch (err) {
    console.error("❌ FAILED: Gemini returned an error:");
    console.error(err.message);
  }
}

testGemini();
