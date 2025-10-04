// Performance optimizations and utilities for E2EE operations
class E2EEPerformanceOptimizer {
  constructor() {
    this.memoryThreshold = 100 * 1024 * 1024; // 100MB threshold for memory management
    this.chunkSize = 16 * 1024 * 1024; // 16MB chunks
  }

  // Check if we should use chunked processing based on file size
  shouldUseChunkedProcessing(fileSize) {
    return fileSize > this.memoryThreshold;
  }

  // Estimate processing time based on file size and device capabilities
  estimateProcessingTime(fileSize) {
    // Rough estimates based on typical device performance
    const bytesPerSecond = this.getEstimatedThroughput();
    const estimatedSeconds = fileSize / bytesPerSecond;
    
    return {
      seconds: estimatedSeconds,
      humanReadable: this.formatTime(estimatedSeconds)
    };
  }

  // Get estimated throughput based on device capabilities
  getEstimatedThroughput() {
    // Use navigator.hardwareConcurrency as a rough indicator of device power
    const cores = navigator.hardwareConcurrency || 2;
    const baseRate = 5 * 1024 * 1024; // 5MB/s base rate
    
    // Scale based on available cores (diminishing returns)
    const scaledRate = baseRate * Math.min(cores / 2, 4);
    
    return scaledRate;
  }

  // Format time in a human-readable way
  formatTime(seconds) {
    if (seconds < 60) {
      return `${Math.ceil(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.ceil(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${remainingMinutes}m`;
    }
  }

  // Format file size in human-readable way
  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = (bytes / Math.pow(1024, i)).toFixed(1);
    
    return `${size} ${sizes[i]}`;
  }

  // Check if Web Workers are supported
  isWebWorkerSupported() {
    return typeof Worker !== 'undefined';
  }

  // Check if device has sufficient memory for operation
  hasEnoughMemory(fileSize) {
    // Estimate memory usage: file + encrypted file + overhead
    const estimatedMemoryUsage = fileSize * 3;
    
    // Check if Performance API is available for memory info
    if ('memory' in performance) {
      const availableMemory = performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize;
      return availableMemory > estimatedMemoryUsage;
    }
    
    // Fallback: assume sufficient memory for files under 50MB
    return fileSize < 50 * 1024 * 1024;
  }

  // Provide user warnings for large files
  getLargeFileWarning(fileSize) {
    const estimate = this.estimateProcessingTime(fileSize);
    const sizeFormatted = this.formatFileSize(fileSize);
    
    if (fileSize > 100 * 1024 * 1024) {
      return {
        level: 'warning',
        title: 'Large File Detected',
        message: `This file (${sizeFormatted}) may take approximately ${estimate.humanReadable} to process. Please keep this tab open during processing.`
      };
    }
    
    if (fileSize > 50 * 1024 * 1024) {
      return {
        level: 'info',
        title: 'Processing Time',
        message: `Estimated processing time: ${estimate.humanReadable}`
      };
    }
    
    return null;
  }

  // Get optimal chunk size based on available memory
  getOptimalChunkSize(fileSize) {
    if (!this.hasEnoughMemory(fileSize)) {
      // Use smaller chunks for memory-constrained environments
      return Math.min(this.chunkSize / 2, 8 * 1024 * 1024); // 8MB max
    }
    
    return this.chunkSize;
  }
}

// Global performance optimizer instance
window.e2eeOptimizer = new E2EEPerformanceOptimizer();

// Simple performance monitor
class E2EEPerformanceMonitor {
  constructor() {
    this.metrics = [];
  }

  startOperation(type, fileSize) {
    const operation = {
      id: Date.now() + Math.random(),
      type,
      fileSize,
      startTime: performance.now(),
      endTime: null,
      duration: null,
      success: false
    };
    
    this.metrics.push(operation);
    return operation.id;
  }

  endOperation(id, success = true) {
    const operation = this.metrics.find(op => op.id === id);
    if (operation) {
      operation.endTime = performance.now();
      operation.duration = operation.endTime - operation.startTime;
      operation.success = success;
      
      // Log performance info (can be extended to send analytics)
      console.log(`E2EE ${operation.type} completed in ${Math.round(operation.duration)}ms (${operation.success ? 'success' : 'failed'})`);
    }
  }

  getAveragePerformance(type) {
    const operations = this.metrics.filter(op => op.type === type && op.success && op.duration);
    if (operations.length === 0) return null;
    
    const avgDuration = operations.reduce((sum, op) => sum + op.duration, 0) / operations.length;
    const avgThroughput = operations.reduce((sum, op) => sum + (op.fileSize / (op.duration / 1000)), 0) / operations.length;
    
    return {
      averageDuration: avgDuration,
      averageThroughput: avgThroughput,
      sampleSize: operations.length
    };
  }
}

// Global performance monitor
window.e2eePerfMonitor = new E2EEPerformanceMonitor();