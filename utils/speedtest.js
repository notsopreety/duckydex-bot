const https = require('https');
const http = require('http');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'speedtest' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * Test download speed by downloading a test file
 * @returns {Promise<Object>} Download speed test results
 */
async function testDownloadSpeed() {
  return new Promise((resolve, reject) => {
    const testUrl = 'https://sin-speed.hetzner.com/100MB.bin'; // 100MB test file
    const startTime = Date.now();
    let downloadedBytes = 0;

    const request = https.get(testUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });

      response.on('end', () => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // seconds
        const speedMbps = (downloadedBytes * 8) / (duration * 1024 * 1024); // Mbps
        const speedKBps = downloadedBytes / (duration * 1024); // KB/s

        resolve({
          success: true,
          downloadedBytes,
          duration,
          speedMbps: Math.round(speedMbps * 100) / 100,
          speedKBps: Math.round(speedKBps * 100) / 100
        });
      });

      response.on('error', (error) => {
        reject(error);
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download speed test timeout'));
    });
  });
}

/**
 * Test upload speed by sending larger raw binary data to a test endpoint
 * @returns {Promise<Object>} Upload speed test results
 */
async function testUploadSpeed() {
  return new Promise((resolve, reject) => {
    // Create test data (10MB buffer)
    const testData = Buffer.alloc(10 * 1024 * 1024, 'a'); // 10MB
    const startTime = Date.now();

    const options = {
      hostname: 'httpbin.org', // Still using httpbin.org, but could be replaced with your own endpoint
      port: 443,
      path: '/post',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': testData.length
      }
    };

    const request = https.request(options, (response) => {
      let responseData = '';
      response.on('data', (chunk) => { responseData += chunk; });

      response.on('end', () => {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // seconds
        const uploadedBytes = testData.length;
        const speedMbps = (uploadedBytes * 8) / (duration * 1024 * 1024); // Mbps
        const speedKBps = uploadedBytes / (duration * 1024); // KB/s

        if (response.statusCode === 200) {
          resolve({
            success: true,
            uploadedBytes,
            duration,
            speedMbps: Math.round(speedMbps * 100) / 100,
            speedKBps: Math.round(speedKBps * 100) / 100
          });
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        }
      });
    });

    request.on('error', (error) => reject(error));

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Upload speed test timeout'));
    });

    // Send binary data directly
    request.write(testData);
    request.end();
  });
}


/**
 * Get system information
 * @returns {Object} System information
 */
function getSystemInfo() {
  const os = require('os');
  
  return {
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100, // GB
    freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024) * 100) / 100, // GB
    cpuCount: os.cpus().length,
    uptime: Math.round(os.uptime() / 3600 * 100) / 100 // hours
  };
}

/**
 * Run complete speed test
 * @returns {Promise<Object>} Complete speed test results
 */
async function runSpeedTest() {
  logger.info('Starting speed test');
  
  const results = {
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    download: null,
    upload: null,
    errors: []
  };

  // Test download speed
  try {
    logger.info('Testing download speed');
    results.download = await testDownloadSpeed();
    logger.info('Download test completed', { speed: results.download.speedMbps + ' Mbps' });
  } catch (error) {
    logger.error('Download test failed', { error: error.message });
    results.errors.push(`Download test failed: ${error.message}`);
  }

  // Test upload speed
  try {
    logger.info('Testing upload speed');
    results.upload = await testUploadSpeed();
    logger.info('Upload test completed', { speed: results.upload.speedMbps + ' Mbps' });
  } catch (error) {
    logger.error('Upload test failed', { error: error.message });
    results.errors.push(`Upload test failed: ${error.message}`);
  }

  logger.info('Speed test completed', { 
    downloadSpeed: results.download?.speedMbps + ' Mbps',
    uploadSpeed: results.upload?.speedMbps + ' Mbps',
    errors: results.errors.length
  });

  return results;
}

/**
 * Format speed test results for display
 * @param {Object} results - Speed test results
 * @returns {string} Formatted message
 */
function formatSpeedTestResults(results) {
  const { system, download, upload, errors, timestamp } = results;
  
  let message = `🚀 **Bot Speed Test Results**\n\n`;
  message += `📅 **Test Time:** ${new Date(timestamp).toLocaleString()}\n\n`;
  
  // System Information
  message += `💻 **System Information:**\n`;
  message += `• Platform: ${system.platform} (${system.arch})\n`;
  message += `• Node.js: ${system.nodeVersion}\n`;
  message += `• CPU Cores: ${system.cpuCount}\n`;
  message += `• Memory: ${system.freeMemory}GB / ${system.totalMemory}GB\n`;
  message += `• Uptime: ${system.uptime} hours\n\n`;
  
  // Download Speed
  if (download && download.success) {
    message += `⬇️ **Download Speed:**\n`;
    message += `• Speed: **${download.speedMbps} Mbps** (${download.speedKBps} KB/s)\n`;
    message += `• Data: ${Math.round(download.downloadedBytes / 1024)} KB in ${download.duration}s\n\n`;
  } else {
    message += `⬇️ **Download Speed:** ❌ Test Failed\n\n`;
  }
  
  // Upload Speed
  if (upload && upload.success) {
    message += `⬆️ **Upload Speed:**\n`;
    message += `• Speed: **${upload.speedMbps} Mbps** (${upload.speedKBps} KB/s)\n`;
    message += `• Data: ${Math.round(upload.uploadedBytes / 1024)} KB in ${upload.duration}s\n\n`;
  } else {
    message += `⬆️ **Upload Speed:** ❌ Test Failed\n\n`;
  }
  
  // Performance Rating
  const avgSpeed = ((download?.speedMbps || 0) + (upload?.speedMbps || 0)) / 2;
  let rating = '🔴 Poor';
  if (avgSpeed > 50) rating = '🟢 Excellent';
  else if (avgSpeed > 25) rating = '🟡 Good';
  else if (avgSpeed > 10) rating = '🟠 Fair';
  
  message += `📊 **Overall Performance:** ${rating} (${avgSpeed.toFixed(1)} Mbps avg)\n\n`;
  
  // Errors
  if (errors.length > 0) {
    message += `⚠️ **Errors:**\n`;
    errors.forEach(error => {
      message += `• ${error}\n`;
    });
    message += `\n`;
  }
  
  message += `💡 **Note:** Results may vary based on server location and network conditions.`;
  
  return message;
}

module.exports = {
  runSpeedTest,
  formatSpeedTestResults,
  testDownloadSpeed,
  testUploadSpeed,
  getSystemInfo
};
