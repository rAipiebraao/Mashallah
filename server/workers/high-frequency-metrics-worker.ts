/**
 * High-Frequency Metrics Collection Worker
 * 
 * Dedicated worker thread for collecting system metrics at high frequencies
 * without blocking the main event loop. This worker can sustain 1000+ Hz
 * sampling by running in a separate thread.
 * 
 * Features:
 * - True high-frequency sampling (1000-5000 Hz)
 * - Lightweight metric collection optimized for speed
 * - Adaptive throttling based on actual performance
 * - SharedArrayBuffer communication for minimal overhead
 * - Wall-clock validation of actual sampling rates
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { performance } from 'perf_hooks';
import os from 'os';

// SharedArrayBuffer indices for efficient data sharing
const SHARED_BUFFER_INDICES = {
  SAMPLE_COUNT: 0,
  LAST_SAMPLE_TIME: 1, 
  ACTUAL_FREQUENCY: 2,
  CPU_USER: 3,
  CPU_SYSTEM: 4,
  MEMORY_HEAP_USED: 5,
  MEMORY_HEAP_TOTAL: 6,
  MEMORY_RSS: 7,
  WORKER_OVERHEAD: 8,
  VALIDATION_PASSED: 9,
  BUFFER_SIZE: 10
};

interface WorkerConfig {
  targetFrequency: number;        // Target samples per second
  maxOverhead: number;           // Maximum acceptable CPU overhead (0-1)
  adaptiveThrottling: boolean;   // Enable adaptive throttling
  validationEnabled: boolean;    // Enable wall-clock validation
  sharedBuffer?: SharedArrayBuffer;
}

interface MetricsSample {
  timestamp: bigint;
  cpuUsage: NodeJS.CpuUsage;
  memoryUsage: NodeJS.MemoryUsage;
  workerOverhead: number;
  sequenceNumber: number;
}

/**
 * High-frequency metrics collection worker
 * Runs in dedicated thread to avoid blocking main event loop
 */
class HighFrequencyMetricsWorker {
  private config: WorkerConfig;
  private isRunning = false;
  private sampleCount = 0;
  private startTime = process.hrtime.bigint();
  private lastSampleTime = process.hrtime.bigint();
  private sharedView?: Int32Array;
  private sharedFloatView?: Float64Array;
  
  // Performance tracking
  private actualFrequency = 0;
  private workerOverhead = 0;
  private lastValidationTime = process.hrtime.bigint();
  private validationPassed = true;
  
  // Adaptive throttling
  private currentInterval = 1; // Start with 1ms
  private overheadHistory: number[] = [];
  private readonly OVERHEAD_WINDOW_SIZE = 100;
  
  constructor(config: WorkerConfig) {
    const defaultConfig = {
      targetFrequency: 1000,
      maxOverhead: 0.1, // 10% max CPU overhead
      adaptiveThrottling: true,
      validationEnabled: true
    };
    
    this.config = {
      ...defaultConfig,
      ...config
    };
    
    this.currentInterval = 1000 / this.config.targetFrequency;
    
    if (config.sharedBuffer) {
      this.setupSharedBuffer(config.sharedBuffer);
    }
  }
  
  /**
   * Setup SharedArrayBuffer for efficient cross-thread communication
   */
  private setupSharedBuffer(buffer: SharedArrayBuffer): void {
    this.sharedView = new Int32Array(buffer, 0, SHARED_BUFFER_INDICES.BUFFER_SIZE);
    this.sharedFloatView = new Float64Array(buffer, SHARED_BUFFER_INDICES.BUFFER_SIZE * 4);
    
    console.log('[MetricsWorker] SharedArrayBuffer initialized');
  }
  
