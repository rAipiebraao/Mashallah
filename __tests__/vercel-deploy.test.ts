import { VercelRequest, VercelResponse } from '@vercel/node';
import { ApplicationError, errorMiddleware } from '../api/middleware/error-handling';

describe('Vercel Pre-deployment Tests', () => {
  test('Error handling middleware works', async () => {
    const mockReq = {
      url: '/test',
      method: 'GET'
    } as VercelRequest;
    
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as VercelResponse;

    const testError = new ApplicationError(400, 'Test Error', 'TEST_ERROR');
    await errorMiddleware(testError, mockReq, mockRes, () => {});
    
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});