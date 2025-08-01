const dotenv = require('dotenv');
const fs = require('fs');
const winston = require('winston');
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
dotenv.config({ path: envPath });
const TelegramBot = require('node-telegram-bot-api');
const { searchManga, createSearchResultsMessage } = require('./utils/search');
const { getMangaDetails, createMangaDetailsMessage } = require('./utils/details');
const { createChapterKeyboard, getChapterListMessage, storeMangaData, getStoredMangaData } = require('./utils/chapters');
const { storeSearchResults, getStoredSearchResults, storeLatestResults, getStoredLatestResults } = require('./utils/pagination');
const { createChapterListMessage } = require('./utils/chapterList');
const { fetchLatest, createLatestMessage } = require('./utils/latest');
const { createChapterPDF, cleanupTempFiles } = require('./utils/pdf');
const { fetchMangaList, createCategorySelectionMessage, createMangaListMessage, getCategoryDisplayName, isValidCategory } = require('./utils/mangalist');
const { fetchGenres, fetchMangaByGenre, createGenreSelectionMessage, createGenreMangaListMessage, getGenreDisplayName, isValidGenre } = require('./utils/genre');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'telegram-bot' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

logger.info('Bot is starting...');

// Helper function to check if message is from group
function isGroupChat(msg) {
  return msg.chat.type === 'group' || msg.chat.type === 'supergroup';
}

// Helper function to get bot username safely
async function getBotUsername() {
  try {
    const botInfo = await bot.getMe();
    return botInfo.username || 'duckdex_bot';
  } catch (error) {
    logger.error('Failed to get bot username', { error: error.message });
    return 'duckdex_bot';
  }
}

