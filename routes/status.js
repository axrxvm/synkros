const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const uptimeSeconds = process.uptime();
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);
  
  const uptimeReadable = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  
  res.status(200).json({
    status: 'OK',
    uptime: uptimeReadable,
    systemTime: new Date().toISOString()
  });
});

module.exports = router;
