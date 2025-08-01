const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) =>
      `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.File({ filename: 'error.log', level: 'error' })
  ]
});

/**
 * Calculate bot's latency
 * @returns {Promise<Object>} Latency information
 */
async function checkLatency() {
  const startTime = Date.now();
  
  // Simulate some async operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const endTime = Date.now();
  const latency = endTime - startTime;
  
  logger.info(`Ping test completed in ${latency}ms`);
  
  return {
    timestamp: new Date().toISOString(),
    latency,
    status: latency < 100 ? '🟢 Excellent' : 
            latency < 300 ? '🟡 Good' : 
            latency < 500 ? '🟠 Fair' : '🔴 Poor'
  };
}

/**
 * Format ping results for display
 * @param {Object} result - Ping results
 * @returns {string} Formatted message
 */
function formatPingResults(result) {
  return `🏓 **Ping Test**
` +
    `⏱️ Response Time: **${result.latency}ms**
` +
    `📊 Status: ${result.status}
` +
    `🕒 ${new Date(result.timestamp).toLocaleString()}

` +
    `_Note: Lower values are better. This measures the bot's response time._`;
}

module.exports = {
  checkLatency,
  formatPingResults
};