// Helper function to safely edit or send new message
async function safeEditOrSend(bot, chatId, messageId, messageOptions, isPhoto = false) {
  try {
    if (isPhoto && messageOptions.photo) {
      await bot.editMessageCaption(messageOptions.caption || messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
      logger.info('Edited photo caption', { chatId, messageId });
    } else {
      await bot.editMessageText(messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
      logger.info('Edited text message', { chatId, messageId });
    }
  } catch (error) {
    logger.warn('Message edit failed, sending new message', { chatId, messageId, error: error.message });
    if (isPhoto && messageOptions.photo) {
      await bot.sendPhoto(chatId, messageOptions.photo, {
        caption: messageOptions.caption || messageOptions.text,
        parse_mode: messageOptions.parse_mode,
        reply_markup: messageOptions.reply_markup
      });
      logger.info('Sent new photo message', { chatId });
    } else {
      await bot.sendMessage(chatId, messageOptions.text, {
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
      logger.info('Sent new text message', { chatId });
    }
  }
}

// Start command
bot.onText(/\/start(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  const isGroup = isGroupChat(msg);
  const welcomeMessage = `
🦆 Welcome to DuckDex Bot! 🦆

I can help you:
📚 Search for manga
📖 View manga details
📃 Browse chapters
🔍 Find your favorite series

${isGroup ? `In groups, mention me with @${botUsername} or reply to my messages\n` : ''}Type /help to see all available commands!
  `;
  
  await bot.sendMessage(chatId, welcomeMessage);
  logger.info('Sent start message', { chatId, chatType: msg.chat.type });
});

// Help command
bot.onText(/\/help(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  const isGroup = isGroupChat(msg);
  const helpMessage = `
🤖 Available Commands:

/start - Welcome message
/help - Show this help message
/search <query> - Search for manga
/details <manga_id> - Get detailed info about a manga
/chapters <manga_id> - List all chapters with details
/pdf <chapter_id> - Get a chapter as a PDF file
/latest - Show latest manga updates
/mangalist - Browse manga by categories
/genre - Browse manga by genres

Just send me a manga name to search for it!
  `;
  
  await bot.sendMessage(chatId, helpMessage);
  logger.info('Sent help message', { chatId, chatType: msg.chat.type });
});

// Search command and auto-search handler
async function handleSearch(msg, query) {
  const chatId = msg.chat.id;
  const isGroup = isGroupChat(msg);
  logger.info('Starting search', { chatId, query, chatType: msg.chat.type });
  
  const searchingMsg = await bot.sendMessage(chatId, `🔍 Searching for "${query}"...`);
  logger.info('Sent searching message', { chatId, messageId: searchingMsg.message_id });

  try {
    const results = await searchManga(query);
    storeSearchResults(chatId, results, query);
    logger.info('Stored search results', { chatId, resultCount: results.length });

    const messageOptions = createSearchResultsMessage(results);
    
    try {
      await bot.deleteMessage(chatId, searchingMsg.message_id);
      logger.info('Deleted searching message', { chatId, messageId: searchingMsg.message_id });
    } catch (e) {
      logger.warn('Could not delete searching message', { chatId, error: e.message });
    }
    
    await bot.sendMessage(chatId, messageOptions.text, {
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    });
    logger.info('Sent search results', { chatId, query });
  } catch (error) {
    logger.error('Search failed', { chatId, query, error: error.message });
    await safeEditOrSend(bot, chatId, searchingMsg.message_id, {
      text: '❌ Search failed. Please try again later.'
    });
  }
}

bot.onText(/\/search(@\w+)?\s+(.+)/, async (msg, match) => {
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;
  await handleSearch(msg, match[2]);
  logger.info('Processed /search command', { chatId: msg.chat.id, query: match[2] });
});

// Details command
bot.onText(/\/details(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mangaId = match[2];
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Fetching manga details', { chatId, mangaId });
  const loadingMsg = await bot.sendMessage(chatId, `📚 Loading details for manga ID: ${mangaId}...`);
  logger.info('Sent loading message for details', { chatId, messageId: loadingMsg.message_id });

  try {
    const details = await getMangaDetails(mangaId);
    
    if (details) {
      const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
      storeMangaData(shortMangaId, details);
      storeMangaData(mangaId, details);
      logger.info('Stored manga details', { chatId, mangaId, shortMangaId });
      
      const messageOptions = createMangaDetailsMessage(details);

      try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        logger.info('Deleted loading message', { chatId, messageId: loadingMsg.message_id });
      } catch (e) {
        logger.warn('Could not delete loading message', { chatId, error: e.message });
      }

      if (messageOptions.photo) {
        await bot.sendPhoto(chatId, messageOptions.photo, {
          caption: messageOptions.caption,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }).catch(error => {
          logger.warn('Failed to send photo, sending text only', { chatId, error: error.message });
          bot.sendMessage(chatId, messageOptions.text, {
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
        });
        logger.info('Sent manga details with photo', { chatId, mangaId });
      } else {
        await bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
        logger.info('Sent manga details', { chatId, mangaId });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.'
      });
      logger.warn('Failed to fetch manga details', { chatId, mangaId });
    }
  } catch (error) {
    logger.error('Details fetch failed', { chatId, mangaId, error: error.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch manga details. Please try again later.'
    });
  }
});

// Chapters command
bot.onText(/\/chapters(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mangaId = match[2];
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Fetching chapters', { chatId, mangaId });
  const loadingMsg = await bot.sendMessage(chatId, `📚 Loading chapters for manga ID: ${mangaId}...`);
  logger.info('Sent loading message for chapters', { chatId, messageId: loadingMsg.message_id });

  try {
    const details = await getMangaDetails(mangaId);
    
    if (details) {
      const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
      storeMangaData(shortMangaId, details);
      storeMangaData(mangaId, details);
      storeMangaData(`chlist_${shortMangaId}`, details);
      storeMangaData(`chlist_${mangaId}`, details);
      logger.info('Stored manga data for chapters', { chatId, mangaId, shortMangaId });
      
      const messageOptions = createChapterListMessage(details.chapters, details.title, mangaId, 0);
      
      try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        logger.info('Deleted loading message', { chatId, messageId: loadingMsg.message_id });
      } catch (e) {
        logger.warn('Could not delete loading message', { chatId, error: e.message });
      }
      
      if (details.imageUrl) {
        const imageUrl = `https://api.samirb.com.np/manga/img?url=${encodeURIComponent(details.imageUrl)}`;
        
        await bot.sendPhoto(chatId, imageUrl, {
          caption: messageOptions.text,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }).catch(error => {
          logger.warn('Failed to send photo, sending text only', { chatId, error: error.message });
          bot.sendMessage(chatId, messageOptions.text, {
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
        });
        logger.info('Sent chapters with photo', { chatId, mangaId });
      } else {
        await bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
        logger.info('Sent chapters', { chatId, mangaId });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.'
      });
      logger.warn('Failed to fetch manga details for chapters', { chatId, mangaId });
    }
  } catch (error) {
    logger.error('Chapters fetch failed', { chatId, mangaId, error: error.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch chapters. Please try again later.'
    });
  }
});

// Handle regular text messages (auto-search)
bot.on('message', async (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  
  if (!text || text.startsWith('/')) return;
  
  const botUsername = await getBotUsername();
  const isGroup = isGroupChat(msg);
  
  if (isGroup) {
    const isMentioned = text.includes(`@${botUsername}`);
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from.username === botUsername;
    
    if (!isMentioned && !isReplyToBot) {
      logger.debug('Ignoring group message without mention or reply', { chatId, text });
      return;
    }
    
    const query = text.replace(new RegExp(`@${botUsername}`, 'g'), '').trim();
    if (query) {
      await handleSearch(msg, query);
      logger.info('Processed group chat search', { chatId, query });
    }
  } else {
    await handleSearch(msg, text);
    logger.info('Processed private chat search', { chatId, query: text });
  }
});

// Callback query handler
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  await bot.answerCallbackQuery(callbackQuery.id);
  logger.info('Received callback query', { chatId, data });

  if (data.startsWith('det_')) {
    const mangaId = data.split('_')[1];
    logger.info('Processing details callback', { chatId, mangaId });
    
    try {
      const details = await getMangaDetails(mangaId);
      
      if (details) {
        const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
        storeMangaData(shortMangaId, details);
        storeMangaData(mangaId, details);
        logger.info('Stored manga details from callback', { chatId, mangaId, shortMangaId });
        
        const messageOptions = createMangaDetailsMessage(details);

        if (messageOptions.photo) {
          await bot.sendPhoto(chatId, messageOptions.photo, {
            caption: messageOptions.caption,
            parse_mode: messageOptions.parse_mode,
            reply_markup: messageOptions.reply_markup
          });
          logger.info('Sent details with photo', { chatId, mangaId });
        } else {
          await bot.sendMessage(chatId, messageOptions.text, { 
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
          logger.info('Sent details', { chatId, mangaId });
        }
      }
    } catch (error) {
      logger.error('Details callback failed', { chatId, mangaId, error: error.message });
      await bot.sendMessage(chatId, '❌ Failed to load manga details. Please try again.');
    }

  } else if (data.startsWith('latest_page_')) {
    const page = parseInt(data.split('_')[2], 10);
    const latestList = getStoredLatestResults(chatId);
    if (latestList) {
      const msgOptions = createLatestMessage(latestList, page);
      await safeEditOrSend(bot, chatId, msg.message_id, msgOptions);
      logger.info('Updated latest releases page', { chatId, page });
    }

  } else if (data.startsWith('latpdf_')) {
    const chapterId = data.substring(7);
    logger.info('Generating latest PDF', { chatId, chapterId });
    const status = await bot.sendMessage(chatId, `📚 Generating PDF for chapter ${chapterId}...`);
    
    try {
      cleanupTempFiles();
      const pdf = await createChapterPDF(chapterId);
      await bot.editMessageText('✅ PDF ready! Uploading...', {
        chat_id: chatId,
        message_id: status.message_id
      });
      await bot.sendDocument(chatId, pdf.path, { 
        caption: `📖 ${pdf.filename}\n📄 ${pdf.totalPages} pages • ${pdf.size} MB` 
      });
      await bot.deleteMessage(chatId, status.message_id);
      setTimeout(() => {
        try {
          if (fs.existsSync(pdf.path)) fs.unlinkSync(pdf.path);
          logger.info('Cleaned up PDF file', { chatId, filename: pdf.filename });
        } catch (e) {
          logger.error('PDF cleanup failed', { chatId, error: e.message });
        }
      }, 5000);
    } catch (err) {
      logger.error('Latest PDF generation failed', { chatId, chapterId, error: err.message });
      await safeEditOrSend(bot, chatId, status.message_id, {
        text: `❌ Failed to generate PDF\n${err.message}`
      });
    }

  } else if (data.startsWith('search_page_')) {
    const page = parseInt(data.split('_')[2], 10);
    const searchData = getStoredSearchResults(chatId);

    if (searchData) {
      const messageOptions = createSearchResultsMessage(searchData.results, page);
      await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
      logger.info('Updated search results page', { chatId, page });
    }

  } else if (data.startsWith('chp_')) {
    const [_, shortMangaId, pageStr] = data.split('_');
    const page = parseInt(pageStr, 10);
    logger.info('Processing chapter pagination', { chatId, shortMangaId, page });
    
    const details = getStoredMangaData(shortMangaId);
    
    if (details) {
      const chapterKeyboard = createChapterKeyboard(details.chapters, shortMangaId, page);
      const chaptersPerPage = 20;
      const startIndex = page * chaptersPerPage;
      const endIndex = Math.min(startIndex + chaptersPerPage, details.chapters.length);
      
      const caption = `
*${details.title}*

*Author:* ${details.author}
*Status:* ${details.status}
*Updated at:* ${details.updatedAt}
*Views:* ${details.views}
*Genres:* ${details.genres.join(', ')}
*Rating:* ${details.rating}
*Votes:* ${details.votes}
*Read Online:* [DuckyDex](https://duckydex.samirb.com.np/manga/${details.id})

*Summary:*
${details.summary}

📃 *Chapters (${startIndex + 1}-${endIndex} of ${details.chapters.length}):*
  `;

      try {
        await bot.editMessageReplyMarkup(chapterKeyboard, {
          chat_id: chatId,
          message_id: msg.message_id
        });
        logger.info('Updated chapter pagination buttons', { chatId, shortMangaId, page });
      } catch (error) {
        logger.warn('Failed to edit chapter reply markup', { chatId, error: error.message });
        if (msg.photo && msg.photo.length > 0) {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            caption: caption,
            reply_markup: chapterKeyboard,
            parse_mode: 'Markdown'
          }, true);
        } else {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: caption,
            reply_markup: chapterKeyboard,
            parse_mode: 'Markdown'
          });
        }
        logger.info('Sent new chapter message', { chatId, shortMangaId, page });
      }
    } else {
      logger.warn('No manga details found for chapter pagination', { chatId, shortMangaId });
      await bot.sendMessage(chatId, 'Sorry, manga details not found. Please try searching again.');
    }

  } else if (data.startsWith('chlist_')) {
    const parts = data.split('_');
    if (parts.length < 3) {
      await bot.sendMessage(chatId, '❌ Invalid pagination data.');
      logger.error('Invalid chapter list pagination data', { chatId, data });
      return;
    }
    
    const shortMangaId = parts[1];
    const page = parseInt(parts[2], 10);
    logger.info('Processing chapter list pagination', { chatId, shortMangaId, page });
    
    let details = getStoredMangaData(shortMangaId);
    
    if (!details) {
      const allKeys = ['chlist_', 'det_', ''].map(prefix => `${prefix}${shortMangaId}`);
      for (const key of allKeys) {
        details = getStoredMangaData(key);
        if (details) break;
      }
    }
    
    if (!details) {
      logger.warn('No manga data found for chapter list pagination', { chatId, shortMangaId });
      await bot.sendMessage(chatId, 'Session expired. Please use /chapters command again.');
      return;
    }
    
    const fullMangaId = shortMangaId;
    const messageOptions = createChapterListMessage(details.chapters, details.title, fullMangaId, page);
    
    if (msg.photo && msg.photo.length > 0) {
      await safeEditOrSend(bot, chatId, msg.message_id, {
        caption: messageOptions.text,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      }, true);
    } else {
      await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
    }
    logger.info('Updated chapter list pagination', { chatId, shortMangaId, page });

  } else if (data.startsWith('ch_')) {
    const [_, chapterIndex, shortMangaId] = data.split('_');
    const details = getStoredMangaData(shortMangaId);
    logger.info('Processing chapter PDF request', { chatId, shortMangaId, chapterIndex });

    if (details) {
      const chapter = details.chapters[parseInt(chapterIndex, 10)];
      const chapterId = chapter.id;

      const statusMsg = await bot.sendMessage(chatId, 
        `📚 Generating PDF for *${details.title}* - Chapter *${chapter.chapter}*...`, 
        { parse_mode: 'Markdown' }
      );
      logger.info('Sent PDF generation status', { chatId, chapterId });

      try {
        cleanupTempFiles();
        const pdfInfo = await createChapterPDF(chapterId, details.title, chapter.chapter);

        await bot.editMessageText(
          `✅ PDF ready! Uploading...`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );

        await bot.sendDocument(chatId, pdfInfo.path, {
          caption: `📖 ${pdfInfo.filename}\n📄 ${pdfInfo.totalPages} pages • ${pdfInfo.size} MB\n\nRead Online: https://duckydex.samirb.com.np/read/${chapterId}`
        });
        logger.info('Sent PDF document', { chatId, chapterId, filename: pdfInfo.filename });

        await bot.deleteMessage(chatId, statusMsg.message_id);
        logger.info('Deleted PDF status message', { chatId, messageId: statusMsg.message_id });

        setTimeout(() => {
          try {
            if (fs.existsSync(pdfInfo.path)) fs.unlinkSync(pdfInfo.path);
            logger.info('Cleaned up PDF file', { chatId, filename: pdfInfo.filename });
          } catch (e) {
            logger.error('PDF cleanup failed', { chatId, error: e.message });
          }
        }, 5000);
      } catch (err) {
        logger.error('PDF generation failed', { chatId, chapterId, error: err.message });
        await safeEditOrSend(bot, chatId, statusMsg.message_id, {
          text: `❌ Failed to generate PDF for chapter *${chapter.chapter}*\nError: ${err.message}`,
          parse_mode: 'Markdown'
        });
      }
    }
  } else if (data.startsWith('mangalist_')) {
    const parts = data.split('_');
    
    if (data === 'mangalist_categories') {
      // Back to categories button
      logger.info('Showing manga categories', { chatId });
      const messageOptions = createCategorySelectionMessage();
      await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
      logger.info('Updated to category selection', { chatId });
      
    } else if (parts.length >= 2) {
      const category = parts[1];
      const page = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
      
      if (isValidCategory(category)) {
        logger.info('Fetching manga list for category', { chatId, category, page });
        
        // Show loading state
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: `📚 Loading ${getCategoryDisplayName(category)}... (Page ${page})`
        });
        
        try {
          const data = await fetchMangaList(category, page);
          if (data) {
            const messageOptions = createMangaListMessage(data, category, page);
            await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
            logger.info('Updated manga list', { chatId, category, page });
          } else {
            await safeEditOrSend(bot, chatId, msg.message_id, {
              text: '❌ Failed to fetch manga list. Please try again later.',
              reply_markup: {
                inline_keyboard: [[{
                  text: '🔙 Back to Categories',
                  callback_data: 'mangalist_categories'
                }]]
              }
            });
          }
        } catch (error) {
          logger.error('Manga list fetch failed', { chatId, category, page, error: error.message });
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: '❌ Failed to fetch manga list. Please try again later.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔙 Back to Categories',
                callback_data: 'mangalist_categories'
              }]]
            }
          });
        }
      } else {
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Invalid category selected.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔙 Back to Categories',
              callback_data: 'mangalist_categories'
            }]]
          }
        });
      }
    }
  } else if (data.startsWith('genre_')) {
    const parts = data.split('_');
    
    if (data === 'genre_back') {
      // Back to genres button
      logger.info('Showing genres list', { chatId });
      
      try {
        const genres = await fetchGenres();
        
        if (genres) {
          const messageOptions = createGenreSelectionMessage(genres, 0);
          await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
          logger.info('Updated to genre selection', { chatId });
        } else {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: '❌ Failed to fetch genres. Please try again later.'
          });
        }
      } catch (error) {
        logger.error('Genres fetch failed', { chatId, error: error.message });
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Failed to fetch genres. Please try again later.'
        });
      }
      
    } else if (data.startsWith('genre_page_')) {
      // Genre pagination
      const page = parseInt(parts[2], 10);
      logger.info('Showing genres page', { chatId, page });
      
      try {
        const genres = await fetchGenres();
        
        if (genres) {
          const messageOptions = createGenreSelectionMessage(genres, page);
          await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
          logger.info('Updated genre selection page', { chatId, page });
        } else {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: '❌ Failed to fetch genres. Please try again later.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 Try Again',
                callback_data: 'genre_back'
              }]]
            }
          });
        }
      } catch (error) {
        logger.error('Genres fetch failed', { chatId, page, error: error.message });
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Failed to fetch genres. Please try again later.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔄 Try Again',
              callback_data: 'genre_back'
            }]]
          }
        });
      }
      
    } else if (parts.length >= 2) {
      // Genre selection or manga pagination
      const genreSlug = parts[1];
      const page = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
      
      logger.info('Fetching manga for genre', { chatId, genreSlug, page });
      
      // Show loading state
      await safeEditOrSend(bot, chatId, msg.message_id, {
        text: `🎭 Loading ${genreSlug} manga... (Page ${page})`
      });
      
      try {
        // Fetch genres to get display name
        const genres = await fetchGenres();
        
        if (!genres || !isValidGenre(genres, genreSlug)) {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: `❌ Invalid genre: ${genreSlug}`,
            reply_markup: {
              inline_keyboard: [[{
                text: '🔙 Back to Genres',
                callback_data: 'genre_back'
              }]]
            }
          });
          return;
        }
        
        const genreDisplayName = getGenreDisplayName(genres, genreSlug);
        const data = await fetchMangaByGenre(genreSlug, page);
        
        if (data) {
          const messageOptions = createGenreMangaListMessage(data, genreSlug, genreDisplayName, page);
          await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
          logger.info('Updated genre manga list', { chatId, genreSlug, page });
        } else {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: '❌ Failed to fetch manga list. Please try again later.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔙 Back to Genres',
                callback_data: 'genre_back'
              }]]
            }
          });
        }
      } catch (error) {
        logger.error('Genre manga fetch failed', { chatId, genreSlug, page, error: error.message });
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Failed to fetch manga list. Please try again later.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔙 Back to Genres',
              callback_data: 'genre_back'
            }]]
          }
        });
      }
    }
  } else if (data === 'page_info') {
    logger.debug('Ignored page_info callback', { chatId });
  }
});

