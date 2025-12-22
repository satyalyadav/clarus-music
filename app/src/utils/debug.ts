/**
 * Debug utility for conditional logging
 * Only logs in development mode
 */
export const DEBUG = import.meta.env.DEV || import.meta.env.MODE === 'development';

export const debugLog = (...args: any[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

export const debugWarn = (...args: any[]) => {
  if (DEBUG) {
    console.warn(...args);
  }
};

