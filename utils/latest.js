const axios = require('axios');
const { createPaginationButtons } = require('./pagination');

/**
 * Fetch latest manga list
 * @returns {Promise<Array>} array of latest manga objects
 */
async function fetchLatest() {
  try {
    const res = await axios.get('https://api.samirb.com.np/manga/latest');
    return Array.isArray(res.data) ? res.data : (res.data.data || []);
  } catch (err) {
    console.error('Error fetching latest list:', err.message);
    return [];
  }
}

/**
 * Create message for latest list with inline keyboard
 * Shows only first (latest) chapter for each manga
 * @param {Array} list
 * @param {number} page
 * @returns {{text:string, reply_markup:{inline_keyboard:Array}, parse_mode:string}}
 */
function mdEscape(text){return text.replace(/[_*`\[\]()~>#+=|{}.!-]/g,'\\$&');}

function createLatestMessage(list, page = 0) {
  if (!list || list.length === 0) {
    return { text: '❌ No latest chapters found right now.', reply_markup: null };
  }
  const itemsPerPage = 10;
  const startIndex = page * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, list.length);
  const pageItems = list.slice(startIndex, endIndex);

  let message = `🆕 Latest Releases (${startIndex + 1}-${endIndex} of ${list.length}):\n\n`;
  const keyboard = [];

  pageItems.forEach((item, idx) => {
    const latestChapter = item.latestChapters && item.latestChapters[0];
    if (!latestChapter) return;
    const globalIdx = startIndex + idx + 1;

    message += `${globalIdx}. *${item.title}*\n`;
    message += `🆔 ID: \`${item.id}\`\n`;
    message += `📄 Chapter: [${latestChapter.chapter}](https://duckydex.samirb.com.np/read/${item.id}/${latestChapter.chapter})\n`;
    message += `📖 Details: [DuckyDex](https://duckydex.samirb.com.np/manga/${item.id})\n`;
    message += `⏰ Release: ${latestChapter.releaseDate}\n\n`;

    keyboard.push([
      {
        text: `${globalIdx}. ${item.title} ch ${latestChapter.chapter}`,
        callback_data: `latpdf_${latestChapter.id.length > 50 ? latestChapter.id.substring(0,50) : latestChapter.id}`
      }
    ]);
  });

  // pagination buttons
  const totalPages = Math.ceil(list.length / itemsPerPage);
  if (totalPages > 1) {
    const row = [];
    if (page > 0) row.push({ text: '⬅️ Previous', callback_data: `latest_page_${page - 1}` });
    row.push({ text: `${page + 1}/${totalPages}`, callback_data: 'page_info' });
    if (page < totalPages - 1) row.push({ text: 'Next ➡️', callback_data: `latest_page_${page + 1}` });
    // add first / last buttons
    if(page>1) row.unshift({text:'⏮️ First',callback_data:`latest_page_0`});
    if(page<totalPages-2) row.push({text:'Last ⏭️',callback_data:`latest_page_${totalPages-1}`});
    keyboard.push(row);
  }

//   message += `\n\nFor Details: use /details <manga_id>`;

  return {
    text: message,
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  };
}

module.exports = { fetchLatest, createLatestMessage };