// PDF command
bot.onText(/\/pdf(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const chapterId = match[2].trim();
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Processing PDF command', { chatId, chapterId });
  const statusMessage = await bot.sendMessage(chatId, `📚 Generating PDF for chapter: ${chapterId}...`);
  logger.info('Sent PDF generation status', { chatId, messageId: statusMessage.message_id });

  try {
    cleanupTempFiles();
    const result = await createChapterPDF(chapterId);
    
    await bot.editMessageText(
      `✅ PDF generated successfully!
📄 ${result.totalPages} pages
📁 Size: ${result.size} MB

Uploading...`,
      {
        chat_id: chatId,
        message_id: statusMessage.message_id
      }
    );

    await bot.sendDocument(chatId, result.path, {
      caption: `📖 ${result.filename}\n
📄 ${result.totalPages} pages • ${result.size} MB\n\nRead Online: https://duckydex.samirb.com.np/read/${result.filename}`
    });
    logger.info('Sent PDF document', { chatId, filename: result.filename });

    await bot.deleteMessage(chatId, statusMessage.message_id);
    logger.info('Deleted PDF status message', { chatId, messageId: statusMessage.message_id });

    setTimeout(() => {
      try {
        if (fs.existsSync(result.path)) {
          fs.unlinkSync(result.path);
          logger.info('Cleaned up PDF file', { chatId, filename: result.filename });
        }
      } catch (err) {
        logger.error('PDF cleanup failed', { chatId, error: err.message });
      }
    }, 5000);

  } catch (error) {
    logger.error('PDF generation failed', { chatId, chapterId, error: error.message });
    await safeEditOrSend(bot, chatId, statusMessage.message_id, {
      text: `❌ Failed to generate PDF for chapter: ${chapterId}\n\nError: ${error.message}\n\nPlease check the chapter ID and try again.`
    });
  }
});

