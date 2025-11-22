const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const Transport = require('winston-transport');
const https = require('https');
const { URL } = require('url');

// Custom Discord Webhook Transport
class DiscordTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.webhookUrl = opts.webhookUrl;
    this.name = 'discord';
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    if (!this.webhookUrl) {
      return callback();
    }

    const { level, message, rayId, method, path, timestamp } = info;
    
    // Color coding for Discord embeds
    const colors = {
      error: 15158332, // Red
      warn: 16776960,  // Yellow
    };

    const embed = {
      title: `${level.toUpperCase()} - Synkros`,
      description: message,
      color: colors[level] || 3447003,
      fields: [
        { name: 'Ray ID', value: rayId || 'N/A', inline: true },
        { name: 'Method', value: method || 'N/A', inline: true },
        { name: 'Path', value: path || 'N/A', inline: true },
      ],
      timestamp: timestamp || new Date().toISOString(),
      footer: {
        text: `Synkros ${process.env.NODE_ENV || 'development'}`,
      },
    };

    const payload = JSON.stringify({
      embeds: [embed],
    });

    try {
      const url = new URL(this.webhookUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const req = https.request(options, (res) => {
        // Consume response data to free up memory
        res.on('data', () => {});
        res.on('end', () => callback());
      });

      req.on('error', (error) => {
        console.error('Discord webhook error:', error.message);
        callback();
      });

      req.write(payload);
      req.end();
    } catch (error) {
      console.error('Discord webhook error:', error.message);
      callback();
    }
  }
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'synkros' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Add Discord webhook transport if configured
if (process.env.LOG_WEBHOOK) {
  logger.add(
    new DiscordTransport({
      level: 'warn', // Log WARN and ERROR (ERROR is higher priority than WARN)
      webhookUrl: process.env.LOG_WEBHOOK,
    })
  );
}

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

const formatMessage = (message, req) => {
  const rayId = req && req.rayId ? req.rayId : uuidv4();
  const method = req && req.method ? req.method : 'N/A';
  const path = req && req.path ? req.path : 'N/A';
  
  return {
    rayId,
    method,
    path,
    message,
    timestamp: new Date().toISOString()
  };
};

const log = (level, message, req) => {
  const logData = formatMessage(message, req);
  logger.log(level, `[${logData.rayId}] ${message}`, logData);
};

module.exports = {
  log,
  info: (message, req) => log('info', message, req),
  error: (message, req) => log('error', message, req),
  warn: (message, req) => log('warn', message, req),
};
