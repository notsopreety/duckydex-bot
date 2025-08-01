const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'bot-deletion' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

// Store message IDs for auto-deletion
const messagesToDelete = new Map();

/**
 * Message sender with auto-deletion
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {string|Object} content - Message content or options
 * @param {Object} options - Additional options
 * @param {number} deleteAfter - Delete after milliseconds (default: 0 = no deletion)
 * @returns {Promise<Object>} - Sent message
 */
async function sendMessageWithAutoDeletion(bot, chatId, content, options = {}, deleteAfter = 0) {
  try {
    let sentMessage;
    
    if (typeof content === 'string') {
      sentMessage = await bot.sendMessage(chatId, content, options);
    } else {
      sentMessage = await bot.sendMessage(chatId, content.text, {
        ...options,
        reply_markup: content.reply_markup,
        parse_mode: content.parse_mode
      });
    }
    
    // Schedule auto-deletion if specified
    if (deleteAfter > 0) {
      scheduleMessageDeletion(bot, chatId, sentMessage.message_id, deleteAfter);
    }
    
    logger.info('Sent message with auto-deletion', { 
      chatId, 
      messageId: sentMessage.message_id, 
      deleteAfter 
    });
    
    return sentMessage;
  } catch (error) {
    logger.error('Failed to send message with auto-deletion', { chatId, error: error.message });
    throw error;
  }
}

/**
 * Photo sender with auto-deletion
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {string} photo - Photo URL or buffer
 * @param {Object} options - Photo options
 * @param {number} deleteAfter - Delete after milliseconds (default: 0 = no deletion)
 * @returns {Promise<Object>} - Sent message
 */
async function sendPhotoWithAutoDeletion(bot, chatId, photo, options = {}, deleteAfter = 0) {
  try {
    const sentMessage = await bot.sendPhoto(chatId, photo, options);
    
    // Schedule auto-deletion if specified
    if (deleteAfter > 0) {
      scheduleMessageDeletion(bot, chatId, sentMessage.message_id, deleteAfter);
    }
    
    logger.info('Sent photo with auto-deletion', { 
      chatId, 
      messageId: sentMessage.message_id, 
      deleteAfter 
    });
    
    return sentMessage;
  } catch (error) {
    logger.error('Failed to send photo with auto-deletion', { chatId, error: error.message });
    throw error;
  }
}

/**
 * Safe edit or send with better error handling
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID to edit
 * @param {Object} messageOptions - Message options
 * @param {boolean} isPhoto - Whether it's a photo message
 * @param {number} deleteAfter - Delete after milliseconds (default: 0 = no deletion)
 * @returns {Promise<Object>} - Result message
 */
async function safeEditOrSend(bot, chatId, messageId, messageOptions, isPhoto = false, deleteAfter = 0) {
  try {
    let resultMessage;
    
    // Cancel any existing deletion schedule for this message
    cancelMessageDeletion(chatId, messageId);
    
    if (isPhoto && messageOptions.photo) {
      await bot.editMessageCaption(messageOptions.caption || messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
      logger.info('Edited photo caption', { chatId, messageId });
      resultMessage = { message_id: messageId };
    } else {
      await bot.editMessageText(messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
      logger.info('Edited text message', { chatId, messageId });
      resultMessage = { message_id: messageId };
    }
    
    // Schedule auto-deletion if specified
    if (deleteAfter > 0) {
      scheduleMessageDeletion(bot, chatId, messageId, deleteAfter);
    }
    
    return resultMessage;
  } catch (error) {
    logger.warn('Message edit failed, sending new message', { chatId, messageId, error: error.message });
    
    // If edit fails, send new message
    if (isPhoto && messageOptions.photo) {
      return await sendPhotoWithAutoDeletion(bot, chatId, messageOptions.photo, {
        caption: messageOptions.caption || messageOptions.text,
        parse_mode: messageOptions.parse_mode,
        reply_markup: messageOptions.reply_markup
      }, deleteAfter);
    } else {
      return await sendMessageWithAutoDeletion(bot, chatId, messageOptions, {}, deleteAfter);
    }
  }
}

/**
 * Schedule message for deletion
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 * @param {number} deleteAfter - Delete after milliseconds
 */
function scheduleMessageDeletion(bot, chatId, messageId, deleteAfter) {
  // Cancel any existing deletion schedule
  cancelMessageDeletion(chatId, messageId);
  
  const timeoutId = setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId);
      logger.info('Auto-deleted message', { chatId, messageId });
      messagesToDelete.delete(`${chatId}_${messageId}`);
    } catch (error) {
      logger.warn('Failed to auto-delete message', { chatId, messageId, error: error.message });
      messagesToDelete.delete(`${chatId}_${messageId}`);
    }
  }, deleteAfter);
  
  // Store timeout ID for potential cancellation
  messagesToDelete.set(`${chatId}_${messageId}`, timeoutId);
}