// Latest command
bot.onText(/\/latest(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && msg.text !== '/latest' && !msg.text.startsWith(`/latest@${botUsername}`)) return;

  logger.info('Fetching latest releases', { chatId });
  const loadingMsg = await bot.sendMessage(chatId, '🆕 Fetching latest releases...');
  logger.info('Sent loading message for latest', { chatId, messageId: loadingMsg.message_id });

  try {
    const latestList = await fetchLatest();
    storeLatestResults(chatId, latestList);
    logger.info('Stored latest results', { chatId, resultCount: latestList.length });

    const messageOptions = createLatestMessage(latestList, 0);
    
    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      logger.info('Deleted loading message', { chatId, messageId: loadingMsg.message_id });
    } catch (e) {
      logger.warn('Could not delete loading message', { chatId, error: e.message });
    }
    
    await bot.sendMessage(chatId, messageOptions.text, {
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    });
    logger.info('Sent latest releases', { chatId });
  } catch (err) {
    logger.error('Latest releases fetch failed', { chatId, error: err.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch latest releases. Please try again later.'
    });
  }
});

// Mangalist command
bot.onText(/\/mangalist(@\w+)?(\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const category = match[3];

  if (category) {
    // Direct category access: /mangalist <category>
    if (!isValidCategory(category)) {
      await bot.sendMessage(chatId, `❌ Invalid category. Valid categories are:\n• latest-manga\n• hot-manga\n• new-manga\n• completed-manga`);
      return;
    }

    logger.info('Fetching manga list for category', { chatId, category });
    const loadingMsg = await bot.sendMessage(chatId, `📚 Loading ${getCategoryDisplayName(category)}...`);
    
    try {
      const data = await fetchMangaList(category, 1);
      if (data) {
        const messageOptions = createMangaListMessage(data, category, 1);
        
        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {
          logger.warn('Could not delete loading message', { chatId, error: e.message });
        }
        
        await bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
        logger.info('Sent manga list', { chatId, category });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch manga list. Please try again later.'
        });
      }
    } catch (error) {
      logger.error('Manga list fetch failed', { chatId, category, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch manga list. Please try again later.'
      });
    }
  } else {
    // Show category selection
    logger.info('Showing manga categories', { chatId });
    const messageOptions = createCategorySelectionMessage();
    await bot.sendMessage(chatId, messageOptions.text, {
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    });
    logger.info('Sent category selection', { chatId });
  }
});

