const axios = require('axios');

/**
 * Fetch manga list by category from the API
 * @param {string} category - Category name (latest-manga, hot-manga, new-manga, completed-manga)
 * @param {number} page - Page number (default: 1)
 * @returns {Promise<Object>} - API response with manga list
 */
async function fetchMangaList(category, page = 1) {
  try {
    const response = await axios.get(`https://api.samirb.com.np/manga/manga-list/${category}?page=${page}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching manga list:', error.message);
    return null;
  }
}

/**
 * Create category selection message with buttons
 * @returns {Object} - Message options with inline keyboard
 */
function createCategorySelectionMessage() {
  const categories = [
    { name: 'Latest Manga', value: 'latest-manga', emoji: '🆕' },
    { name: 'Hot Manga', value: 'hot-manga', emoji: '🔥' },
    { name: 'New Manga', value: 'new-manga', emoji: '✨' },
    { name: 'Completed Manga', value: 'completed-manga', emoji: '✅' }
  ];

  const keyboard = categories.map(category => [{
    text: `${category.emoji} ${category.name}`,
    callback_data: `mangalist_${category.value}`
  }]);

  return {
    text: `📚 *Manga Categories*\n\nSelect a category to browse manga:`,
    reply_markup: {
      inline_keyboard: keyboard
    },
    parse_mode: 'Markdown'
  };
}

/**
 * Create manga list message with pagination
 * @param {Object} data - API response data
 * @param {string} category - Category name
 * @param {number} currentPage - Current page number
 * @returns {Object} - Message options with inline keyboard
 */
function createMangaListMessage(data, category, currentPage) {
  if (!data || !data.mangas || data.mangas.length === 0) {
    return {
      text: '❌ No manga found in this category.',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔙 Back to Categories',
          callback_data: 'mangalist_categories'
        }]]
      }
    };
  }

  const categoryNames = {
    'latest-manga': '🆕 Latest Manga',
    'hot-manga': '🔥 Hot Manga',
    'new-manga': '✨ New Manga',
    'completed-manga': '✅ Completed Manga'
  };

  let message = `${categoryNames[category] || '📚 Manga List'}\n`;
  message += `📄 Page ${data.currentPage} of ${data.totalPages} (${data.totalstories} total)\n\n`;

  const keyboard = [];

  data.mangas.forEach((manga, index) => {
    const globalIndex = ((data.currentPage - 1) * 24) + index + 1;
    
    message += `${globalIndex}. *${manga.title}*\n`;
    message += `🆔 ID: \`${manga.id}\`\n`;
    message += `📖 Chapters: ${manga.chapter}\n`;
    message += `👀 Views: ${manga.views.toLocaleString()}\n`;
    message += `📖 Read Online: [DuckDex](https://duckdex.samirb.com.np/manga/${manga.id})\n\n`;
    
    // Create shorter callback data to avoid 64-byte limit
    const shortId = manga.id.length > 20 ? manga.id.substring(0, 20) : manga.id;
    
    // Add button for each manga (2 buttons per row)
    if (index % 2 === 0) {
      keyboard.push([{
        text: `${globalIndex}. ${manga.title.length > 15 ? manga.title.substring(0, 15) + '...' : manga.title}`,
        callback_data: `det_${shortId}`
      }]);
    } else {
      keyboard[keyboard.length - 1].push({
        text: `${globalIndex}. ${manga.title.length > 15 ? manga.title.substring(0, 15) + '...' : manga.title}`,
        callback_data: `det_${shortId}`
      });
    }
  });

  // Add pagination buttons
  const paginationRow = [];
  
  if (data.currentPage > 1) {
    paginationRow.push({
      text: '⬅️ Previous',
      callback_data: `mangalist_${category}_${data.currentPage - 1}`
    });
  }
  
  paginationRow.push({
    text: `${data.currentPage}/${data.totalPages}`,
    callback_data: 'page_info'
  });
  
  if (data.currentPage < data.totalPages) {
    paginationRow.push({
      text: 'Next ➡️',
      callback_data: `mangalist_${category}_${data.currentPage + 1}`
    });
  }
  
  keyboard.push(paginationRow);
  
  // Add back to categories button
  keyboard.push([{
    text: '🔙 Back to Categories',
    callback_data: 'mangalist_categories'
  }]);

  return {
    text: message,
    reply_markup: {
      inline_keyboard: keyboard
    },
    parse_mode: 'Markdown'
  };
}

/**
 * Get category display name
 * @param {string} category - Category value
 * @returns {string} - Display name
 */
function getCategoryDisplayName(category) {
  const categoryNames = {
    'latest-manga': 'Latest Manga',
    'hot-manga': 'Hot Manga',
    'new-manga': 'New Manga',
    'completed-manga': 'Completed Manga'
  };
  return categoryNames[category] || category;
}

/**
 * Validate category name
 * @param {string} category - Category to validate
 * @returns {boolean} - Whether category is valid
 */
function isValidCategory(category) {
  const validCategories = ['latest-manga', 'hot-manga', 'new-manga', 'completed-manga'];
  return validCategories.includes(category);
}

module.exports = {
  fetchMangaList,
  createCategorySelectionMessage,
  createMangaListMessage,
  getCategoryDisplayName,
  isValidCategory
};
