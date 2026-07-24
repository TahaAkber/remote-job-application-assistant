const { liveState } = require('../vercel-live');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json(await liveState(false));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Live job refresh failed.' });
  }
};
