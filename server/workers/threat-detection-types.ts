import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { performance } from 'perf_hooks';

export interface ThreatDetectionConfig {
  latencyBudget: number;
  analysisFrequency: number;
  maxConcurrentAnalyses: number;
  adaptiveThrottling: boolean;
  emergencyThreshold: number;
}

export interface ThreatAnalysisRequest {
  id: string;
  timestamp: bigint;
  data: {
    ipAddress: string;
    requestPattern?: {
      requestRate?: number;
      errorRate?: number;
      anomalyScore?: number;
    };
    userData?: {
      failedAttempts?: number;
      suspiciousLogin?: boolean;
    };
    securityContext?: any;
  };
  priority: 'low' | 'medium' | 'high' | 'emergency';
}

export interface ThreatAnalysisResult {
  requestId: string;
  threatScore: number;
  threatType: string[];
  severity: 'low' | 'medium' | 'high' | 'critical' | 'emergency';
  responseTime: number;
  detectionTime: bigint;
  mitigationActions: string[];
  confident: boolean;
  metadata: Record<string, any>;
}

export interface LatencyMeasurement {
  requestId: string;
  startTime: bigint;
  endTime: bigint;
  latency: number;
  budgetMet: boolean;
  budgetOverrun: number;
}

// Export these separately to avoid circular dependencies
export type ThreatAnalysisResultPartial = Omit<ThreatAnalysisResult, 'responseTime' | 'detectionTime'>;

export const DEFAULT_CONFIG: ThreatDetectionConfig = {
  latencyBudget: 100,
  analysisFrequency: 500,
  maxConcurrentAnalyses: 10,
  adaptiveThrottling: true,
  emergencyThreshold: 0.8
};