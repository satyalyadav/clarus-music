import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

// Load backend-specific environment variables from app/backend/.env
// (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, etc.)
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple in-memory cache for Spotify access tokens
let spotifyTokenCache = {
  token: null,
  expiresAt: 0,
};

// Helper to get a Spotify access token using Client Credentials flow
async function getSpotifyAccessToken() {
  const now = Date.now();

  // Return cached token if still valid
  if (spotifyTokenCache.token && now < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  // Backend-only env vars (recommended: do not expose secrets via Vite)
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Spotify] Missing credentials:",
        "SPOTIFY_CLIENT_ID present?",
        !!clientId,
        "SPOTIFY_CLIENT_SECRET present?",
        !!clientSecret
      );
    }
    throw new Error("Spotify credentials not configured");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Spotify auth failed: ${response.status} ${response.statusText} ${text}`
    );
  }

  const data = await response.json();

  // Cache token (expires in ~1 hour; use a small buffer)
  spotifyTokenCache.token = data.access_token;
  spotifyTokenCache.expiresAt = now + (data.expires_in - 300) * 1000;

  return data.access_token;
}

// Helper function to fetch artist image from Bandcamp artist profile
async function fetchArtistImageFromBandcamp(artistName) {
  try {
    // Search for the artist on Bandcamp
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(
      artistName
    )}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Look for artist results (not albums/tracks)
    let artistProfileUrl = null;

    $(".result-items .searchresult, .result-items .result, .searchresult").each(
      (i, el) => {
        const $el = $(el);
        const typeText =
          $el.find(".itemtype, .type, .result-info .item-type").text() || "";

        // Check if this is an artist result
        if (/artist|band/i.test(typeText)) {
          const resultTitle = $el
            .find(".heading, .result-info .heading")
            .text()
            .trim();

          // Normalize names for comparison
          const normalizeName = (name) =>
            name.toLowerCase().trim().replace(/\s+/g, " ");

          if (normalizeName(resultTitle) === normalizeName(artistName)) {
            let url =
              $el.find("a.item-link, a.searchresult, a").attr("href") || "";
            if (url && url.startsWith("/")) {
              url = `https://bandcamp.com${url}`;
            }
            if (url) {
              artistProfileUrl = url;
              return false; // Break the loop
            }
          }
        }
      }
    );

    if (!artistProfileUrl) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `Could not find Bandcamp profile for artist: ${artistName}`
        );
      }
      return null;
    }

    // Fetch the artist profile page
    const profileResponse = await fetch(artistProfileUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!profileResponse.ok) {
      return null;
    }

    const profileHtml = await profileResponse.text();
    const $profile = cheerio.load(profileHtml);

    // Extract artist image using the same selectors as track/album pages
    const artistImageSelectors = [
      ".band-photo img",
      ".band-photo",
      ".band-photo-container img",
      ".band-photo-container",
      ".band-photo-wrapper img",
      "a.band-photo img",
      ".band-photo a img",
      ".band-photo-link img",
    ];

    for (const selector of artistImageSelectors) {
      const img = $profile(selector).first();
      if (img.length) {
        const src =
          img.attr("src") || img.attr("data-src") || img.attr("data-original");
        if (src) {
          try {
            let artistImage = src.startsWith("http")
              ? src
              : new URL(src, artistProfileUrl).href;

            // Remove size parameters for higher quality
            artistImage = artistImage.replace(/_\d+\.(jpg|png)$/, "_0.$1");

            if (process.env.NODE_ENV !== "production") {
              console.log(
                `Found artist image for ${artistName}: ${artistImage}`
              );
            }
            return { imageUrl: artistImage, sourceUrl: artistProfileUrl };
          } catch (e) {
            // Invalid URL, continue
          }
        }
      }
    }

    return null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`Error fetching artist image for ${artistName}:`, error);
    }
    return null;
  }
}

// Endpoint to fetch artist image from Bandcamp
app.get("/api/bandcamp-artist-image", async (req, res) => {
  try {
    const { artist } = req.query;

    if (!artist || typeof artist !== "string") {
      return res.status(400).json({ error: "Artist parameter is required" });
    }

    const artistImage = await fetchArtistImageFromBandcamp(artist.trim());

    if (artistImage?.imageUrl) {
      return res.json({
        imageUrl: artistImage.imageUrl,
        sourceUrl: artistImage.sourceUrl || null,
      });
    }
    return res.json({ imageUrl: null, sourceUrl: null });
  } catch (error) {
    console.error("Error in /api/bandcamp-artist-image:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to fetch artist image",
    });
  }
});

