// Bandcamp artist image endpoint
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
    const { artist } = req.query;

    if (!artist || typeof artist !== "string") {
      return res.status(400).json({ error: "Artist parameter is required" });
    }

    const artistImage = await fetchArtistImageFromBandcamp(artist.trim());

    if (artistImage?.imageUrl) {
      return res.status(200).json({
        imageUrl: artistImage.imageUrl,
        sourceUrl: artistImage.sourceUrl || null,
      });
    }
    return res.status(200).json({ imageUrl: null, sourceUrl: null });
  } catch (error) {
    console.error("Error in /api/bandcamp-artist-image:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to fetch artist image",
    });
  }
}
