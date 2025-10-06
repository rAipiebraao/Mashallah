import { VercelRequest, VercelResponse } from '@vercel/node';
import { analytics as vercelAnalytics } from '@vercel/analytics';

// Initialize analytics
export const analytics = vercelAnalytics;

interface ErrorDetails {
  path?: string;
  method?: string;
  timestamp: string;
  requestId?: string;
  statusCode: number;
  errorCode: string;
  details?: any;
}

// Error handler function
export const errorHandler = async (
  error: Error,
  req: VercelRequest,
  res: VercelResponse,
  next: (error?: any) => void
) => {
  const errorDetails: ErrorDetails = {
    path: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] as string,
    statusCode: 500,
    errorCode: 'INTERNAL_SERVER_ERROR',
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };

  // Log error to Vercel Analytics
  await analytics.track('server_error', {
    errorName: error.name,
    errorMessage: error.message,
    ...errorDetails
  });

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', {
      error: error.message,
      stack: error.stack,
      ...errorDetails
    });
  }

  return next(error);
};