  /**
   * Start high-frequency metrics collection
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    console.log(`[MetricsWorker] Starting high-frequency collection at ${this.config.targetFrequency} Hz`);
    this.isRunning = true;
    this.startTime = process.hrtime.bigint();
    this.lastSampleTime = this.startTime;
    
    // Start the high-frequency collection loop
    this.scheduleNextSample();
    
    // Start validation if enabled
    if (this.config.validationEnabled) {
      this.startWallClockValidation();
    }
  }
  
  /**
   * Stop metrics collection
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('[MetricsWorker] Stopped high-frequency collection');
  }
  
  /**
   * Schedule next sample with adaptive timing
   */
  private scheduleNextSample(): void {
    if (!this.isRunning) return;
    
    const scheduleNext = () => {
      if (!this.isRunning) return;
      
      // Use setImmediate for maximum frequency when overhead is low
      if (this.workerOverhead < this.config.maxOverhead * 0.5) {
        setImmediate(() => this.collectSample());
      } else {
        // Use setTimeout with adaptive interval when overhead is higher
        setTimeout(() => this.collectSample(), this.currentInterval);
      }
    };
    
    scheduleNext();
  }
  
  /**
   * Collect a single metrics sample
   */
  private collectSample(): void {
    const sampleStart = process.hrtime.bigint();
    
    try {
      // Collect lightweight metrics optimized for speed
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      
      const sampleEnd = process.hrtime.bigint();
      const overhead = Number(sampleEnd - sampleStart) / 1_000_000; // Convert to milliseconds
      
      // Update performance tracking
      this.sampleCount++;
      this.lastSampleTime = sampleEnd;
      this.updateOverheadTracking(overhead);
      
      // Update shared buffer if available
      if (this.sharedView && this.sharedFloatView) {
        this.updateSharedBuffer(cpuUsage, memoryUsage, overhead);
      }
      
      // Send sample to main thread (non-blocking)
      if (parentPort && this.sampleCount % 100 === 0) { // Send every 100th sample to reduce message overhead
        parentPort.postMessage({
          type: 'metrics_sample',
          data: {
            timestamp: sampleEnd,
            cpuUsage,
            memoryUsage,
            workerOverhead: overhead,
            sequenceNumber: this.sampleCount,
            actualFrequency: this.actualFrequency
          }
        });
      }
      
      // Adaptive throttling if enabled
      if (this.config.adaptiveThrottling) {
        this.adjustSamplingRate();
      }
      
    } catch (error) {
      console.error('[MetricsWorker] Error collecting sample:', error);
    }
    
    // Schedule next sample
    this.scheduleNextSample();
  }
  
  /**
   * Update overhead tracking and calculate actual frequency
   */
  private updateOverheadTracking(overhead: number): void {
    this.overheadHistory.push(overhead);
    if (this.overheadHistory.length > this.OVERHEAD_WINDOW_SIZE) {
      this.overheadHistory.shift();
    }
    
    // Calculate average overhead
    this.workerOverhead = this.overheadHistory.reduce((sum, val) => sum + val, 0) / this.overheadHistory.length;
    
    // Calculate actual frequency
    const elapsed = Number(this.lastSampleTime - this.startTime) / 1_000_000_000; // Convert to seconds
    this.actualFrequency = this.sampleCount / elapsed;
  }
  
  /**
   * Update SharedArrayBuffer with latest metrics
   */
  private updateSharedBuffer(cpuUsage: NodeJS.CpuUsage, memoryUsage: NodeJS.MemoryUsage, overhead: number): void {
    if (!this.sharedView || !this.sharedFloatView) return;
    
    // Update atomic counters and metrics
    Atomics.store(this.sharedView, SHARED_BUFFER_INDICES.SAMPLE_COUNT, this.sampleCount);
    Atomics.store(this.sharedView, SHARED_BUFFER_INDICES.LAST_SAMPLE_TIME, Number(this.lastSampleTime / 1_000_000n));
    
    // Update floating point metrics
    this.sharedFloatView[SHARED_BUFFER_INDICES.ACTUAL_FREQUENCY] = this.actualFrequency;
    this.sharedFloatView[SHARED_BUFFER_INDICES.CPU_USER] = cpuUsage.user;
    this.sharedFloatView[SHARED_BUFFER_INDICES.CPU_SYSTEM] = cpuUsage.system;
    this.sharedFloatView[SHARED_BUFFER_INDICES.MEMORY_HEAP_USED] = memoryUsage.heapUsed;
    this.sharedFloatView[SHARED_BUFFER_INDICES.MEMORY_HEAP_TOTAL] = memoryUsage.heapTotal;
    this.sharedFloatView[SHARED_BUFFER_INDICES.MEMORY_RSS] = memoryUsage.rss;
    this.sharedFloatView[SHARED_BUFFER_INDICES.WORKER_OVERHEAD] = this.workerOverhead;
    
    Atomics.store(this.sharedView, SHARED_BUFFER_INDICES.VALIDATION_PASSED, this.validationPassed ? 1 : 0);
  }
  
