const axios = require('axios');

/**
 * Search for manga using the API
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Search results
 */
async function searchManga(query) {
  try {
    const response = await axios.get(`https://api.samirb.com.np/manga/search?q=${encodeURIComponent(query)}`);
    return response.data;
  } catch (error) {
    console.error('Error searching manga:', error.message);
    return [];
  }
}

/**
 * Create search results message with inline keyboard buttons
 * @param {Array} results - Search results
 * @param {number} page - Current page (for pagination)
 * @returns {Object} - Message options with inline keyboard
 */
function createSearchResultsMessage(results, page = 0) {
  if (!results || results.length === 0) {
    return {
      text: '❌ No manga found. Please try a different search term.',
      reply_markup: null
    };
  }

  const itemsPerPage = 10;
  const startIndex = page * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, results.length);
  const pageResults = results.slice(startIndex, endIndex);

  let message = `🔍 Search Results (${startIndex + 1}-${endIndex} of ${results.length}):\n\n`;
  
  const keyboard = [];
  
  pageResults.forEach((manga, index) => {
    const globalIndex = startIndex + index + 1;
    
    message += `${globalIndex}. *${manga.title}*\n`;
    message += `🆔 ID: \`${manga.id}\`\n`;
    message += `👤 Author: ${manga.authors}\n`;
    message += `📅 Updated: ${manga.updatedAt}\n`;
    message += `👀 Views: ${manga.views}\n\n`;
    
    // Create shorter callback data to avoid 64-byte limit
    const shortId = manga.id.length > 20 ? manga.id.substring(0, 20) : manga.id;
    
    // Add button for each manga
    keyboard.push([{
      text: `${globalIndex}. ${manga.title}`,
      callback_data: `det_${shortId}`
    }]);
  });

  // Add pagination buttons if needed
  const totalPages = Math.ceil(results.length / itemsPerPage);
  if (totalPages > 1) {
    const paginationRow = [];
    
    if (page > 0) {
      paginationRow.push({
        text: '⬅️ Previous',
        callback_data: `search_page_${page - 1}`
      });
    }
    
    paginationRow.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: 'page_info'
    });
    
    if (page < totalPages - 1) {
      paginationRow.push({
        text: 'Next ➡️',
        callback_data: `search_page_${page + 1}`
      });
    }
    
    keyboard.push(paginationRow);
  }

  return {
    text: message,
    reply_markup: {
      inline_keyboard: keyboard
    },
    parse_mode: 'Markdown'
  };
}

module.exports = {
  searchManga,
  createSearchResultsMessage
};
