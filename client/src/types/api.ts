export interface AIResponse {
  success: boolean;
  content?: string;
  provider?: string;
  metadata?: {
    executionTime?: number;
    confidence?: number;
    model?: string;
    quantumEnhanced?: boolean;
  };
  providers?: Array<{
    name: string;
    confidence: number;
  }>;
  error?: string;
}