// Genre command
bot.onText(/\/genre(@\w+)?(\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const genreSlug = match[3];

  if (genreSlug) {
    // Direct genre access: /genre <genre>
    logger.info('Fetching manga for genre', { chatId, genreSlug });
    const loadingMsg = await bot.sendMessage(chatId, `🎭 Loading ${genreSlug} manga...`);
    
    try {
      // First, fetch genres to validate and get display name
      const genres = await fetchGenres();
      
      if (!genres || !isValidGenre(genres, genreSlug)) {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: `❌ Invalid genre: ${genreSlug}\n\nUse /genre to see all available genres.`
        });
        return;
      }
      
      const genreDisplayName = getGenreDisplayName(genres, genreSlug);
      const data = await fetchMangaByGenre(genreSlug, 1);
      
      if (data) {
        const messageOptions = createGenreMangaListMessage(data, genreSlug, genreDisplayName, 1);
        
        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {
          logger.warn('Could not delete loading message', { chatId, error: e.message });
        }
        
        await bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
        logger.info('Sent genre manga list', { chatId, genreSlug });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch manga list. Please try again later.'
        });
      }
    } catch (error) {
      logger.error('Genre manga fetch failed', { chatId, genreSlug, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch manga list. Please try again later.'
      });
    }
  } else {
    // Show genre selection
    logger.info('Fetching genres list', { chatId });
    const loadingMsg = await bot.sendMessage(chatId, '🎭 Loading genres...');
    
    try {
      const genres = await fetchGenres();
      
      if (genres) {
        const messageOptions = createGenreSelectionMessage(genres, 0);
        
        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {
          logger.warn('Could not delete loading message', { chatId, error: e.message });
        }
        
        await bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
        logger.info('Sent genre selection', { chatId });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch genres. Please try again later.'
        });
      }
    } catch (error) {
      logger.error('Genres fetch failed', { chatId, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch genres. Please try again later.'
      });
    }
  }
});

// Error handling
bot.on('polling_error', (error) => {
  logger.error('Polling error', { error: error.message });
});

logger.info('Bot is running! Send /start to begin.');