import { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimiter, performanceMonitoring } from './middleware/rlops';
import { withErrorBoundary } from './middleware/error-handling';
import { analytics } from '../server/monitoring/vercel-monitoring';

// Create handler function
const handler = async (req: VercelRequest, res: VercelResponse) => {
  // Track request
  analytics.track('api_request', {
    path: req.url || '/',
    method: req.method || 'UNKNOWN',
    timestamp: new Date().toISOString()
  });

  // Your API logic here
  res.status(200).json({ 
    message: 'API is running with full monitoring and RLOps',
    timestamp: new Date().toISOString()
  });
};

// Create middleware chain
const middlewareChain = async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Apply rate limiting
    await new Promise((resolve, reject) => {
      rateLimiter(req as any, res as any, (error: any) => {
        if (error) reject(error);
        else resolve(undefined);
      });
    });

    // Apply performance monitoring
    await performanceMonitoring(req, res, () => {});

    // Execute handler with error boundary
    await withErrorBoundary(handler)(req, res);
  } catch (error) {
    // Handle any errors in the middleware chain
    console.error('Middleware chain error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default middlewareChain;