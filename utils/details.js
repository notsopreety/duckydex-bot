const axios = require('axios');
const { createChapterKeyboard } = require('./chapters');

/**
 * Get manga details from the API
 * @param {string} mangaId - The ID of the manga
 * @returns {Promise<Object>} - Manga details
 */
async function getMangaDetails(mangaId) {
  try {
    const response = await axios.get(`https://api.samirb.com.np/manga/details/${mangaId}`);
    return response.data;
  } catch (error) {
    console.error('Error getting manga details:', error.message);
    return null;
  }
}

/**
 * Create the manga details message
 * @param {Object} details - Manga details
 * @returns {Object} - Message options with photo, caption, and inline keyboard
 */
function createMangaDetailsMessage(details) {
  if (!details) {
    return {
      text: '❌ Error fetching manga details. Please try again later.',
      reply_markup: null
    };
  }

  // Calculate chapter pagination info for first page
  const chaptersPerPage = 20;
  const totalChapters = details.chapters.length;
  const endIndex = Math.min(chaptersPerPage, totalChapters);
  
  // Telegram captions max length 1024 chars. If summary pushes it over, truncate summary.
  const baseCaptionTop = `*${details.title}*\n\n` +
    `*Author:* ${details.author}\n` +
    `*Status:* ${details.status}\n` +
    `*Updated at:* ${details.updatedAt}\n` +
    `*Views:* ${details.views}\n` +
    `*Genres:* ${details.genres.join(', ')}\n` +
    `*Rating:* ${details.rating}\n` +
    `*Votes:* ${details.votes}\n\n` +
    `*Read Online:* [DuckyDex](https://duckydex.samirb.com.np/manga/${details.id})\n\n` +
    `*Summary:*\n`;
  let summary = details.summary || '';
  const baseBottom = `\n\n📃 *Chapters (1-${endIndex} of ${totalChapters}):*`;

  // Ensure total length under 1024
  const limit = 1024;
  let caption = baseCaptionTop + summary + baseBottom;
  if (caption.length > limit) {
    const allowedSummaryLen = limit - (baseCaptionTop.length + baseBottom.length) - 3; // 3 for ellipsis
    summary = summary.substring(0, Math.max(0, allowedSummaryLen)) + '...';
    caption = baseCaptionTop + summary + baseBottom;
  }

  const imageUrl = `https://api.samirb.com.np/manga/img?url=${encodeURIComponent(details.imageUrl)}`;

  const chapterKeyboard = createChapterKeyboard(details.chapters, details.id, 0);

  return {
    photo: imageUrl,
    caption: caption,
    parse_mode: 'Markdown',
    reply_markup: chapterKeyboard
  };
}

module.exports = {
  getMangaDetails,
  createMangaDetailsMessage
};
