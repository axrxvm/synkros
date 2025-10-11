const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const formatMessage = (message, req) => {
  const rayId = req && req.rayId ? req.rayId : uuidv4();
  return `[${rayId}] ${message}`;
};

const log = (level, message, req) => {
  logger.log(level, formatMessage(message, req));
};

module.exports = {
  log,
  info: (message, req) => log('info', message, req),
  error: (message, req) => log('error', message, req),
  warn: (message, req) => log('warn', message, req),
};
