// Search iTunes API for song metadata
const searchMetadata = async (req, res, next) => {
  try {
    const query = req.query.query;
    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const term = encodeURIComponent(query.trim());
    const url = `https://itunes.apple.com/search?term=${term}&entity=musicTrack&limit=10`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Map to the shape the frontend expects
    const results = (data.results || []).map((item) => ({
      title: item.trackName || '',
      album: item.collectionName || '',
      artist: item.artistName || '',
      genre: item.primaryGenreName || '',
      coverArt: item.artworkUrl100 || item.artworkUrl60 || '',
      raw: item,
    }));

    res.json({ results });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  searchMetadata,
};

