// Bandcamp audio proxy endpoint (to avoid CORS)
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
    const { url, pageUrl } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    // Validate it's a Bandcamp-related audio URL
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
            throw new Error(
              "Could not extract fresh audio URL from Bandcamp page"
            );
          }
        } catch (refreshError) {
          console.error("Error refreshing audio URL:", refreshError);
          return res.status(410).json({
            error:
              refreshError.message ||
              "Audio URL expired and could not be refreshed. Please re-add this song from Bandcamp.",
            expired: true,
            hasPageUrl: true,
          });
        }
      } else {
        return res.status(410).json({
          error:
            "Audio URL expired. This song was added before automatic refresh was available. Please re-add it from Bandcamp.",
          expired: true,
          hasPageUrl: false,
        });
      }
    }

    if (!response.ok) {
      if ((response.status === 410 || response.status === 404) && pageUrl) {
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

    // Stream the audio data
    const buffer = await response.arrayBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error proxying audio:", error);
    return res.status(500).json({ error: error.message || "Failed to proxy audio" });
  }
}
