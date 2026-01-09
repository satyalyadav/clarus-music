// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// Vercel catch-all route: api/[...path].js handles /api/*
// The path segments are in req.query.path
export default function handler(req, res) {
  // Reconstruct the full path with /api prefix
  // req.query.path will be ['spotify-search'] for /api/spotify-search
  const pathArray = req.query.path || [];
  const pathSegment = Array.isArray(pathArray) 
    ? `/${pathArray.join('/')}` 
    : `/${pathArray}`;
  
  // Get query string from original URL
  const queryString = req.url.includes('?') 
    ? req.url.substring(req.url.indexOf('?')) 
    : '';
  
  // Reconstruct full URL: /api/spotify-search?q=...
  const fullPath = `/api${pathSegment}${queryString}`;
  
  // Update request URL for Express routing
  req.url = fullPath;
  req.originalUrl = fullPath;
  
  return app(req, res);
}
