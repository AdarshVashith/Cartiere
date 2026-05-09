const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testConnectivity() {
  console.log("=== Testing Gemini API Connectivity ===");
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Trying with the "models/" prefix just in case
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    console.log("Sending simple text prompt to gemini-1.5-flash-latest...");
    const result = await model.generateContent("Hello?");
    console.log("Response:", result.response.text());
    console.log("✅ API Connectivity Verified!");
  } catch (err) {
    console.error("❌ API Connectivity Failed:", err.message);
    
    console.log("Retrying with gemini-flash-latest...");
    try {
       const m2 = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
       const r2 = await m2.generateContent("Hi");
       console.log("Response:", r2.response.text());
       console.log("✅ API Connectivity Verified with flash-latest!");
    } catch (e2) {
       console.error("❌ Still failed:", e2.message);
    }
  }
}

testConnectivity();
