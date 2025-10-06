import { VercelRequest, VercelResponse } from '@vercel/node';
import rateLimit from 'express-rate-limit';
import { rlopsMonitor } from '../../server/monitoring/vercel-monitoring';

// Rate limiting configuration
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  skipFailedRequests: true,
  handler: (_, res) => {
    res.status(429).json({ 
      error: 'Too many requests, please try again later',
      retryAfter: Math.ceil(15 * 60) // 15 minutes in seconds
    });
  }
});

// Performance monitoring middleware
export const performanceMonitoring = async (req: VercelRequest, res: VercelResponse, next: () => void) => {
  const start = process.hrtime();
  
  // Track memory usage at request start
  rlopsMonitor.trackMemoryUsage();
  
  // Track CPU usage
  await rlopsMonitor.trackCpuUsage();

  // Add response tracking
  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds

    // Track response metrics
    rlopsMonitor.trackResponseMetrics({
      path: req.url || '/',
      method: req.method || 'UNKNOWN',
      duration,
      statusCode: res.statusCode,
      contentLength: res.getHeader('content-length')?.toString()
    });
  });

  next();
};