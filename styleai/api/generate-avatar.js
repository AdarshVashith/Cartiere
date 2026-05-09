const fetch = require('node-fetch');

async function waitForReplicatePrediction(predictionId) {
  let attempts = 0;
  while (attempts < 60) {
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}` }
    });
    if (!pollRes.ok) throw new Error('Replicate poll failed');
    const result = await pollRes.json();
    if (result.status === 'succeeded' || result.status === 'failed') return result;
    attempts += 1;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Replicate prediction timed out');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { facePhotoUrl, gender, bodyType, height, age } = req.body;
    const prompt = `Full body photo of this exact person, ${gender}, ${bodyType} body build, ${height}cm tall, ${age} years old, standing straight facing forward, plain white background, high fashion photography style.`;

    const repRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: "4fccd1e3ec9c614bbed01d84a7122a76f2d93e15f8a00223eb258c73434190c1", // Flux.1 Dev
        input: { prompt, image: facePhotoUrl, structure: "canny" }
      })
    });

    const prediction = await repRes.json();
    const finalResult = await waitForReplicatePrediction(prediction.id);

    if (finalResult.status === 'failed') throw new Error('Generation failed');

    res.status(200).json({ success: true, avatarUrl: finalResult.output[0] });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
