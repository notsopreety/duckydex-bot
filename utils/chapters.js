// Store manga data temporarily for callback handling
const mangaDataCache = new Map();

/**
 * Store manga data for callback handling
 * @param {string} mangaId - Manga ID
 * @param {Object} mangaData - Manga data including chapters
 */
function storeMangaData(mangaId, mangaData) {
  mangaDataCache.set(mangaId, {
    ...mangaData,
    timestamp: Date.now()
  });
  
  // Clean up old data (older than 2 hours)
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [key, value] of mangaDataCache.entries()) {
    if (value.timestamp < twoHoursAgo) {
      mangaDataCache.delete(key);
    }
  }
}

/**
 * Get stored manga data
 * @param {string} mangaId - Manga ID
 * @returns {Object|null} - Stored manga data or null
 */
function getStoredMangaData(mangaId) {
  return mangaDataCache.get(mangaId) || null;
}

/**
 * Create chapter navigation keyboard
 * @param {Array} chapters - Array of chapters
 * @param {string} mangaId - Manga ID
 * @param {number} page - Current page
 * @returns {Object} - Inline keyboard markup
 */
function createChapterKeyboard(chapters, mangaId, page = 0) {
  if (!chapters || chapters.length === 0) {
    return {
      inline_keyboard: []
    };
  }

  const chaptersPerPage = 20;
  const totalPages = Math.ceil(chapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, chapters.length);
  const pageChapters = chapters.slice(startIndex, endIndex);

  const keyboard = [];
  
  // Create a short hash for mangaId to avoid callback data length issues
  const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
  
  // Create rows of chapter buttons (4 per row)
  for (let i = 0; i < pageChapters.length; i += 4) {
    const row = [];
    for (let j = i; j < i + 4 && j < pageChapters.length; j++) {
      const chapterIndex = startIndex + j;
      const chapter = pageChapters[j];
      row.push({
        text: `Ch. ${chapter.chapter}`,
        callback_data: `ch_${chapterIndex}_${shortMangaId}`
      });
    }
    keyboard.push(row);
  }

  // Add pagination controls if needed
  if (totalPages > 1) {
    const paginationRow = [];
    
    if (page > 0) {
      paginationRow.push({
        text: '⬅️ Previous',
        callback_data: `chp_${shortMangaId}_${page - 1}`
      });
    }
    
    paginationRow.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: 'page_info'
    });
    
    if (page < totalPages - 1) {
      paginationRow.push({
        text: 'Next ➡️',
        callback_data: `chp_${shortMangaId}_${page + 1}`
      });
    }
    
    keyboard.push(paginationRow);
  }

  // Remove back to details button as requested

  return {
    inline_keyboard: keyboard
  };
}

/**
 * Get chapter information message
 * @param {Array} chapters - Array of chapters
 * @param {string} mangaTitle - Manga title
 * @param {number} page - Current page
 * @returns {string} - Chapter list message
 */
function getChapterListMessage(chapters, mangaTitle, page = 0) {
  const chaptersPerPage = 20;
  const totalPages = Math.ceil(chapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, chapters.length);
  
  return `
📚 *${mangaTitle}*

📃 Chapters (${startIndex + 1}-${endIndex} of ${chapters.length}):

Select a chapter to read:
  `;
}

module.exports = {
  createChapterKeyboard,
  getChapterListMessage,
  storeMangaData,
  getStoredMangaData
};