/**
 * Cancel scheduled message deletion
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID
 */
function cancelMessageDeletion(chatId, messageId) {
  const key = `${chatId}_${messageId}`;
  const timeoutId = messagesToDelete.get(key);
  
  if (timeoutId) {
    clearTimeout(timeoutId);
    messagesToDelete.delete(key);
    logger.info('Cancelled message deletion', { chatId, messageId });
  }
}

/**
 * Callback query handler with better error handling and loading states
 * @param {Object} bot - Telegram bot instance
 * @param {Object} callbackQuery - Callback query object
 * @param {Function} handler - Handler function
 * @param {string} loadingText - Loading text to show
 * @param {number} loadingDeleteAfter - Delete loading message after ms (default: 0)
 */
async function handleCallbackWithLoading(bot, callbackQuery, handler, loadingText = '⏳ Loading...', loadingDeleteAfter = 0) {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;
  
  try {
    // Show loading state
    const loadingMessage = await safeEditOrSend(
      bot, 
      chatId, 
      msg.message_id, 
      { text: loadingText },
      false,
      loadingDeleteAfter
    );
    
    // Execute the handler
    const result = await handler(bot, callbackQuery, loadingMessage);
    
    // Cancel deletion of the loading message if it was replaced
    cancelMessageDeletion(chatId, loadingMessage.message_id);
    
    return result;
  } catch (error) {
    logger.error('Callback handler failed', { chatId, data, error: error.message });
    
    // Show error message
    await safeEditOrSend(
      bot,
      chatId,
      msg.message_id,
      {
        text: '❌ Something went wrong. Please try again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔄 Retry',
            callback_data: data
          }]]
        }
      },
      false,
      30000 // Auto-delete error message after 30 seconds
    );
  }
}

/**
 * Batch delete multiple messages
 * @param {Object} bot - Telegram bot instance
 * @param {number} chatId - Chat ID
 * @param {Array} messageIds - Array of message IDs
 */
async function batchDeleteMessages(bot, chatId, messageIds) {
  const deletePromises = messageIds.map(async (messageId) => {
    try {
      await bot.deleteMessage(chatId, messageId);
      logger.info('Deleted message in batch', { chatId, messageId });
      cancelMessageDeletion(chatId, messageId);
    } catch (error) {
      logger.warn('Failed to delete message in batch', { chatId, messageId, error: error.message });
    }
  });
  
  await Promise.allSettled(deletePromises);
}

/**
 * Clean up old messages (for maintenance)
 */
function cleanupScheduledDeletions() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, timeoutId] of messagesToDelete.entries()) {
    // If timeout is very old (more than 1 hour), clean it up
    if (now - timeoutId._idleStart > 3600000) {
      clearTimeout(timeoutId);
      messagesToDelete.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info('Cleaned up old scheduled deletions', { cleaned });
  }
}

// Run cleanup every hour
setInterval(cleanupScheduledDeletions, 3600000);

/**
 * Get message deletion timeouts for different message types
 */
const DELETION_TIMEOUTS = {
  ERROR_MESSAGE: 30000,      // 30 seconds
  SUCCESS_MESSAGE: 1800000,  // 30 minutes auto-deletion for success messages
  LOADING_MESSAGE: 5000,     // 5 seconds
  TEMPORARY_INFO: 15000,     // 15 seconds
  USER_INTERACTION: 1800000, // 30 minutes auto-deletion for user interactions
  SEARCH_RESULTS: 1800000,   // 30 minutes auto-deletion for search results
  MANGA_DETAILS: 1800000,    // 30 minutes auto-deletion for manga details
  CHAPTER_LIST: 1800000       // 30 minutes auto-deletion for chapter lists
};

module.exports = {
  sendMessageWithAutoDeletion,
  sendPhotoWithAutoDeletion,
  safeEditOrSend,
  scheduleMessageDeletion,
  cancelMessageDeletion,
  handleCallbackWithLoading,
  batchDeleteMessages,
  cleanupScheduledDeletions,
  DELETION_TIMEOUTS,
  logger
};