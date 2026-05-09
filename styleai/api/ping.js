module.exports = (req, res) => {
  res.json({ status: 'ok', message: 'API is alive', env: process.env.GEMINI_API_KEY ? 'GEMINI_SET' : 'GEMINI_MISSING' })
}
