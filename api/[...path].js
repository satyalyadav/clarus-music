// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// Vercel catch-all route handler for /api/*
// The path is available in req.query.path
export default function handler(req, res) {
  // Reconstruct the URL with /api prefix for Express routes
  const pathSegment = req.query.path 
    ? `/${Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path}`
    : '';
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  req.url = `/api${pathSegment}${queryString}`;
  
  return app(req, res);
}
