import { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore
import { fileURLToPath } from 'url';
// @ts-ignore
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { ApplicationError, errorMiddleware, withErrorBoundary } from './api/middleware/error-handling';
import { analytics } from './api/server/monitoring/vercel-monitoring';

async function verifyComponents() {
  console.log('🚀 Vercel Pre-deployment Verification\n');
  
  // Test 1: Error Handling
  try {
    const mockReq = {
      url: '/test',
      method: 'GET'
    } as VercelRequest;
    
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => console.log('Response:', code, data)
      })
    } as VercelResponse;

    const testError = new ApplicationError(400, 'Test Error', 'TEST_ERROR');
    await errorMiddleware(testError, mockReq, mockRes, () => {});
    console.log('✅ Error handling middleware works');
  } catch (error) {
    console.error('❌ Error handling test failed:', error);
  }

  // Test 2: Analytics
  try {
    await analytics.track('test_event', {
      test: true,
      timestamp: new Date().toISOString()
    });
    console.log('✅ Analytics integration works');
  } catch (error) {
    console.error('❌ Analytics test failed:', error);
  }

  // Test 3: Error Boundary
  try {
    const handler = withErrorBoundary(async (req: VercelRequest, res: VercelResponse) => {
      throw new Error('Test error');
    });
    
    const mockReq = {} as VercelRequest;
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => console.log('Error Boundary Response:', code, data)
      })
    } as VercelResponse;

    await handler(mockReq, mockRes);
    console.log('✅ Error boundary works');
  } catch (error) {
    console.error('❌ Error boundary test failed:', error);
  }

  console.log('\nVerification complete!');
}

verifyComponents().catch(console.error);