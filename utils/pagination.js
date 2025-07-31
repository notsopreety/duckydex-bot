/**
 * Create pagination buttons
 * @param {number} currentPage - Current page number (0-based)
 * @param {number} totalPages - Total number of pages
 * @param {string} callbackPrefix - Prefix for callback data
 * @returns {Array} - Array of button objects
 */
function createPaginationButtons(currentPage, totalPages, callbackPrefix) {
  const buttons = [];
  
  if (currentPage > 0) {
    buttons.push({
      text: '⬅️ Previous',
      callback_data: `${callbackPrefix}_${currentPage - 1}`
    });
  }
  
  buttons.push({
    text: `${currentPage + 1}/${totalPages}`,
    callback_data: 'page_info'
  });
  
  if (currentPage < totalPages - 1) {
    buttons.push({
      text: 'Next ➡️',
      callback_data: `${callbackPrefix}_${currentPage + 1}`
    });
  }
  
  return buttons;
}

/**
 * Calculate pagination info
 * @param {Array} items - Array of items to paginate
 * @param {number} page - Current page (0-based)
 * @param {number} itemsPerPage - Items per page
 * @returns {Object} - Pagination info
 */
function getPaginationInfo(items, page, itemsPerPage) {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = page * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const pageItems = items.slice(startIndex, endIndex);
  
  return {
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
    hasNextPage: page < totalPages - 1,
    hasPreviousPage: page > 0
  };
}

/**
 * Store search results temporarily (in-memory storage)
 * Note: In production, you'd want to use Redis or a database
 */
const searchCache = new Map();
const latestCache = new Map();

/**
 * Store search results for pagination
 * @param {string} chatId - Chat ID
 * @param {Array} results - Search results
 * @param {string} query - Search query
 */
function storeSearchResults(chatId, results, query) {
  searchCache.set(chatId, {
    results,
    query,
    timestamp: Date.now()
  });
  
  // Clean up old results (older than 1 hour)
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, value] of searchCache.entries()) {
    if (value.timestamp < oneHourAgo) {
      searchCache.delete(key);
    }
  }
}

/**
 * Get stored search results
 * @param {string} chatId - Chat ID
 * @returns {Object|null} - Stored search data or null
 */
function getStoredSearchResults(chatId) {
  return searchCache.get(chatId) || null;
}

/**
 * Store latest results
 * @param {string} chatId - Chat ID
 * @param {Array} results - Latest results
 */
function storeLatestResults(chatId, results) {
  latestCache.set(chatId, results);
}

/**
 * Get stored latest results
 * @param {string} chatId - Chat ID
 * @returns {Array|null} - Stored latest results or null
 */
function getStoredLatestResults(chatId) {
  return latestCache.get(chatId) || null;
}

module.exports = {
  createPaginationButtons,
  getPaginationInfo,
  storeSearchResults,
  getStoredSearchResults,
  storeLatestResults,
  getStoredLatestResults
};
