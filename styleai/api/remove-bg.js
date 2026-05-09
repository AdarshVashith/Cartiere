const fetch = require('node-fetch');
const FormData = require('form-data');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { imageUrl } = req.body;
    if (!imageUrl) throw new Error('No image URL provided');

    console.log('RemoveBG: Processing URL:', imageUrl);

    const formData = new FormData();
    formData.append('size', 'auto');
    formData.append('image_url', imageUrl);

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': process.env.REMOVEBG_API_KEY },
      body: formData
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.errors?.[0]?.title || 'Background removal failed');
    }

    const buffer = await response.buffer();
    const base64 = buffer.toString('base64');

    res.status(200).json({ 
      success: true, 
      dataUrl: `data:image/png;base64,${base64}` 
    });

  } catch (error) {
    console.error('RemoveBG failed, returning fallback:', error.message);
    res.status(200).json({ 
      success: true, 
      fallback: true,
      error: error.message,
      dataUrl: req.body.imageUrl // Return original as fallback
    });
  }
};
