const axios = require('axios');

/**
 * Fetch all available genres from the API
 * @returns {Promise<Object>} - Genres object with display name as key and slug as value
 */
async function fetchGenres() {
  try {
    const response = await axios.get('https://api.samirb.com.np/manga/genre');
    return response.data;
  } catch (error) {
    console.error('Error fetching genres:', error.message);
    return null;
  }
}

/**
 * Fetch manga list by genre from the API
 * @param {string} genre - Genre slug (e.g., 'action', 'comedy')
 * @param {number} page - Page number (default: 1)
 * @returns {Promise<Object>} - API response with manga list
 */
async function fetchMangaByGenre(genre, page = 1) {
  try {
    const response = await axios.get(`https://api.samirb.com.np/manga/genre/${genre}?page=${page}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching manga by genre:', error.message);
    return null;
  }
}

/**
 * Create genre selection message with paginated buttons
 * @param {Object} genres - Genres object from API
 * @param {number} page - Current page (default: 0)
 * @returns {Object} - Message options with inline keyboard
 */
function createGenreSelectionMessage(genres, page = 0) {
  if (!genres || Object.keys(genres).length === 0) {
    return {
      text: '❌ No genres found.',
      reply_markup: null
    };
  }

  const genreEntries = Object.entries(genres);
  const itemsPerPage = 20;
  const startIndex = page * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, genreEntries.length);
  const pageGenres = genreEntries.slice(startIndex, endIndex);

  let message = `🎭 *Manga Genres*\n\n`;
  message += `📄 Page ${page + 1} of ${Math.ceil(genreEntries.length / itemsPerPage)} (${genreEntries.length} total genres)\n\n`;
  message += `Select a genre to browse manga:`;

  // Create keyboard with 2 buttons per row
  const keyboard = [];
  for (let i = 0; i < pageGenres.length; i += 2) {
    const row = [];
    
    // First button in row
    const [displayName1, slug1] = pageGenres[i];
    row.push({
      text: displayName1,
      callback_data: `genre_${slug1}`
    });
    
    // Second button in row (if exists)
    if (i + 1 < pageGenres.length) {
      const [displayName2, slug2] = pageGenres[i + 1];
      row.push({
        text: displayName2,
        callback_data: `genre_${slug2}`
      });
    }
    
    keyboard.push(row);
  }

  // Add pagination buttons if needed
  const totalPages = Math.ceil(genreEntries.length / itemsPerPage);
  if (totalPages > 1) {
    const paginationRow = [];
    
    if (page > 0) {
      paginationRow.push({
        text: '⬅️ Previous',
        callback_data: `genre_page_${page - 1}`
      });
    }
    
    paginationRow.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: 'page_info'
    });
    
    if (page < totalPages - 1) {
      paginationRow.push({
        text: 'Next ➡️',
        callback_data: `genre_page_${page + 1}`
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

/**
 * Create manga list message for a specific genre with pagination
 * @param {Object} data - API response data
 * @param {string} genre - Genre slug
 * @param {string} genreDisplayName - Genre display name
 * @param {number} currentPage - Current page number
 * @returns {Object} - Message options with inline keyboard
 */
function createGenreMangaListMessage(data, genre, genreDisplayName, currentPage) {
  if (!data || !data.mangas || data.mangas.length === 0) {
    return {
      text: `❌ No manga found in ${genreDisplayName} genre.`,
      reply_markup: {
        inline_keyboard: [[{
          text: '🔙 Back to Genres',
          callback_data: 'genre_back'
        }]]
      }
    };
  }

  let message = `🎭 *${genreDisplayName} Manga*\n`;
  message += `📄 Page ${data.currentPage} of ${data.totalPages} (${data.totalstories} total)\n\n`;

  const keyboard = [];

  data.mangas.forEach((manga, index) => {
    const globalIndex = ((data.currentPage - 1) * 24) + index + 1;
    
    message += `${globalIndex}. *${manga.title}*\n`;
    message += `🆔 ID: \`${manga.id}\`\n`;
    message += `📖 Chapters: ${manga.chapter}\n`;
    message += `👀 Views: ${manga.views.toLocaleString()}\n`;
    message += `📖 Read Online: [DuckDex](https://duckdx.samirb.com.np/manga/${manga.id})\n\n`;
    
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
      callback_data: `genre_${genre}_${data.currentPage - 1}`
    });
  }
  
  paginationRow.push({
    text: `${data.currentPage}/${data.totalPages}`,
    callback_data: 'page_info'
  });
  
  if (data.currentPage < data.totalPages) {
    paginationRow.push({
      text: 'Next ➡️',
      callback_data: `genre_${genre}_${data.currentPage + 1}`
    });
  }
  
  keyboard.push(paginationRow);
  
  // Add back to genres button
  keyboard.push([{
    text: '🔙 Back to Genres',
    callback_data: 'genre_back'
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
 * Get genre display name from slug
 * @param {Object} genres - Genres object from API
 * @param {string} genreSlug - Genre slug to find
 * @returns {string} - Display name or slug if not found
 */
function getGenreDisplayName(genres, genreSlug) {
  if (!genres) return genreSlug;
  
  const entry = Object.entries(genres).find(([_, slug]) => slug === genreSlug);
  return entry ? entry[0] : genreSlug;
}

/**
 * Validate genre slug
 * @param {Object} genres - Genres object from API
 * @param {string} genreSlug - Genre slug to validate
 * @returns {boolean} - Whether genre is valid
 */
function isValidGenre(genres, genreSlug) {
  if (!genres) return false;
  return Object.values(genres).includes(genreSlug);
}

module.exports = {
  fetchGenres,
  fetchMangaByGenre,
  createGenreSelectionMessage,
  createGenreMangaListMessage,
  getGenreDisplayName,
  isValidGenre
};
