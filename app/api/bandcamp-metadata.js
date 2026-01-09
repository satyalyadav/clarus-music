// Bandcamp metadata extraction endpoint
import * as cheerio from "cheerio";

// Helper function to fetch artist image from Bandcamp artist profile
async function fetchArtistImageFromBandcamp(artistName) {
  try {
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(artistName)}`;

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

    let artistProfileUrl = null;

    $(".result-items .searchresult, .result-items .result, .searchresult").each(
      (i, el) => {
        const $el = $(el);
        const typeText =
          $el.find(".itemtype, .type, .result-info .item-type").text() || "";

        if (/artist|band/i.test(typeText)) {
          const resultTitle = $el
            .find(".heading, .result-info .heading")
            .text()
            .trim();

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
              return false;
            }
          }
        }
      }
    );

    if (!artistProfileUrl) {
      return null;
    }

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

            artistImage = artistImage.replace(/_\d+\.(jpg|png)$/, "_0.$1");

            return { imageUrl: artistImage, sourceUrl: artistProfileUrl };
          } catch (e) {
            // Invalid URL, continue
          }
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    let metadata = {
      title: "",
      album: "",
      artist: "",
      artistImage: "",
      coverArt: "",
      audioUrl: "",
      duration: "",
    };

    let allTracks = [];
    let tralbumData = null;

    const applyTralbumData = (data) => {
      if (!data) return;
      tralbumData = data;

      if (
        tralbumData.trackinfo &&
        Array.isArray(tralbumData.trackinfo) &&
        tralbumData.trackinfo.length > 0
      ) {
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

            let trackTitle = track.title || "";
            let trackArtist = null;

            const lastSeparatorIndex = trackTitle.lastIndexOf(" - ");
            if (lastSeparatorIndex > 0) {
              trackArtist = trackTitle
                .substring(0, lastSeparatorIndex)
                .trim();
              trackTitle = trackTitle
                .substring(lastSeparatorIndex + 3)
                .trim();
            } else {
              const titleMatch = trackTitle.match(/^(.+?)\s+-\s+(.+)$/);
              if (titleMatch) {
                trackArtist = titleMatch[1].trim();
                trackTitle = titleMatch[2].trim();
              }
            }

            return {
              title: trackTitle,
              artist: trackArtist,
              duration: duration,
              audioUrl: audioUrl,
              trackNumber: index + 1,
            };
          });
        } else {
          const track = tralbumData.trackinfo[0];

          if (track.file) {
            metadata.audioUrl =
              track.file["mp3-128"] ||
              track.file["mp3-v0"] ||
              Object.values(track.file)[0] ||
              "";
          }

          if (track.duration) {
            const durationSeconds = track.duration;
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const seconds = Math.floor(durationSeconds % 60);
            metadata.duration = `${String(hours).padStart(2, "0")}:${String(
              minutes
            ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
          }

          if (track.title) {
            metadata.title = track.title;
          }
        }
      }

      if (tralbumData.artist) {
        metadata.artist = tralbumData.artist;
      }

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

    // Method 0: Search raw HTML for bcbits.com URLs
    const patterns = [
      /"mp3-128"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
      /"mp3-v0"\s*:\s*"(https?:\/\/[^"]+bcbits\.com[^"]+)"/i,
      /mp3-128['"]\s*:\s*['"]?(https?:\/\/[^'">\s]+bcbits\.com[^'">\s]+)/i,
      /(https?:\/\/t\d+\.bcbits\.com\/stream\/[^"'\s<>]+)/i,
      /"mp3-128"\s*:\s*"(https?:\\\/\\\/[^"]+bcbits\.com[^"]+)"/i,
      /(https?:(?:\/\/|\\\/\\\/)[\w.-]*bcbits\.com[^"'\s<>\\]+)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        metadata.audioUrl = match[1].replace(/\\\//g, "/");
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
    }

    // Method 1: Try to find data-tralbum attribute
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

    // Method 1b: Fallback to TralbumData in scripts
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
          return false;
        }
      } catch (e) {
        // Continue
      }
    });

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

    if (!metadata.title) {
      const ogTitle =
        $('meta[property="og:title"]').attr("content") ||
        $("title").text() ||
        "";
      metadata.title = ogTitle;
    }

    const trackMatch = normalizedUrl.match(/track\/([^/?#]+)/);
    let trackArtistFromTitle = null;
    if (trackMatch && metadata.title) {
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

    if (metadata.artist) {
      metadata.artist = metadata.artist
        .replace(/^from\s+.+?\s+by\s+/i, "")
        .trim();
    }

    let albumArtist =
      $(".band-name").text().trim() ||
      $('meta[property="og:site_name"]').attr("content") ||
      "";

    if (isTrack) {
      const variousArtistsPatterns = [
        /\bby\s+various\s+artists?\b/i,
        /various\s+artists?/i,
        /from\s+.+?\s+by\s+various\s+artists?/i,
      ];

      let foundVariousArtists = false;

      for (const pattern of variousArtistsPatterns) {
        if (pattern.test(html)) {
          foundVariousArtists = true;
          break;
        }
      }

      if (!foundVariousArtists) {
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

      if (!foundVariousArtists) {
        const mainContent = $("main, .main, .content, .track, body").text();
        for (const pattern of variousArtistsPatterns) {
          if (pattern.test(mainContent)) {
            foundVariousArtists = true;
            break;
          }
        }
      }

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
      }
    }

    if (isTrack && metadata.artist && !metadata.artistImage) {
      const normalizeName = (name) =>
        name.toLowerCase().trim().replace(/\s+/g, " ");
      const trackArtistNormalized = normalizeName(metadata.artist);
      const albumArtistNormalized = normalizeName(albumArtist);

      if (
        trackArtistNormalized &&
        albumArtistNormalized &&
        trackArtistNormalized !== albumArtistNormalized
      ) {
        const trackArtistImage = await fetchArtistImageFromBandcamp(
          metadata.artist
        );
        if (trackArtistImage?.imageUrl) {
          metadata.artistImage = trackArtistImage.imageUrl;
          metadata.artistImageSourceUrl = trackArtistImage.sourceUrl || null;
        }
      }
    }

    if (isTrack && trackArtistFromTitle && !metadata.artistImage) {
      const normalizeName = (name) =>
        name.toLowerCase().trim().replace(/\s+/g, " ");
      const trackArtistNormalized = normalizeName(trackArtistFromTitle);
      const albumArtistNormalized = normalizeName(albumArtist);

      if (
        trackArtistNormalized &&
        albumArtistNormalized &&
        trackArtistNormalized !== albumArtistNormalized
      ) {
        metadata.artist = trackArtistFromTitle;

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

    if (!metadata.artistImage) {
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
            try {
              metadata.artistImage = src.startsWith("http")
                ? src
                : new URL(src, normalizedUrl).href;
              break;
            } catch (e) {
              // Continue
            }
          }
        }
      }

      if (!metadata.artistImage && jsonLdData) {
        if (jsonLdData["@type"] === "MusicGroup" && jsonLdData.image) {
          metadata.artistImage = jsonLdData.image;
        } else if (jsonLdData.byArtist?.image) {
          metadata.artistImage = jsonLdData.byArtist.image;
        }
      }

      if (!metadata.artistImage && tralbumData) {
        if (tralbumData.artist_image) {
          metadata.artistImage = tralbumData.artist_image;
        } else if (tralbumData.current?.artist_image) {
          metadata.artistImage = tralbumData.current.artist_image;
        }
      }
    }

    if (metadata.artistImage && !metadata.artistImage.startsWith("http")) {
      try {
        metadata.artistImage = new URL(metadata.artistImage, normalizedUrl).href;
      } catch (e) {
        metadata.artistImage = "";
      }
    }

    if (metadata.artistImage) {
      metadata.artistImage = metadata.artistImage.replace(
        /_\d+\.(jpg|png)$/,
        "_0.$1"
      );
      if (!metadata.artistImageSourceUrl) {
        metadata.artistImageSourceUrl = normalizedUrl;
      }
    }

    if (!metadata.album) {
      if (
        tralbumData &&
        tralbumData.current &&
        tralbumData.current.album_title
      ) {
        metadata.album = tralbumData.current.album_title;
      } else {
        const albumLink = $('a[href*="/album/"]');
        if (albumLink.length) {
          metadata.album = albumLink.text().trim();
        } else {
          const albumMatch = normalizedUrl.match(/album\/([^/?#]+)/);
          if (albumMatch) {
            metadata.album = decodeURIComponent(
              albumMatch[1].replace(/-/g, " ")
            );
          }
        }
      }
    }

    if (trackMatch && metadata.title && !trackArtistFromTitle) {
      metadata.title = metadata.title.replace(/^\s*[^•]+•\s*/, "").trim();
    }

    if (metadata.coverArt && !metadata.coverArt.startsWith("http")) {
      metadata.coverArt = new URL(metadata.coverArt, normalizedUrl).href;
    }

    if (metadata.coverArt) {
      metadata.coverArt = metadata.coverArt.replace(
        /_\d+\.(jpg|png)$/,
        "_0.$1"
      );
    }

    if (!metadata.audioUrl) {
      const scriptTags = $("script").toArray();
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || "";
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
          break;
        }
      }
    }

    if (!metadata.audioUrl) {
      const audioElement = $("audio source, audio").first();
      if (audioElement.length) {
        const audioSrc = audioElement.attr("src");
        if (audioSrc) {
          metadata.audioUrl = audioSrc.startsWith("http")
            ? audioSrc
            : new URL(audioSrc, normalizedUrl).href;
        }
      }
    }

    if (metadata.audioUrl && !metadata.audioUrl.startsWith("http")) {
      try {
        const pageUrlObj = new URL(normalizedUrl);
        metadata.audioUrl = new URL(metadata.audioUrl, pageUrlObj.origin).href;
      } catch (e) {
        metadata.audioUrl = new URL(
          metadata.audioUrl,
          "https://bandcamp.com"
        ).href;
      }
    }

    const isValidAudioUrl =
      metadata.audioUrl &&
      (metadata.audioUrl.includes("bcbits.com") ||
        metadata.audioUrl.includes(".mp3") ||
        metadata.audioUrl.includes(".ogg") ||
        metadata.audioUrl.includes(".flac"));

    if (!isValidAudioUrl) {
      metadata.audioUrl = "";
    }

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
        pageUrl: normalizedUrl,
      };

      return res.status(200).json(albumResponse);
    }

    const trackResponse = {
      type: "track",
      ...metadata,
      albumArtist: albumArtist || metadata.artist,
      pageUrl: normalizedUrl,
    };

    return res.status(200).json(trackResponse);
  } catch (error) {
    console.error("Error extracting Bandcamp metadata:", error);
    return res.status(500).json({
      error: error.message || "Failed to extract metadata from Bandcamp URL",
    });
  }
}
