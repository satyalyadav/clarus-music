// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// Vercel rewrites /api/* to /api
// The original path is available in various ways - let's check and restore it
export default function handler(req, res) {
  // Log for debugging (remove in production if needed)
  console.log('Request URL:', req.url);
  console.log('Request headers:', JSON.stringify(req.headers));
  
  // Vercel might pass the original path in different ways
  // Try to get it from headers or reconstruct from URL
  let originalUrl = req.url;
  
  // Check if URL already has /api prefix
  if (!originalUrl.startsWith('/api')) {
    // The rewrite sends /api/spotify-search to /api, but the path might be in the URL
    // Check if there's a way to get the original path
    // For now, try adding /api prefix
    originalUrl = `/api${originalUrl}`;
  }
  
  // Update the request URL for Express
  req.url = originalUrl;
  req.originalUrl = originalUrl;
  
  return app(req, res);
}
