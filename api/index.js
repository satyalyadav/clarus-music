// Vercel serverless function wrapper for Express app
import app from '../app/backend/server.js';

// For Vercel, we need to export a handler function
// The Express app will handle all routes including /api/*
export default function handler(req, res) {
  // Ensure the path includes /api prefix for Express routes
  // Vercel rewrites /api/* to /api, so we need to restore the path
  const originalUrl = req.url;
  if (!originalUrl.startsWith('/api')) {
    req.url = `/api${originalUrl}`;
  }
  return app(req, res);
}
