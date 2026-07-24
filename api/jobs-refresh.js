const { liveState } = require('../vercel-live');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const state = await liveState(true);
    return res.status(200).json({ ...state.jobSearch, recommendedCount: state.recommendedJobs.length });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Live job refresh failed.' });
  }
};
