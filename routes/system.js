const express = require('express');
const os = require('os');
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

router.get('/', (req, res) => {
  res.json(getSystemSpecs());
});

module.exports = router;