// Bandcamp metadata extraction endpoint
app.get("/api/bandcamp-metadata", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const urlString = url.toString();
    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (e) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Basic safety checks to avoid fetching local/internal resources
    const isDisallowedHostname = (hostname) => {
      const lower = hostname.toLowerCase();
      if (
        lower === "localhost" ||
        lower.endsWith(".localhost") ||
        lower.endsWith(".local") ||
        lower.endsWith(".internal")
      ) {
        return true;
      }
      if (lower === "::1") return true;
      if (lower.startsWith("fe80:")) return true;
      if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
        const parts = lower.split(".").map((part) => parseInt(part, 10));
        if (parts.some((part) => Number.isNaN(part) || part > 255)) {
          return true;
        }
        if (parts[0] === 10) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
          return true;
        }
      }

      return false;
    };

    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }

    if (isDisallowedHostname(urlObj.hostname)) {
      return res.status(400).json({ error: "Invalid Bandcamp URL" });
    }

    // Only allow track/album pages for metadata extraction
    if (
      !urlObj.pathname.includes("/track/") &&
      !urlObj.pathname.includes("/album/")
    ) {
      return res.status(400).json({ error: "Invalid Bandcamp URL" });
    }

    const normalizedUrl = urlObj.toString();

    // Fetch the Bandcamp page
    const response = await fetch(normalizedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Bandcamp page: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Detect if this is an album or track URL
    const isAlbum = urlObj.pathname.includes("/album/");
    const isTrack = urlObj.pathname.includes("/track/");

    // Debug: Log the first part of the HTML (development only)
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Fetched page, HTML length:",
        html.length,
        "Type:",
        isAlbum ? "album" : isTrack ? "track" : "unknown"
      );
    }

    let metadata = {
      title: "",
      album: "",
      artist: "",
      artistImage: "", // Artist profile image
      coverArt: "",
      audioUrl: "", // The actual audio stream URL
      duration: "", // Duration in HH:MM:SS format
    };

    let allTracks = []; // For album pages
    let tralbumData = null; // Store parsed tralbum data for later use

    const applyTralbumData = (data) => {
      if (!data) return;
      tralbumData = data;
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "Found data-tralbum:",
          JSON.stringify(tralbumData, null, 2).substring(0, 500)
        );
      }

      if (
        tralbumData.trackinfo &&
        Array.isArray(tralbumData.trackinfo) &&
        tralbumData.trackinfo.length > 0
      ) {
        // If it's an album, extract all tracks
        if (isAlbum) {
          allTracks = tralbumData.trackinfo.map((track, index) => {
            let audioUrl = "";
            if (track.file) {
              audioUrl =
                track.file["mp3-128"] ||
                track.file["mp3-v0"] ||
                Object.values(track.file)[0] ||
                "";
            }

            let duration = "";
            if (track.duration) {
              const durationSeconds = track.duration;
              const hours = Math.floor(durationSeconds / 3600);
              const minutes = Math.floor((durationSeconds % 3600) / 60);
              const seconds = Math.floor(durationSeconds % 60);
              duration = `${String(hours).padStart(2, "0")}:${String(
                minutes
              ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            }

            // Parse track title to extract artist and title if in "Artist - Track Name" format
            let trackTitle = track.title || "";
            let trackArtist = null;

            // Check for "Artist - Track Name" format (common on compilation albums)
            // Note: Artist part may contain multiple artists like "NA-3LDK / DEFRIC"
            // Use a pattern that matches hyphen with spaces (the separator) rather than hyphens in artist names
            // Match from the end: look for the last " - " pattern (with spaces)
            const lastSeparatorIndex = trackTitle.lastIndexOf(" - ");
            if (lastSeparatorIndex > 0) {
              trackArtist = trackTitle
                .substring(0, lastSeparatorIndex)
                .trim();
              trackTitle = trackTitle
                .substring(lastSeparatorIndex + 3)
                .trim();
            } else {
              // Fallback: try pattern without spaces (but prefer the spaced version)
              const titleMatch = trackTitle.match(/^(.+?)\s+-\s+(.+)$/);
              if (titleMatch) {
                trackArtist = titleMatch[1].trim();
                trackTitle = titleMatch[2].trim();
              }
            }

            return {
              title: trackTitle,
              artist: trackArtist, // Individual track artist(s) if extracted (may contain "/" or "&" for multiple)
              duration: duration,
              audioUrl: audioUrl,
              trackNumber: index + 1,
            };
          });
        } else {
          // For track pages, just get the first track
          const track = tralbumData.trackinfo[0];

          // Extract audio URL
          if (track.file) {
            metadata.audioUrl =
              track.file["mp3-128"] ||
              track.file["mp3-v0"] ||
              Object.values(track.file)[0] ||
              "";
            if (process.env.NODE_ENV !== "production") {
              console.log(
                "Extracted audio URL from data-tralbum:",
                metadata.audioUrl
              );
            }
          }

          // Extract duration
          if (track.duration) {
            const durationSeconds = track.duration;
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const seconds = Math.floor(durationSeconds % 60);
            metadata.duration = `${String(hours).padStart(2, "0")}:${String(
              minutes
            ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            if (process.env.NODE_ENV !== "production") {
              console.log(
                "Extracted duration from data-tralbum:",
                metadata.duration
              );
            }
          }

          // Extract title
          if (track.title) {
            metadata.title = track.title;
          }
        }
      }

      // Extract artist from current object
      if (tralbumData.artist) {
        metadata.artist = tralbumData.artist;
      }

      // Extract album info
      if (tralbumData.current) {
        if (tralbumData.current.title && !metadata.title) {
          metadata.title = tralbumData.current.title;
        }
        if (tralbumData.current.album_title) {
          metadata.album = tralbumData.current.album_title;
        }
      }
    };

    const extractJsonObject = (source, marker) => {
      const markerIndex = source.indexOf(marker);
      if (markerIndex === -1) return null;
      const startIndex = source.indexOf("{", markerIndex);
      if (startIndex === -1) return null;
      let depth = 0;
      let inString = false;
      let escapeNext = false;
      let quoteChar = "";

      for (let i = startIndex; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escapeNext) {
            escapeNext = false;
          } else if (ch === "\\") {
            escapeNext = true;
          } else if (ch === quoteChar) {
            inString = false;
          }
          continue;
        }

        if (ch === '"' || ch === "'") {
          inString = true;
          quoteChar = ch;
          continue;
        }

        if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            return source.slice(startIndex, i + 1);
          }
        }
      }

      return null;
    };

    // Method 0: Search raw HTML for bcbits.com URLs (most aggressive)
    // These URLs often look like: "mp3-128":"https://t4.bcbits.com/stream/..."
    // They can also be in escaped form: "mp3-128":"https:\/\/t4.bcbits.com\/stream\/..."
    const patterns = [
      /"mp3-128"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
      /"mp3-v0"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
      /mp3-128['"]\s*:\s*['"]?(https?:\/\/[^'">\s]+bcbits\.com[^'">\s]+)/i,
      /(https?:\/\/t\d+\.bcbits\.com\/stream\/[^"'\s<>]+)/i,
      // Escaped URLs
      /"mp3-128"\s*:\s*"(https?:\\\/\\\/[^"]+bcbits\.com[^"]+)"/i,
      // Look for any bcbits.com URL
      /(https?:(?:\/\/|\\\/\\\/)[\w.-]*bcbits\.com[^"'\s<>\\]+)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // Unescape the URL if needed
        metadata.audioUrl = match[1].replace(/\\\//g, "/");
        if (process.env.NODE_ENV !== "production") {
          console.log("Found bcbits.com URL in raw HTML:", metadata.audioUrl);
        }
        break;
      }
    }

    // Also try to find duration in raw HTML
    const durationMatch = html.match(/"duration"\s*:\s*(\d+\.?\d*)/);
    if (durationMatch && durationMatch[1]) {
      const durationSeconds = parseFloat(durationMatch[1]);
      const hours = Math.floor(durationSeconds / 3600);
      const minutes = Math.floor((durationSeconds % 3600) / 60);
      const seconds = Math.floor(durationSeconds % 60);
      metadata.duration = `${String(hours).padStart(2, "0")}:${String(
        minutes
      ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      if (process.env.NODE_ENV !== "production") {
        console.log("Found duration in raw HTML:", metadata.duration);
      }
    }

    // Method 1: Try to find data-tralbum attribute (most reliable)
    const tralbumElement = $("[data-tralbum]");
    if (tralbumElement.length > 0) {
      try {
        const tralbumJson = tralbumElement.attr("data-tralbum");
        const decodeHtmlEntities = (value) =>
          value
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
        if (tralbumJson) {
          try {
            const parsedTralbum = JSON.parse(tralbumJson);
            applyTralbumData(parsedTralbum);
          } catch (parseError) {
            const decodedTralbumJson = decodeHtmlEntities(tralbumJson);
            const parsedTralbum = JSON.parse(decodedTralbumJson);
            applyTralbumData(parsedTralbum);
          }
        }
      } catch (e) {
        console.error("Error parsing data-tralbum:", e.message);
      }
    }

    // Method 1b: Fallback to TralbumData in scripts when data-tralbum is missing
    if (!tralbumData) {
      const tralbumJson = extractJsonObject(html, "TralbumData");
      if (tralbumJson) {
        try {
          const parsedTralbum = JSON.parse(tralbumJson);
          applyTralbumData(parsedTralbum);
        } catch (e) {
          console.error("Error parsing TralbumData script:", e.message);
        }
      }
    }

    // Method 2: Try to extract JSON-LD structured data
    let jsonLdData = null;
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const data = JSON.parse($(elem).html() || "{}");
        if (
          data["@type"] === "MusicRecording" ||
          data["@type"] === "MusicAlbum" ||
          data["@type"] === "MusicGroup"
        ) {
          jsonLdData = data;
          return false; // Break the loop
        }
      } catch (e) {
        // Continue to next script
      }
    });

    // Extract from JSON-LD if available
    if (jsonLdData) {
      if (jsonLdData["@type"] === "MusicRecording") {
        metadata.title = jsonLdData.name || "";
        metadata.artist =
          jsonLdData.byArtist?.name || jsonLdData.artist?.name || "";
        metadata.album =
          jsonLdData.inAlbum?.name || jsonLdData.album?.name || "";
        metadata.coverArt = jsonLdData.image || "";
      } else if (jsonLdData["@type"] === "MusicAlbum") {
        metadata.album = jsonLdData.name || "";
        metadata.artist =
          jsonLdData.byArtist?.name || jsonLdData.artist?.name || "";
        metadata.coverArt = jsonLdData.image || "";
      }
    }

    // Fallback: Extract from meta tags and page structure
    if (!metadata.title) {
      const ogTitle =
        $('meta[property="og:title"]').attr("content") ||
        $("title").text() ||
        "";
      metadata.title = ogTitle;
    }

    // For track pages, parse title FIRST to extract track artist from "Artist - Track Name" format
    // This must happen before artist extraction so we can identify compilation tracks
    const trackMatch = url.match(/track\/([^/?#]+)/);
    let trackArtistFromTitle = null;
    if (trackMatch && metadata.title) {
      // Check for "Artist - Track Name" format (common on compilation tracks)
      const titleMatch = metadata.title.match(/^(.+?)\s*-\s*(.+)$/);
      if (titleMatch) {
        trackArtistFromTitle = titleMatch[1].trim();
        metadata.title = titleMatch[2].trim();
      }
    }

    if (!metadata.artist) {
      metadata.artist =
        $('meta[property="og:site_name"]').attr("content") ||
        $(".band-name").text().trim() ||
        $('a[href*="/album/"]').text().trim() ||
        "";
    }

    // Clean up artist name: remove patterns like "from [album] by [artist]" -> "[artist]"
    if (metadata.artist) {
      metadata.artist = metadata.artist
        .replace(/^from\s+.+?\s+by\s+/i, "")
        .trim();
    }

    // Store album artist separately (this is the label/compilation artist)
    // For track pages, the album artist is the band-name (label), NOT tralbumData.artist
    // (tralbumData.artist might be the track artist for compilation tracks)
    let albumArtist =
      $(".band-name").text().trim() ||
      $('meta[property="og:site_name"]').attr("content") ||
      "";

    // For track pages, check if the page indicates "Various Artists"
    // Look for text pattern like "from [album] by Various Artists" or "by Various Artists"
    if (isTrack) {
      // Multiple patterns to catch different formats
      const variousArtistsPatterns = [
        /\bby\s+various\s+artists?\b/i,
        /various\s+artists?/i, // More flexible - just "various artists" anywhere
        /from\s+.+?\s+by\s+various\s+artists?/i, // "from [album] by Various Artists"
      ];

      let foundVariousArtists = false;

      // First, check the raw HTML directly (most reliable)
      for (const pattern of variousArtistsPatterns) {
        if (pattern.test(html)) {
          foundVariousArtists = true;
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `Found 'Various Artists' pattern in page HTML: ${pattern}`
            );
          }
          break;
        }
      }

      // Also check in specific page elements
      if (!foundVariousArtists) {
        // Check in track title/subtitle area - look for "from [album] by Various Artists"
        const trackTitleArea = $(
          ".trackTitle, .trackInfo, h2, h1, h3, .track-view, .track-header, .trackTitleSection, .trackTitleView, .fromAlbum, .trackTitleView h2, .trackTitleView h3"
        ).text();
        for (const pattern of variousArtistsPatterns) {
          if (pattern.test(trackTitleArea)) {
            foundVariousArtists = true;
            break;
          }
        }
      }

      // Check in the main content area
      if (!foundVariousArtists) {
        const mainContent = $("main, .main, .content, .track, body").text();
        for (const pattern of variousArtistsPatterns) {
          if (pattern.test(mainContent)) {
            foundVariousArtists = true;
            break;
          }
        }
      }

      // Check in meta tags
      if (!foundVariousArtists) {
        const ogDescription =
          $('meta[property="og:description"]').attr("content") || "";
        for (const pattern of variousArtistsPatterns) {
          if (pattern.test(ogDescription)) {
            foundVariousArtists = true;
            break;
          }
        }
      }

      if (foundVariousArtists) {
        albumArtist = "Various Artists";
        if (process.env.NODE_ENV !== "production") {
          console.log("Detected 'Various Artists' compilation album");
        }
      } else if (process.env.NODE_ENV !== "production") {
        // Debug: log what we found instead
        console.log(
          `Album artist detected as: "${albumArtist}" (not Various Artists)`
        );
        // Also log a sample of the page text to help debug
        const sampleText = $("h2, h3, .trackTitleView")
          .first()
          .text()
          .substring(0, 200);
        console.log(`Sample page text: "${sampleText}"`);
      }
    }

    // For track pages, check if track artist differs from album artist
    // The track artist comes from tralbumData.artist or metadata.artist
    // The album artist is the band-name (label/compilation artist)
    if (isTrack && metadata.artist && !metadata.artistImage) {
      const normalizeName = (name) =>
        name.toLowerCase().trim().replace(/\s+/g, " ");
      const trackArtistNormalized = normalizeName(metadata.artist);
      const albumArtistNormalized = normalizeName(albumArtist);

      // If track artist differs from album artist, search for track artist's image
      if (
        trackArtistNormalized &&
        albumArtistNormalized &&
        trackArtistNormalized !== albumArtistNormalized
      ) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `Track artist "${metadata.artist}" differs from album artist "${albumArtist}" - searching for track artist image`
          );
        }

        const trackArtistImage = await fetchArtistImageFromBandcamp(
          metadata.artist
        );
        if (trackArtistImage?.imageUrl) {
          metadata.artistImage = trackArtistImage.imageUrl;
          metadata.artistImageSourceUrl = trackArtistImage.sourceUrl || null;
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `Found track artist image: ${trackArtistImage.imageUrl}`
            );
          }
        } else {
          if (process.env.NODE_ENV !== "production") {
            console.log(
              `Could not find track artist image for "${metadata.artist}"`
            );
          }
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.log(
          `Track artist "${metadata.artist}" matches album artist "${albumArtist}" - using album artist image`
        );
      }
    }

    // Also check if we extracted track artist from title format
    if (isTrack && trackArtistFromTitle && !metadata.artistImage) {
      const normalizeName = (name) =>
        name.toLowerCase().trim().replace(/\s+/g, " ");
      const trackArtistNormalized = normalizeName(trackArtistFromTitle);
      const albumArtistNormalized = normalizeName(albumArtist);

      // If track artist differs from album artist, use track artist and search for their image
      if (
        trackArtistNormalized &&
        albumArtistNormalized &&
        trackArtistNormalized !== albumArtistNormalized
      ) {
        metadata.artist = trackArtistFromTitle; // Use track artist instead of album artist

        if (process.env.NODE_ENV !== "production") {
          console.log(
            `Track artist from title "${trackArtistFromTitle}" differs from album artist "${albumArtist}" - searching for track artist image`
          );
        }

        const trackArtistImage = await fetchArtistImageFromBandcamp(
          trackArtistFromTitle
        );
        if (trackArtistImage?.imageUrl) {
          metadata.artistImage = trackArtistImage.imageUrl;
          metadata.artistImageSourceUrl = trackArtistImage.sourceUrl || null;
        }
      }
    }

    if (!metadata.coverArt) {
      metadata.coverArt =
        $('meta[property="og:image"]').attr("content") ||
        $("#tralbum-art").attr("src") ||
        $(".popupImage").attr("src") ||
        $('img[itemprop="image"]').attr("src") ||
        "";
    }

    // Extract artist image/profile picture
    if (!metadata.artistImage) {
      // Try various selectors for artist profile image
      const artistImageSelectors = [
        ".band-photo img",
        ".band-photo",
        ".band-photo-container img",
        ".band-photo-container",
        ".band-photo-wrapper img",
        "a.band-photo img",
        ".band-photo a img",
        ".band-photo-link img",
      ];

      for (const selector of artistImageSelectors) {
        const img = $(selector).first();
        if (img.length) {
          const src =
            img.attr("src") ||
            img.attr("data-src") ||
            img.attr("data-original");
          if (src) {
            // Make sure it's a full URL
            try {
              metadata.artistImage = src.startsWith("http")
                ? src
                : new URL(src, url).href;
              break;
            } catch (e) {
              // Invalid URL, continue to next selector
            }
          }
        }
      }

      // Also try to extract from JSON-LD structured data
      if (!metadata.artistImage && jsonLdData) {
        if (jsonLdData["@type"] === "MusicGroup" && jsonLdData.image) {
          metadata.artistImage = jsonLdData.image;
        } else if (jsonLdData.byArtist?.image) {
          metadata.artistImage = jsonLdData.byArtist.image;
        }
      }

      // Try to find artist image in tralbumData
      if (!metadata.artistImage && tralbumData) {
        if (tralbumData.artist_image) {
          metadata.artistImage = tralbumData.artist_image;
        } else if (tralbumData.current?.artist_image) {
          metadata.artistImage = tralbumData.current.artist_image;
        }
      }
    }

    // Clean up artist image URL - ensure it's a full URL
    if (metadata.artistImage && !metadata.artistImage.startsWith("http")) {
      try {
        metadata.artistImage = new URL(metadata.artistImage, url).href;
      } catch (e) {
        metadata.artistImage = "";
      }
    }

    // Remove size parameters from artist image to get higher quality
    if (metadata.artistImage) {
      metadata.artistImage = metadata.artistImage.replace(
        /_\d+\.(jpg|png)$/,
        "_0.$1"
      );
      if (!metadata.artistImageSourceUrl) {
        metadata.artistImageSourceUrl = url;
      }
    }

    // Extract album name if it's a track page
    if (!metadata.album) {
      // First try to get from tralbumData (most reliable)
      if (
        tralbumData &&
        tralbumData.current &&
        tralbumData.current.album_title
      ) {
        metadata.album = tralbumData.current.album_title;
      } else {
        // Try to find album link in the page
        const albumLink = $('a[href*="/album/"]');
        if (albumLink.length) {
          metadata.album = albumLink.text().trim();
        } else {
          // Try to get from URL structure
          const albumMatch = url.match(/album\/([^/?#]+)/);
          if (albumMatch) {
            metadata.album = decodeURIComponent(
              albumMatch[1].replace(/-/g, " ")
            );
          }
        }
      }
    }

    // Additional cleanup for track title (if not already processed above)
    if (trackMatch && metadata.title && !trackArtistFromTitle) {
      // Remove artist prefix if present (format: "Track Name • Artist Name")
      metadata.title = metadata.title.replace(/^\s*[^•]+•\s*/, "").trim();
    }

    // Clean up cover art URL - ensure it's a full URL
    if (metadata.coverArt && !metadata.coverArt.startsWith("http")) {
      metadata.coverArt = new URL(metadata.coverArt, url).href;
    }

    // Remove size parameters from cover art to get higher quality
    if (metadata.coverArt) {
      metadata.coverArt = metadata.coverArt.replace(
        /_\d+\.(jpg|png)$/,
        "_0.$1"
      );
    }

    // Try to extract audio stream URL from Bandcamp page
    // Bandcamp embeds audio URLs in various places:
    // 1. In the popupImage data attribute
    // 2. In JavaScript variables (TralbumData)
    // 3. In the audio element's src

    // Method 3: Try to find audio URL in embedded script data (fallback)
    if (!metadata.audioUrl) {
      const scriptTags = $("script").toArray();
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || "";

        // Look for direct mp3/audio URLs in the page
        const audioUrlMatch =
          scriptContent.match(
            /["'](https?:\/\/t4\.bcbits\.com\/stream\/[^"']+)["']/i
          ) ||
          scriptContent.match(
            /["'](https?:\/\/[^"']*bcbits\.com[^"']*\.mp3[^"']*)["']/i
          ) ||
          scriptContent.match(/["'](https?:\/\/[^"']+\.mp3[^"']*)["']/i);
        if (audioUrlMatch) {
          metadata.audioUrl = audioUrlMatch[1];
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "Extracted audio URL from script content:",
              metadata.audioUrl
            );
          }
          break;
        }
      }
    }

    // Method 4: Try to find audio element
    if (!metadata.audioUrl) {
      const audioElement = $("audio source, audio").first();
      if (audioElement.length) {
        const audioSrc = audioElement.attr("src");
        if (audioSrc) {
          metadata.audioUrl = audioSrc.startsWith("http")
            ? audioSrc
            : new URL(audioSrc, url).href;
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "Extracted audio URL from audio element:",
              metadata.audioUrl
            );
          }
        }
      }
    }

    // Ensure audio URL is absolute
    if (metadata.audioUrl && !metadata.audioUrl.startsWith("http")) {
      // Try to construct absolute URL from the page URL
      try {
        const pageUrlObj = new URL(url);
        metadata.audioUrl = new URL(metadata.audioUrl, pageUrlObj.origin).href;
      } catch (e) {
        metadata.audioUrl = new URL(
          metadata.audioUrl,
          "https://bandcamp.com"
        ).href;
      }
    }

    // Don't use page URL as fallback - it won't work for playback
    // Only return audioUrl if we found a real audio stream URL (should contain bcbits.com or be an mp3/ogg/flac file)
    const isValidAudioUrl =
      metadata.audioUrl &&
      (metadata.audioUrl.includes("bcbits.com") ||
        metadata.audioUrl.includes(".mp3") ||
        metadata.audioUrl.includes(".ogg") ||
        metadata.audioUrl.includes(".flac"));

    if (!isValidAudioUrl) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Could not extract valid audio URL from:", url);
        console.warn("audioUrl was:", metadata.audioUrl);
      }
      metadata.audioUrl = ""; // Clear it - page URLs won't work
    }

    // If it's an album and we have tracks, return album structure
    if (isAlbum && allTracks.length > 0) {
      const albumResponse = {
        type: "album",
        album:
          metadata.album ||
          (tralbumData && tralbumData.current?.album_title) ||
          "",
        artist: metadata.artist || (tralbumData && tralbumData.artist) || "",
        artistImage: metadata.artistImage || "",
        artistImageSourceUrl: metadata.artistImageSourceUrl || null,
        coverArt: metadata.coverArt || "",
        tracks: allTracks,
        pageUrl: url,
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("Extracted Bandcamp album:", {
          album: albumResponse.album,
          artist: albumResponse.artist,
          trackCount: allTracks.length,
        });
      }

      return res.json(albumResponse);
    }

    // For single tracks, return the existing structure
    // Include album artist separately (for compilation albums, this is "Various Artists")
    const trackResponse = {
      type: "track",
      ...metadata,
      albumArtist: albumArtist || metadata.artist, // Album artist (may be "Various Artists" for compilations)
      pageUrl: url,
    };

    // Log extracted metadata for debugging (development only)
    if (process.env.NODE_ENV !== "production") {
      console.log("Extracted Bandcamp metadata:", {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
        albumArtist: albumArtist,
        audioUrl: metadata.audioUrl || "(none found)",
        duration: metadata.duration || "(none found)",
        pageUrl: url,
      });
    }

    res.json(trackResponse);
  } catch (error) {
    console.error("Error extracting Bandcamp metadata:", error);
    res.status(500).json({
      error: error.message || "Failed to extract metadata from Bandcamp URL",
    });
  }
});

// Bandcamp search endpoint (albums and tracks) - HTML scraping
app.get("/api/bandcamp-search", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    // Basic rate/abuse protection: limit length
    if (q.length > 200) {
      return res.status(400).json({ error: "Query too long" });
    }

    // Use Bandcamp search page - this is HTML, not an official API
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(q)}`;

    if (process.env.NODE_ENV !== "production") {
      console.log("Bandcamp search URL:", searchUrl);
    }

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return res.status(500).json({
        error: `Failed to search Bandcamp: ${response.status} ${response.statusText}`,
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];

    // Bandcamp search results are typically under .result-items or .searchresult
    // This may change over time, so be defensive.
    $(".result-items .searchresult, .result-items .result, .searchresult").each(
      (i, el) => {
        const $el = $(el);

        // Try to determine type (album/track/etc.)
        const typeText =
          $el.find(".itemtype, .type, .result-info .item-type").text() || "";
        let itemType = "unknown";
        if (/album/i.test(typeText)) itemType = "album";
        else if (/track|song/i.test(typeText)) itemType = "track";
        else if (/artist|band/i.test(typeText)) itemType = "artist";

        // Title (extract and clean)
        let title =
          $el
            .find(".heading, .result-info .heading, .track-title")
            .text()
            .trim() || "";

        // Clean up title first
        if (title) {
          // Normalize whitespace
          title = title.replace(/\s+/g, " ").trim();

          // If title contains a bullet/dot separator, take only the first part
          // Various bullet characters: · • ‧ ●
          title = title.split(/[·•‧●]/)[0].trim();
        }

        // Artist (may include leading 'by ' and album name; we'll clean it)
        let artist =
          $el
            .find(
              ".subhead, .result-info .subhead, .artist, .subtext, .band-name"
            )
            .text()
            .trim() || "";

        if (artist) {
          // Normalize whitespace (Bandcamp often has extra whitespace/newlines)
          artist = artist.replace(/\s+/g, " ").trim();

          // Drop everything after the first bullet/dot separator
          // Various bullet characters: · • ‧ ●
          artist = artist.split(/[·•‧●]/)[0].trim();

          // Drop leading "by "
          artist = artist.replace(/^by\s+/i, "").trim();

          // Remove "from [album] by [artist]" pattern (album may include "by")
          artist = artist.replace(/^from\s+.+\s+by\s+/i, "").trim();

          // For albums, if artist still contains the album name at the end, remove it
          if (
            itemType === "album" &&
            title &&
            artist.toLowerCase().endsWith(title.toLowerCase())
          ) {
            artist = artist.slice(0, -title.length).trim();
          }
        }

        if (title && artist) {
          const normalizedTitle = title.replace(/\s+/g, " ").trim();
          const normalizedArtist = artist.replace(/\s+/g, " ").trim();
          const bySuffix = ` by ${normalizedArtist}`.toLowerCase();
          if (normalizedTitle.toLowerCase().endsWith(bySuffix)) {
            title = normalizedTitle.slice(0, -bySuffix.length).trim();
          } else {
            title = normalizedTitle;
          }
        }

        // URL
        let url = $el.find("a.item-link, a.searchresult, a").attr("href") || "";
        if (url && url.startsWith("/")) {
          url = `https://bandcamp.com${url}`;
        }

        // If type is missing, infer from URL path
        if (itemType === "unknown" && url) {
          if (url.includes("/track/")) itemType = "track";
          else if (url.includes("/album/")) itemType = "album";
        }

        // Cover image - try multiple selectors to find the album/track cover
        let coverArt = "";

        // Try specific selectors for album/track covers first
        const coverSelectors = [
          ".art img", // Common album art container
          ".popupImage", // Popup image (often the cover)
          "img.popupImage", // Popup image as img tag
          ".item-art img", // Item art container
          ".result-art img", // Result art container
          "img[itemprop='image']", // Structured data image
          "img", // Fallback to any image
        ];

        for (const selector of coverSelectors) {
          const img = $el.find(selector).first();
          if (img.length) {
            coverArt =
              img.attr("src") ||
              img.attr("data-src") ||
              img.attr("data-original") ||
              "";
            if (coverArt) {
              // Skip very small images (likely icons) - covers are usually at least 100px
              const width = parseInt(img.attr("width") || "0");
              const height = parseInt(img.attr("height") || "0");
              if (width > 50 && height > 50) {
                break;
              }
              // If no size attributes, still use it (might be responsive)
              if (width === 0 && height === 0) {
                break;
              }
              // If too small, continue searching
              coverArt = "";
            }
          }
        }

        // Make sure it's a full URL
        if (coverArt) {
          if (coverArt.startsWith("//")) {
            coverArt = `https:${coverArt}`;
          } else if (coverArt.startsWith("/")) {
            coverArt = `https://bandcamp.com${coverArt}`;
          }
        }

        // Skip results we can't use: must have title, URL, and be album or track
        if (!title || !url || (itemType !== "album" && itemType !== "track")) {
          return;
        }

        results.push({
          title,
          artist,
          type: itemType,
          url,
          coverArt,
        });
      }
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `Bandcamp search found ${results.length} result(s) for query: "${q}"`
      );
    }

    return res.json({ results });
  } catch (error) {
    console.error("Error in /api/bandcamp-search:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to search Bandcamp",
    });
  }
});

// Spotify search endpoint (tracks only for now)
app.get("/api/spotify-search", async (req, res) => {
  try {
    const { q, type = "track", limit = "25" } = req.query;

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    const accessToken = await getSpotifyAccessToken();

    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.append("q", String(q));
    searchUrl.searchParams.append("type", String(type));
    searchUrl.searchParams.append("limit", String(limit));

    const response = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Spotify API error (search): ${response.status} ${response.statusText} ${text}`
      );
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error searching Spotify:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to search Spotify",
    });
  }
});

// Spotify track lookup endpoint
app.get("/api/spotify-track/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Track ID is required" });
    }

    const accessToken = await getSpotifyAccessToken();

    const response = await fetch(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Spotify API error (track): ${response.status} ${response.statusText} ${text}`
      );
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching Spotify track:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch track from Spotify",
    });
  }
});

