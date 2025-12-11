const db = require("../db");
const {
  getSongsByUser,
  getSongByIdAndUser,
  createSong,
  updateSongByUser,
  deleteSongByUser,
} = require("../models/songModel");

// Helper: remove orphaned related rows when no songs reference them
const pruneOrphans = async ({
  albumIds = [],
  artistIds = [],
  genreIds = [],
}) => {
  const uniqueAlbums = [
    ...new Set(albumIds.filter((id) => id !== null && id !== undefined)),
  ];
  const uniqueArtists = [
    ...new Set(artistIds.filter((id) => id !== null && id !== undefined)),
  ];
  const uniqueGenres = [
    ...new Set(genreIds.filter((id) => id !== null && id !== undefined)),
  ];

  for (const albumId of uniqueAlbums) {
    await db.query(
      "DELETE FROM album WHERE album_id = $1 AND NOT EXISTS (SELECT 1 FROM song WHERE album_id = $1)",
      [albumId]
    );
  }

  for (const artistId of uniqueArtists) {
    await db.query(
      "DELETE FROM artist WHERE artist_id = $1 AND NOT EXISTS (SELECT 1 FROM song WHERE artist_id = $1)",
      [artistId]
    );
  }

  for (const genreId of uniqueGenres) {
    await db.query(
      "DELETE FROM genre WHERE genre_id = $1 AND NOT EXISTS (SELECT 1 FROM song WHERE genre_id = $1)",
      [genreId]
    );
  }
};

// List all songs for the logged-in user
const listSongs = async (req, res, next) => {
  try {
    const songs = await getSongsByUser(req.user.user_id);
    res.json(songs);
  } catch (err) {
    next(err);
  }
};

// Get a specific song by ID, only if owned by user
const getSong = async (req, res, next) => {
  try {
    const song = await getSongByIdAndUser(req.params.id, req.user.user_id);
    if (!song) return res.status(404).json({ error: "song not found" });
    res.json(song);
  } catch (err) {
    next(err);
  }
};

// Add a new song for the logged-in user
const addSong = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "audio file is required" });
    }
    const { title, artist_id, album_id, genre_id, duration, cover_image } =
      req.body;
    if (!title || !artist_id || !genre_id || !duration) {
      return res
        .status(400)
        .json({
          error: "title, artist_id, genre_id, and duration are required",
        });
    }
    const file_path = `/uploads/${req.file.filename}`;
    const song = await createSong({
      title,
      artist_id,
      album_id: album_id || null,
      genre_id,
      duration,
      file_path,
      cover_image: cover_image || null,
      user_id: req.user.user_id,
    });
    res.status(201).json(song);
  } catch (err) {
    next(err);
  }
};

// Edit a song, only if it belongs to the logged-in user
const editSong = async (req, res, next) => {
  try {
    if (Object.keys(req.body).length === 0)
      return res.status(400).json({ error: "no fields to update" });

    // Grab the existing song to compare relationships
    const existing = await getSongByIdAndUser(req.params.id, req.user.user_id);
    if (!existing) return res.status(404).json({ error: "song not found" });

    const updated = await updateSongByUser(
      req.params.id,
      req.user.user_id,
      req.body
    );
    if (!updated) return res.status(404).json({ error: "song not found" });

    // If album/artist/genre changed, prune any newly orphaned ones
    await pruneOrphans({
      albumIds: [
        existing.album_id !== updated.album_id ? existing.album_id : null,
      ],
      artistIds: [
        existing.artist_id !== updated.artist_id ? existing.artist_id : null,
      ],
      genreIds: [
        existing.genre_id !== updated.genre_id ? existing.genre_id : null,
      ],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// Delete a song, only if owned by the logged-in user, and cascade orphan cleanup
const removeSong = async (req, res, next) => {
  try {
    // Verify existence and get metadata
    const song = await getSongByIdAndUser(req.params.id, req.user.user_id);
    if (!song) return res.status(404).json({ error: "song not found" });

    const { album_id, artist_id, genre_id } = song;

    // Delete the song
    await deleteSongByUser(req.params.id, req.user.user_id);

    // Cascade-delete orphaned album/artist/genre
    await pruneOrphans({
      albumIds: [album_id],
      artistIds: [artist_id],
      genreIds: [genre_id],
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listSongs,
  getSong,
  addSong,
  editSong,
  removeSong,
};
