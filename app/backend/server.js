import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Bandcamp metadata extraction endpoint
app.get("/api/bandcamp-metadata", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Validate Bandcamp URL
    if (!url.includes("bandcamp.com")) {
      return res.status(400).json({ error: "Invalid Bandcamp URL" });
    }

    // Fetch the Bandcamp page
    const response = await fetch(url, {
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
    const isAlbum = url.includes("/album/");
    const isTrack = url.includes("/track/");

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
      coverArt: "",
      genre: "",
      audioUrl: "", // The actual audio stream URL
      duration: "", // Duration in HH:MM:SS format
    };

    let allTracks = []; // For album pages
    let tralbumData = null; // Store parsed tralbum data for later use

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
        if (tralbumJson) {
          tralbumData = JSON.parse(tralbumJson);
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

                return {
                  title: track.title || "",
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
        }
      } catch (e) {
        console.error("Error parsing data-tralbum:", e.message);
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

    if (!metadata.artist) {
      metadata.artist =
        $('meta[property="og:site_name"]').attr("content") ||
        $(".band-name").text().trim() ||
        $('a[href*="/album/"]').text().trim() ||
        "";
    }

    if (!metadata.coverArt) {
      metadata.coverArt =
        $('meta[property="og:image"]').attr("content") ||
        $("#tralbum-art").attr("src") ||
        $(".popupImage").attr("src") ||
        $('img[itemprop="image"]').attr("src") ||
        "";
    }

    // Extract album name if it's a track page
    if (!metadata.album) {
      const albumLink = $('a[href*="/album/"]');
      if (albumLink.length) {
        metadata.album = albumLink.text().trim();
      } else {
        // Try to get from URL structure
        const albumMatch = url.match(/album\/([^/?#]+)/);
        if (albumMatch) {
          metadata.album = decodeURIComponent(albumMatch[1].replace(/-/g, " "));
        }
      }
    }

    // Parse track title if it's a track page
    const trackMatch = url.match(/track\/([^/?#]+)/);
    if (trackMatch && metadata.title) {
      // Remove artist prefix if present (format: "Track Name • Artist Name")
      metadata.title = metadata.title.replace(/^\s*[^•]+•\s*/, "").trim();
    }

    // Try to extract genre from tags or page
    const genreTag = $(".tag a").first().text().trim();
    if (genreTag) {
      metadata.genre = genreTag;
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
        coverArt: metadata.coverArt || "",
        genre: metadata.genre || "",
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
    const trackResponse = {
      type: "track",
      ...metadata,
      pageUrl: url,
    };

    // Log extracted metadata for debugging (development only)
    if (process.env.NODE_ENV !== "production") {
      console.log("Extracted Bandcamp metadata:", {
        title: metadata.title,
        artist: metadata.artist,
        album: metadata.album,
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
