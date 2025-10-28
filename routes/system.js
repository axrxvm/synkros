const express = require('express');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const router = express.Router();

const getSystemSpecs = () => {
  return {
    uptime: process.uptime(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    },
    cpus: os.cpus().length,
    loadavg: os.loadavg(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    hostname: os.hostname(),
    processId: process.pid,
    cwd: process.cwd(),
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  };
};

const getStorageStatus = () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const storage = {
    uploadsDirectory: {
      exists: fs.existsSync(uploadsDir),
      writable: false,
      fileCount: 0,
      totalSize: '0 B'
    },
    diskSpace: {
      available: null,
      percentUsed: null
    }
  };

  // Check uploads directory
  if (fs.existsSync(uploadsDir)) {
    try {
      // Check if writable
      fs.accessSync(uploadsDir, fs.constants.W_OK);
      storage.uploadsDirectory.writable = true;

      // Get file list and calculate total size
      const files = fs.readdirSync(uploadsDir);
      let totalSize = 0;

      files.forEach(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
          }
        } catch (err) {
          // Skip files that can't be read
        }
      });

      storage.uploadsDirectory.fileCount = files.filter(file => {
        try {
          const filePath = path.join(uploadsDir, file);
          return fs.statSync(filePath).isFile();
        } catch {
          return false;
        }
      }).length;
      storage.uploadsDirectory.totalSize = formatBytes(totalSize);
    } catch (err) {
      storage.uploadsDirectory.error = err.message;
    }
  }

  // Try to get disk space info (Linux/Unix)
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync(uploadsDir);
      const availableSpace = stats.bavail * stats.bsize;
      const totalSpace = stats.blocks * stats.bsize;
      const usedSpace = totalSpace - availableSpace;

      storage.diskSpace = {
        available: formatBytes(availableSpace),
        percentUsed: ((usedSpace / totalSpace) * 100).toFixed(2) + '%'
      };
    }
  } catch (err) {
    // statfsSync not available, try df command
    try {
      const dfOutput = execSync('df -B1 .', { encoding: 'utf8', cwd: uploadsDir });
      const lines = dfOutput.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        if (parts.length >= 4) {
          const totalSpace = parseInt(parts[1]);
          const usedSpace = parseInt(parts[2]);
          const availableSpace = parseInt(parts[3]);

          storage.diskSpace = {
            available: formatBytes(availableSpace),
            percentUsed: ((usedSpace / totalSpace) * 100).toFixed(2) + '%'
          };
        }
      }
    } catch (dfErr) {
      storage.diskSpace.error = 'Unable to retrieve disk space information';
    }
  }

  return storage;
};

// Helper function to format bytes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 B';
  if (!bytes) return 'N/A';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

router.get('/', (req, res) => {
  const systemInfo = getSystemSpecs();
  const storageInfo = getStorageStatus();
  
  res.json({
    system: systemInfo,
    storage: storageInfo
  });
});

module.exports = router;
