import { VercelRequest, VercelResponse } from '@vercel/node';
import { analytics, errorHandler } from '../server/monitoring/vercel-monitoring';

export class ApplicationError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApplicationError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorMiddleware = async (
  error: Error | ApplicationError,
  req: VercelRequest,
  res: VercelResponse,
  next: (error: any) => void
) => {
  try {
    // Log the error
    await errorHandler(error, req, res, next);

    // Track error in analytics
    await analytics.track('api_error', {
      errorType: error.name,
      errorMessage: error.message,
      path: req.url,
      method: req.method
    });

    // Determine if this is a known application error
    if (error instanceof ApplicationError) {
      return res.status(error.statusCode).json({
        status: 'error',
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    // For unknown errors, return 500
    console.error('[Unhandled Error]:', error);
    return res.status(500).json({
      status: 'error',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  } catch (handlingError) {
    // Fallback error handling if error middleware itself fails
    console.error('[Error Handler Failed]:', handlingError);
    return res.status(500).json({
      status: 'error',
      code: 'ERROR_HANDLER_FAILED',
      message: 'Failed to process error response'
    });
  }
};

// Global error boundary with request timeout
export const withErrorBoundary = (handler: Function, timeout: number = 30000) => {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      // Add request timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new ApplicationError(
          408,
          'Request timeout exceeded',
          'REQUEST_TIMEOUT'
        )), timeout);
      });

      // Race between handler and timeout
      await Promise.race([
        handler(req, res),
        timeoutPromise
      ]);
    } catch (error) {
      await errorMiddleware(error as Error, req, res, () => {});
    }
  };
};