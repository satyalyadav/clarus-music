// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// Vercel catch-all route: api/[...path].js handles /api/*
// The path segments are in req.query.path
export default function handler(req, res) {
  // Debug logging
  console.log('=== Vercel Function Handler ===');
  console.log('req.url:', req.url);
  console.log('req.query:', JSON.stringify(req.query));
  console.log('req.method:', req.method);
  console.log('req.headers:', JSON.stringify(req.headers));
  
  // Reconstruct the full path with /api prefix
  // req.query.path will be ['spotify-search'] for /api/spotify-search
  const pathArray = req.query.path || [];
  const pathSegment = Array.isArray(pathArray) 
    ? `/${pathArray.join('/')}` 
    : `/${pathArray}`;
  
  // Get query string - it might be in req.url or req.query
  let queryString = '';
  if (req.url && req.url.includes('?')) {
    queryString = req.url.substring(req.url.indexOf('?'));
  } else if (Object.keys(req.query).length > 1 || (Object.keys(req.query).length === 1 && !req.query.path)) {
    // Build query string from req.query if path is the only key
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'path') {
        queryParams.append(key, value);
      }
    }
    queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
  }
  
  // Reconstruct full URL: /api/spotify-search?q=...
  const fullPath = `/api${pathSegment}${queryString}`;
  console.log('Reconstructed path:', fullPath);
  
  // Update request URL for Express routing
  req.url = fullPath;
  req.originalUrl = fullPath;
  
  return app(req, res);
}