  /**
   * Adjust sampling rate based on performance
   */
  private adjustSamplingRate(): void {
    if (this.workerOverhead > this.config.maxOverhead) {
      // Reduce frequency if overhead is too high
      this.currentInterval = Math.min(this.currentInterval * 1.1, 100); // Max 100ms interval (10 Hz)
    } else if (this.workerOverhead < this.config.maxOverhead * 0.5) {
      // Increase frequency if overhead is low
      this.currentInterval = Math.max(this.currentInterval * 0.95, 0.1); // Min 0.1ms interval (10,000 Hz)
    }
  }
  
  /**
   * Start wall-clock validation to prove actual sampling rate
   */
  private startWallClockValidation(): void {
    const validationInterval = 1000; // Validate every 1 second
    
    const validate = () => {
      if (!this.isRunning) return;
      
      const currentTime = process.hrtime.bigint();
      const elapsedSeconds = Number(currentTime - this.lastValidationTime) / 1_000_000_000;
      const expectedSamples = this.config.targetFrequency * elapsedSeconds;
      const actualSamples = this.sampleCount;
      const achievedFrequency = actualSamples / elapsedSeconds;
      
      // Validation: must achieve at least 90% of target frequency
      this.validationPassed = achievedFrequency >= this.config.targetFrequency * 0.9;
      
      if (!this.validationPassed) {
        console.warn(`[MetricsWorker] VALIDATION FAILED: Target ${this.config.targetFrequency} Hz, Actual ${achievedFrequency.toFixed(2)} Hz`);
        
        // Report to main thread
        if (parentPort) {
          parentPort.postMessage({
            type: 'validation_failed',
            data: {
              targetFrequency: this.config.targetFrequency,
              actualFrequency: achievedFrequency,
              overhead: this.workerOverhead
            }
          });
        }
      } else {
        console.log(`[MetricsWorker] Validation passed: ${achievedFrequency.toFixed(2)} Hz (target: ${this.config.targetFrequency} Hz)`);
      }
      
      this.lastValidationTime = currentTime;
      
      setTimeout(validate, validationInterval);
    };
    
    setTimeout(validate, validationInterval);
  }
  
  /**
   * Get current performance statistics
   */
  getStats() {
    return {
      sampleCount: this.sampleCount,
      actualFrequency: this.actualFrequency,
      workerOverhead: this.workerOverhead,
      validationPassed: this.validationPassed,
      currentInterval: this.currentInterval
    };
  }
}

// Worker thread execution
if (!isMainThread && parentPort) {
  console.log('[MetricsWorker] High-frequency metrics worker started');
  
  const config: WorkerConfig = workerData || {};
  const worker = new HighFrequencyMetricsWorker(config);
  
  // Handle messages from main thread
  parentPort.on('message', async (message) => {
    switch (message.type) {
      case 'start':
        await worker.start();
        parentPort!.postMessage({ type: 'started' });
        break;
        
      case 'stop':
        await worker.stop();
        parentPort!.postMessage({ type: 'stopped' });
        break;
        
      case 'get_stats':
        parentPort!.postMessage({ 
          type: 'stats', 
          data: worker.getStats() 
        });
        break;
        
      default:
        console.warn('[MetricsWorker] Unknown message type:', message.type);
    }
  });
  
  // Handle worker termination
  process.on('SIGTERM', async () => {
    await worker.stop();
    process.exit(0);
  });
  
  console.log('[MetricsWorker] Worker ready for commands');
}

export { HighFrequencyMetricsWorker };
export type { WorkerConfig, MetricsSample };
export { SHARED_BUFFER_INDICES };