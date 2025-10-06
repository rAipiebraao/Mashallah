import { inject } from '@vercel/analytics';
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

// Initialize Vercel Analytics
inject(); // Initialize analytics

export const analytics = {
  track: (event: string, data?: any) => {
    console.log(`[Analytics] ${event}:`, data);
  }
};

// Web vitals reporting
export const reportWebVitals = (metric: any) => {
  analytics.track('web_vitals', metric);
};

// Health check endpoint
export const healthCheck = async () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION
  };
};

// Performance monitoring
export const monitorPerformance = async (req: any, res: any, next: any) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    analytics.track('api_performance', {
      duration,
      path: req.path,
      method: req.method,
      status: res.statusCode
    });
  });
  next();
};

// Error tracking
export const errorHandler = async (err: any, req: any, res: any, next: any) => {
  analytics.track('error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  next(err);
};

// RLOps monitoring
export const rlopsMonitor = {
  // Memory usage monitoring
  trackMemoryUsage: () => {
    const usage = process.memoryUsage();
    analytics.track('memory_usage', usage);
  },

  // CPU usage monitoring
  trackCpuUsage: async () => {
    const startUsage = process.cpuUsage();
    // Wait 100ms to measure CPU usage
    await new Promise(resolve => setTimeout(resolve, 100));
    const endUsage = process.cpuUsage(startUsage);
    analytics.track('cpu_usage', endUsage);
  },

  // Rate limiting monitoring
  trackRateLimit: (req: any) => {
    analytics.track('rate_limit', {
      ip: req.ip,
      path: req.path,
      remaining: req.rateLimit?.remaining
    });
  },

  // Response metrics tracking
  trackResponseMetrics: (metrics: {
    path: string;
    method: string;
    duration: number;
    statusCode: number;
    contentLength?: string;
  }) => {
    analytics.track('api_response', {
      ...metrics,
      timestamp: new Date().toISOString()
    });
  }
};