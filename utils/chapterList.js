/**
 * Create chapter list message with detailed information
 * @param {Array} chapters - Array of chapters
 * @param {string} mangaTitle - Manga title
 * @param {string} mangaId - Manga ID for pagination callbacks
 * @param {number} page - Current page
 * @returns {Object} - Message options with detailed chapter list
 */
function createChapterListMessage(chapters, mangaTitle, mangaId, page = 0) {
  if (!chapters || chapters.length === 0) {
    return {
      text: '❌ No chapters found for this manga.',
      reply_markup: null
    };
  }

  const chaptersPerPage = 10;
  const totalPages = Math.ceil(chapters.length / chaptersPerPage);
  const startIndex = page * chaptersPerPage;
  const endIndex = Math.min(startIndex + chaptersPerPage, chapters.length);
  const pageChapters = chapters.slice(startIndex, endIndex);

  let message = `📚 *${mangaTitle}*\n\n`;
  message += `Read Online: [DuckyDex](https://duckydex.samirb.com.np/manga/${mangaId})\n\n`;
  message += `📃 *Chapter List (${startIndex + 1}-${endIndex} of ${chapters.length}):*\n\n`;

  pageChapters.forEach((chapter, index) => {
    const globalIndex = startIndex + index + 1;
    message += `*${globalIndex}. Chapter ${chapter.chapter}*\n`;
    message += `🆔 ID: \`${chapter.id}\`\n`;
    message += `👀 Views: ${chapter.views}\n`;
    message += `🔗 Link: 🦆 [DuckyDex](https://duckydex.samirb.com.np/read/${chapter.id})\n`;
    message += `📅 Uploaded: ${chapter.uploadedAt}\n\n`;
  });

  const shortMangaId = mangaId.length > 20 ? mangaId.substring(0, 20) : mangaId;
  const keyboard = createChapterListPagination(chapters.length, page, shortMangaId);

  return {
    text: message,
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  };
}

/**
 * Create pagination keyboard for chapter list
 * @param {number} totalChapters - Total number of chapters
 * @param {number} currentPage - Current page
 * @param {string} shortMangaId - Shortened manga ID for callbacks
 * @returns {Object} - Inline keyboard markup
 */
function createChapterListPagination(totalChapters, currentPage, shortMangaId) {
  const chaptersPerPage = 10;
  const totalPages = Math.ceil(totalChapters / chaptersPerPage);
  
  if (totalPages <= 1) {
    return { inline_keyboard: [] };
  }

  const keyboard = [];
  const navRow = [];
  
  if (currentPage > 0) {
    navRow.push({ text: '⏮️ First', callback_data: `chlist_${shortMangaId}_0` });
  }
  
  if (currentPage > 0) {
    navRow.push({ text: '⬅️ Previous', callback_data: `chlist_${shortMangaId}_${currentPage - 1}` });
  }
  
  navRow.push({ text: `${currentPage + 1}/${totalPages}`, callback_data: 'page_info' });
  
  if (currentPage < totalPages - 1) {
    navRow.push({ text: 'Next ➡️', callback_data: `chlist_${shortMangaId}_${currentPage + 1}` });
  }
  
  if (currentPage < totalPages - 1) {
    navRow.push({ text: 'Last ⏭️', callback_data: `chlist_${shortMangaId}_${totalPages - 1}` });
  }
  
  keyboard.push(navRow);
  
  return {
    inline_keyboard: keyboard
  };
}

module.exports = {
  createChapterListMessage,
  createChapterListPagination
};
