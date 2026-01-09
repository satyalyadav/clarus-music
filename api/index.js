// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// Handler for Vercel serverless function
// When rewrite sends /api/spotify-search to /api, we need to restore the path
export default function handler(req, res) {
  // Log everything for debugging
  console.log('=== API Handler Debug ===');
  console.log('req.url:', req.url);
  console.log('req.originalUrl:', req.originalUrl);
  console.log('req.method:', req.method);
  console.log('req.path:', req.path);
  console.log('All headers:', JSON.stringify(req.headers, null, 2));
  
  // Try multiple ways to get the original path
  let originalPath = req.url;
  
  // Method 1: Check if URL already has /api
  if (originalPath.startsWith('/api')) {
    // Good, use it as is
    req.url = originalPath;
  } else {
    // Method 2: Check Vercel-specific headers
    const vercelPath = req.headers['x-vercel-rewrite-path'] || 
                      req.headers['x-invoke-path'] ||
                      req.headers['x-forwarded-path'];
    
    if (vercelPath && vercelPath.startsWith('/api')) {
      req.url = vercelPath;
    } else {
      // Method 3: Try to reconstruct from req.url
      // If req.url is /spotify-search, make it /api/spotify-search
      req.url = `/api${originalPath.startsWith('/') ? '' : '/'}${originalPath}`;
    }
  }
  
  req.originalUrl = req.url;
  
  console.log('Final req.url:', req.url);
  console.log('=== End Debug ===');
  
  return app(req, res);
}
