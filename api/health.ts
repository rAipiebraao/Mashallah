import { VercelRequest, VercelResponse } from '@vercel/node';
import { healthCheck } from '../server/monitoring/vercel-monitoring';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const health = await healthCheck();
  res.status(200).json(health);
}