// Spotify artist lookup endpoint (for validating artist images)
app.get("/api/spotify-artist/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Artist ID is required" });
    }

    const accessToken = await getSpotifyAccessToken();

    const response = await fetch(
      `https://api.spotify.com/v1/artists/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Spotify API error (artist): ${response.status} ${response.statusText} ${text}`
      );
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching Spotify artist:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Failed to fetch artist from Spotify",
    });
  }
});

// Proxy endpoint for Bandcamp audio streams (to avoid CORS)
app.get("/api/bandcamp-audio-proxy", async (req, res) => {
  try {
    const { url, pageUrl } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("Proxying audio URL:", url);
      if (pageUrl) {
        console.log("Page URL provided for refresh:", pageUrl);
      } else {
        console.log(
          "No page URL provided - refresh will not be possible if URL expires"
        );
      }
    }

    // Validate it's a Bandcamp-related audio URL (bcbits.com is Bandcamp's CDN)
    if (!url.includes("bandcamp.com") && !url.includes("bcbits.com")) {
      return res
        .status(400)
        .json({ error: "Invalid audio URL - must be a Bandcamp URL" });
    }

    // Fetch the audio file
    let response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Referer: "https://bandcamp.com/",
        Accept: "audio/*,*/*",
      },
    });

    // If the URL expired (410 Gone), try to refresh it if we have a page URL
    if (response.status === 410) {
      if (pageUrl) {
        if (process.env.NODE_ENV !== "production") {
          console.log(
            "Audio URL expired (410), attempting to refresh from page URL:",
            pageUrl
          );
        }

        try {
          // Re-fetch the Bandcamp page to get a fresh audio URL
          const pageResponse = await fetch(pageUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            },
          });

          if (!pageResponse.ok) {
            throw new Error(
              `Failed to fetch Bandcamp page: ${pageResponse.statusText}`
            );
          }

          const html = await pageResponse.text();
          const $ = cheerio.load(html);

          // Try to extract a fresh audio URL from the page
          let freshAudioUrl = null;

          // Method 1: Try data-tralbum
          const tralbumElement = $("[data-tralbum]");
          if (tralbumElement.length > 0) {
            try {
              const tralbumJson = tralbumElement.attr("data-tralbum");
              if (tralbumJson) {
                const tralbumData = JSON.parse(tralbumJson);
                if (
                  tralbumData.trackinfo &&
                  Array.isArray(tralbumData.trackinfo) &&
                  tralbumData.trackinfo.length > 0
                ) {
                  const track = tralbumData.trackinfo[0];
                  if (track.file) {
                    freshAudioUrl =
                      track.file["mp3-128"] ||
                      track.file["mp3-v0"] ||
                      Object.values(track.file)[0] ||
                      null;
                  }
                }
              }
            } catch (e) {
              // Continue to next method
            }
          }

          // Method 2: Search raw HTML for bcbits.com URLs
          if (!freshAudioUrl) {
            const patterns = [
              /"mp3-128"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
              /"mp3-v0"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
              /(https?:\/\/t\d+\.bcbits\.com\/stream\/[^"'\s<>]+)/i,
            ];

            for (const pattern of patterns) {
              const match = html.match(pattern);
              if (match && match[1]) {
                freshAudioUrl = match[1].replace(/\\\//g, "/");
                break;
              }
            }
          }

          if (freshAudioUrl) {
            if (process.env.NODE_ENV !== "production") {
              console.log("Found fresh audio URL, retrying:", freshAudioUrl);
            }
            // Retry with the fresh URL
            response = await fetch(freshAudioUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Referer: "https://bandcamp.com/",
                Accept: "audio/*,*/*",
              },
            });
          } else {
            if (process.env.NODE_ENV !== "production") {
              console.warn("Could not extract fresh audio URL from page");
            }
            throw new Error(
              "Could not extract fresh audio URL from Bandcamp page"
            );
          }
        } catch (refreshError) {
          console.error("Error refreshing audio URL:", refreshError);
          // Return a helpful error message
          return res.status(410).json({
            error:
              refreshError.message ||
              "Audio URL expired and could not be refreshed. Please re-add this song from Bandcamp.",
            expired: true,
            hasPageUrl: true,
          });
        }
      } else {
        // No page URL available - can't refresh old songs
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "Audio URL expired (410) but no page URL provided for refresh"
          );
        }
        return res.status(410).json({
          error:
            "Audio URL expired. This song was added before automatic refresh was available. Please re-add it from Bandcamp.",
          expired: true,
          hasPageUrl: false,
        });
      }
    }

    if (!response.ok) {
      console.error(
        "Failed to fetch audio:",
        response.status,
        response.statusText
      );

      // If it's a 410 or 404, try to refresh if we have a page URL
      if ((response.status === 410 || response.status === 404) && pageUrl) {
        // This will be handled by the refresh logic above, but if we get here
        // it means the refresh also failed or wasn't attempted
        return res.status(410).json({
          error:
            "Audio URL expired or not found. Please re-add this song from Bandcamp.",
          expired: true,
          hasPageUrl: true,
        });
      }

      throw new Error(
        `Failed to fetch audio: ${response.status} ${response.statusText}`
      );
    }

    // Set appropriate headers for streaming
    const contentType = response.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = response.headers.get("Content-Length");

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (process.env.NODE_ENV !== "production") {
      console.log(
        "Streaming audio, Content-Type:",
        contentType,
        "Content-Length:",
        contentLength
      );
    }

    // Stream the audio data
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error proxying audio:", error);
    res.status(500).json({ error: error.message || "Failed to proxy audio" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
