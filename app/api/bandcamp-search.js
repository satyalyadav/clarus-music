// Bandcamp search endpoint
import * as cheerio from "cheerio";

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
    const q = (req.query.q || "").toString().trim();

    if (!q) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }

    if (q.length > 200) {
      return res.status(400).json({ error: "Query too long" });
    }

    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(q)}`;

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

    $(".result-items .searchresult, .result-items .result, .searchresult").each(
      (i, el) => {
        const $el = $(el);

        const typeText =
          $el.find(".itemtype, .type, .result-info .item-type").text() || "";
        let itemType = "unknown";
        if (/album/i.test(typeText)) itemType = "album";
        else if (/track|song/i.test(typeText)) itemType = "track";
        else if (/artist|band/i.test(typeText)) itemType = "artist";

        let title =
          $el
            .find(".heading, .result-info .heading, .track-title")
            .text()
            .trim() || "";

        if (title) {
          title = title.replace(/\s+/g, " ").trim();
          title = title.split(/[·•‧●]/)[0].trim();
        }

        let artist =
          $el
            .find(
              ".subhead, .result-info .subhead, .artist, .subtext, .band-name"
            )
            .text()
            .trim() || "";

        if (artist) {
          artist = artist.replace(/\s+/g, " ").trim();
          artist = artist.split(/[·•‧●]/)[0].trim();
          artist = artist.replace(/^by\s+/i, "").trim();
          artist = artist.replace(/^from\s+.+\s+by\s+/i, "").trim();

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

        let url = $el.find("a.item-link, a.searchresult, a").attr("href") || "";
        if (url && url.startsWith("/")) {
          url = `https://bandcamp.com${url}`;
        }

        if (itemType === "unknown" && url) {
          if (url.includes("/track/")) itemType = "track";
          else if (url.includes("/album/")) itemType = "album";
        }

        let coverArt = "";

        const coverSelectors = [
          ".art img",
          ".popupImage",
          "img.popupImage",
          ".item-art img",
          ".result-art img",
          "img[itemprop='image']",
          "img",
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
              const width = parseInt(img.attr("width") || "0");
              const height = parseInt(img.attr("height") || "0");
              if (width > 50 && height > 50) {
                break;
              }
              if (width === 0 && height === 0) {
                break;
              }
              coverArt = "";
            }
          }
        }

        if (coverArt) {
          if (coverArt.startsWith("//")) {
            coverArt = `https:${coverArt}`;
          } else if (coverArt.startsWith("/")) {
            coverArt = `https://bandcamp.com${coverArt}`;
          }
        }

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

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error in /api/bandcamp-search:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to search Bandcamp",
    });
  }
}
