const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

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
