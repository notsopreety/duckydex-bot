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
const { 
  sendMessageWithAutoDeletion, 
  sendPhotoWithAutoDeletion, 
  safeEditOrSend, 
  handleCallbackWithLoading, 
  DELETION_TIMEOUTS 
} = require('./utils/deletion');

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
if (!token) {
  logger.error('TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}
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

// start command
bot.onText(/\/start(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const userName = msg.from.first_name || 'there';
  const isGroup = isGroupChat(msg);
  
  const welcomeMessage = `
🦆✨ **Welcome to DuckDex Bot, ${userName}!** ✨🦆

🎯 **Your Ultimate Manga Companion**

🌟 **What I can do for you:**
📚 **Search** - Find any manga instantly
📖 **Details** - Get comprehensive manga info
📃 **Chapters** - Browse all available chapters
🔥 **Latest** - Stay updated with new releases
📊 **Categories** - Explore by manga types
🎨 **Genres** - Discover by your favorite genres
📄 **PDF Export** - Download chapters as PDF

${isGroup ? `🏢 **Group Usage:** Mention me with @${botUsername} or reply to my messages\n` : ''}💡 **Quick Start:** Just type a manga name or use /help for all commands!

🚀 **Ready to dive into the world of manga?**
  `;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔍 Search Manga', callback_data: 'quick_search' },
        { text: '🔥 Latest Updates', callback_data: 'latest_manga' }
      ],
      [
        { text: '📊 Browse Categories', callback_data: 'mangalist_categories' },
        { text: '🎨 Browse Genres', callback_data: 'genre_back' }
      ],
      [
        { text: '❓ Help & Commands', callback_data: 'show_help' }
      ]
    ]
  };
  
  await sendMessageWithAutoDeletion(bot, chatId, {
    text: welcomeMessage,
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  }, {}, DELETION_TIMEOUTS.USER_INTERACTION);
  
  logger.info('Sent start message', { chatId, chatType: msg.chat.type, userName });
});

// help command
bot.onText(/\/help(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const isGroup = isGroupChat(msg);
  
  const helpMessage = `
🤖✨ **DuckDex Bot - Command Guide** ✨🤖

🔍 **Search & Discovery:**
• \`/search <query>\` - Search for any manga
• \`/latest\` - Browse latest manga updates
• \`/mangalist [category]\` - Browse by categories
• \`/genre [genre]\` - Explore by genres

📖 **Manga Information:**
• \`/details <manga_id>\` - Get detailed manga info
• \`/chapters <manga_id>\` - List all chapters

📄 **Downloads:**
• \`/pdf <chapter_id>\` - Download chapter as PDF

🎆 **General:**
• \`/start\` - Welcome message with quick actions
• \`/help\` - Show this comprehensive guide

${isGroup ? `🏢 **Group Usage:**\nMention me with @${botUsername} or reply to my messages\n\n` : ''}💡 **Pro Tips:**
• Just type a manga name to search instantly!
• Use buttons for easier navigation
• Commands work in both private and group chats
• All results include interactive buttons

🚀 **Ready to explore manga? Try any command above!**
  `;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🔍 Quick Search', callback_data: 'quick_search' },
        { text: '🔥 Latest Manga', callback_data: 'latest_manga' }
      ],
      [
        { text: '📊 Categories', callback_data: 'mangalist_categories' },
        { text: '🎨 Genres', callback_data: 'genre_back' }
      ],
      [
        { text: '🏠 Back to Start', callback_data: 'back_to_start' }
      ]
    ]
  };
  
  await sendMessageWithAutoDeletion(bot, chatId, {
    text: helpMessage,
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  }, {}, DELETION_TIMEOUTS.USER_INTERACTION);
  
  logger.info('Sent help message', { chatId, chatType: msg.chat.type });
});

// latest command
bot.onText(/\/latest(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Fetching latest manga updates', { chatId });
  const loadingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    '🆕 Loading latest manga updates...', 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );

  try {
    const latestList = await fetchLatest();
    if (!latestList || latestList.length === 0) {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ No latest manga updates found. Please try again later.',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Retry', callback_data: 'refresh_latest' },
            { text: '🏠 Back to Start', callback_data: 'back_to_start' }
          ]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
      logger.warn('No latest manga updates found', { chatId });
      return;
    }

    storeLatestResults(chatId, latestList);
    logger.info('Stored latest manga results', { chatId, resultCount: latestList.length });

    const messageOptions = createLatestMessage(latestList, 0);

    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: messageOptions.text,
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);

    logger.info('Sent latest manga updates', { chatId });
  } catch (error) {
    logger.error('Failed to fetch latest manga updates', { chatId, error: error.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch latest manga updates. Please try again later.',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Retry', callback_data: 'refresh_latest' },
          { text: '🏠 Back to Start', callback_data: 'back_to_start' }
        ]]
      }
    }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
  }
});

// search command and auto-search handler
async function handleSearch(msg, query) {
  const chatId = msg.chat.id;
  logger.info('Starting search', { chatId, query, chatType: msg.chat.type });
  
  const searchingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `🔍 Searching for "${query}"...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );

  try {
    const results = await searchManga(query);
    storeSearchResults(chatId, results, query);
    logger.info('Stored search results', { chatId, resultCount: results.length });

    const messageOptions = createSearchResultsMessage(results);
    
    await safeEditOrSend(bot, chatId, searchingMsg.message_id, {
      text: messageOptions.text,
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
    
    logger.info('Sent search results', { chatId, query });
  } catch (error) {
    logger.error('Search failed', { chatId, query, error: error.message });
    await safeEditOrSend(bot, chatId, searchingMsg.message_id, {
      text: '❌ Search failed. Please try again later.',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔄 Try Again',
          callback_data: `search_retry_${encodeURIComponent(query)}`
        }]]
      }
    }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
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
  const loadingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `📚 Loading details for manga ID: ${mangaId}...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );

  try {
    const details = await getMangaDetails(mangaId);
    
    if (details) {
      const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
      storeMangaData(shortMangaId, details);
      storeMangaData(mangaId, details);
      logger.info('Stored manga details', { chatId, mangaId, shortMangaId });
      
      const messageOptions = createMangaDetailsMessage(details);

      if (messageOptions.photo) {
        await sendPhotoWithAutoDeletion(bot, chatId, messageOptions.photo, {
          caption: messageOptions.caption,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }, DELETION_TIMEOUTS.MANGA_DETAILS);
        logger.info('Sent manga details with photo', { chatId, mangaId });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.MANGA_DETAILS);
        logger.info('Sent manga details', { chatId, mangaId });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔄 Retry',
            callback_data: `det_${mangaId}`
          }]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
      logger.warn('Failed to fetch manga details', { chatId, mangaId });
    }
  } catch (error) {
    logger.error('Details fetch failed', { chatId, mangaId, error: error.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch manga details. Please try again later.',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔄 Retry',
          callback_data: `det_${mangaId}`
        }]]
      }
    }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
  }
});

// Chapters command
bot.onText(/\/chapters(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mangaId = match[2];
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Fetching chapters', { chatId, mangaId });
  const loadingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `📚 Loading chapters for manga ID: ${mangaId}...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );

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
      
      if (details.imageUrl) {
        const imageUrl = `https://api.samirb.com.np/manga/img?url=${encodeURIComponent(details.imageUrl)}`;
        
        await sendPhotoWithAutoDeletion(bot, chatId, imageUrl, {
          caption: messageOptions.text,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }, DELETION_TIMEOUTS.CHAPTER_LIST);
        logger.info('Sent chapters with photo', { chatId, mangaId });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.CHAPTER_LIST);
        logger.info('Sent chapters', { chatId, mangaId });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔄 Retry',
            callback_data: `det_${mangaId}`
          }]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
      logger.warn('Failed to fetch manga details for chapters', { chatId, mangaId });
    }
  } catch (error) {
    logger.error('Chapters fetch failed', { chatId, mangaId, error: error.message });
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch chapters. Please try again later.',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔄 Retry',
          callback_data: `chlist_${mangaId}_0`
        }]]
      }
    }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
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
  logger.info('Sent PDF generation status', { chatId, chapterId });

  try {
    cleanupTempFiles();
    const result = await createChapterPDF(chapterId);
    
    try {
      await bot.editMessageText(
        `✅ PDF generated successfully!\n📄 ${result.totalPages} pages\n📁 Size: ${result.size} MB\n\nUploading...`,
        {
          chat_id: chatId,
          message_id: statusMessage.message_id
        }
      );
    } catch (editError) {
      logger.warn('Could not edit status message, sending new one', { chatId, error: editError.message });
      await bot.sendMessage(chatId, `✅ PDF ready! Uploading...`);
    }

    await bot.sendDocument(chatId, result.path, {
      caption: `📖 ${result.filename}\n📄 ${result.totalPages} pages • ${result.size} MB\n\nRead Online: https://duckydx.samirb.com.np/read/${chapterId}`
    });
    logger.info('Sent PDF document', { chatId, filename: result.filename });

    try {
      await bot.deleteMessage(chatId, statusMessage.message_id);
      logger.info('Deleted PDF status message', { chatId, messageId: statusMessage.message_id });
    } catch (deleteError) {
      logger.warn('Could not delete status message', { chatId, error: deleteError.message });
    }

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
    try {
      await bot.editMessageText(
        `❌ Failed to generate PDF for chapter: ${chapterId}\n\nError: ${error.message}\n\nPlease check the chapter ID and try again.`,
        {
          chat_id: chatId,
          message_id: statusMessage.message_id,
          parse_mode: 'Markdown'
        }
      );
    } catch (editError) {
      logger.warn('Could not edit error message, sending new one', { chatId, error: editError.message });
      await bot.sendMessage(chatId, `❌ Failed to generate PDF\n\nError: ${error.message}`, { parse_mode: 'Markdown' });
    }
  }
});

// Mangalist command
bot.onText(/\/mangalist(@\w+)?(\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const category = match[3];

  if (category) {
    if (!isValidCategory(category)) {
      await sendMessageWithAutoDeletion(bot, chatId, {
        text: `❌ Invalid category. Valid categories are:\n• latest-manga\n• hot-manga\n• new-manga\n• completed-manga`,
        reply_markup: {
          inline_keyboard: [[{
            text: '📊 View All Categories',
            callback_data: 'mangalist_categories'
          }]]
        }
      }, {}, DELETION_TIMEOUTS.ERROR_MESSAGE);
      logger.warn('Invalid category provided', { chatId, category });
      return;
    }

    logger.info('Fetching manga list for category', { chatId, category });
    const loadingMsg = await sendMessageWithAutoDeletion(
      bot, 
      chatId, 
      `📚 Loading ${getCategoryDisplayName(category)}...`, 
      {}, 
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
    try {
      const data = await fetchMangaList(category, 1);
      if (data) {
        const messageOptions = createMangaListMessage(data, category, 1);
        
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
        logger.info('Sent manga list', { chatId, category });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch manga list. Please try again later.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔙 Back to Categories',
              callback_data: 'mangalist_categories'
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        logger.warn('Failed to fetch manga list', { chatId, category });
      }
    } catch (error) {
      logger.error('Manga list fetch failed', { chatId, category, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch manga list. Please try again later.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔙 Back to Categories',
            callback_data: 'mangalist_categories'
          }]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
    }
  } else {
    logger.info('Showing manga categories', { chatId });
    const messageOptions = createCategorySelectionMessage();
    await sendMessageWithAutoDeletion(bot, chatId, messageOptions, {}, DELETION_TIMEOUTS.USER_INTERACTION);
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
    logger.info('Fetching manga for genre', { chatId, genreSlug });
    const loadingMsg = await sendMessageWithAutoDeletion(
      bot, 
      chatId, 
      `🎭 Loading ${genreSlug} manga...`, 
      {}, 
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
    try {
      const genres = await fetchGenres();
      
      if (!genres || !isValidGenre(genres, genreSlug)) {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: `❌ Invalid genre: ${genreSlug}\n\nUse /genre to see all available genres.`,
          reply_markup: {
            inline_keyboard: [[{
              text: '🎨 View All Genres',
              callback_data: 'genre_back'
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        logger.warn('Invalid genre provided', { chatId, genreSlug });
        return;
      }
      
      const genreDisplayName = getGenreDisplayName(genres, genreSlug);
      const data = await fetchMangaByGenre(genreSlug, 1);
      
      if (data) {
        const messageOptions = createGenreMangaListMessage(data, genreSlug, genreDisplayName, 1);
        
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
        logger.info('Sent genre manga list', { chatId, genreSlug });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch manga list. Please try again later.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔙 Back to Genres',
              callback_data: 'genre_back'
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        logger.warn('Failed to fetch genre manga list', { chatId, genreSlug });
      }
    } catch (error) {
      logger.error('Genre manga fetch failed', { chatId, genreSlug, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch manga list. Please try again later.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔙 Back to Genres',
            callback_data: 'genre_back'
          }]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
    }
  } else {
    logger.info('Fetching genres list', { chatId });
    const loadingMsg = await sendMessageWithAutoDeletion(
      bot, 
      chatId, 
      '🎭 Loading genres...', 
      {}, 
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
    try {
      const genres = await fetchGenres();
      
      if (genres) {
        const messageOptions = createGenreSelectionMessage(genres, 0);
        
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Sent genre selection', { chatId });
      } else {
        await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
          text: '❌ Failed to fetch genres. Please try again later.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔄 Try Again',
              callback_data: 'genre_back'
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        logger.warn('Failed to fetch genres', { chatId });
      }
    } catch (error) {
      logger.error('Genres fetch failed', { chatId, error: error.message });
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Failed to fetch genres. Please try again later.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔄 Try Again',
            callback_data: 'genre_back'
          }]]
        }
      }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
    }
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

  try {
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch (error) {
    logger.warn('Failed to answer callback query', { chatId, data, error: error.message });
  }
  
  logger.info('Received callback query', { chatId, data });

  if (data.startsWith('det_')) {
    const mangaId = data.split('_')[1];
    logger.info('Processing details callback', { chatId, mangaId });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const details = await getMangaDetails(mangaId);
        if (details) {
          const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
          storeMangaData(shortMangaId, details);
          storeMangaData(mangaId, details);
          logger.info('Stored manga details from callback', { chatId, mangaId, shortMangaId });
          
          const messageOptions = createMangaDetailsMessage(details);
          if (messageOptions.photo) {
            await sendPhotoWithAutoDeletion(bot, chatId, messageOptions.photo, {
              caption: messageOptions.caption,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, DELETION_TIMEOUTS.MANGA_DETAILS);
          } else {
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: messageOptions.text,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, false, DELETION_TIMEOUTS.MANGA_DETAILS);
          }
          logger.info('Sent manga details', { chatId, mangaId });
        } else {
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Could not find manga details. Please check the manga ID and try again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 Retry',
                callback_data: data
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
          logger.warn('Failed to fetch manga details', { chatId, mangaId });
        }
      },
      `📚 Loading details for ${mangaId}...`,
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );

  } else if (data.startsWith('latest_page_')) {
    const page = parseInt(data.split('_')[2], 10);
    logger.info('Processing latest page callback', { chatId, page });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const latestList = getStoredLatestResults(chatId);
        if (latestList) {
          const messageOptions = createLatestMessage(latestList, page);
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: messageOptions.text,
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          }, false, DELETION_TIMEOUTS.USER_INTERACTION);
          logger.info('Updated latest releases page', { chatId, page });
        } else {
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Latest releases data not found. Please use /latest command again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🆕 Get Latest',
                callback_data: 'refresh_latest'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
          logger.warn('Latest releases data not found', { chatId });
        }
      },
      `🆕 Loading latest releases page ${page}...`,
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );

  } else if (data.startsWith('latpdf_')) {
    const chapterId = data.substring(7);
    logger.info('Generating latest PDF', { chatId, chapterId });
    
    const status = await bot.sendMessage(chatId, `📚 Generating PDF for chapter ${chapterId}...`);
    logger.info('Sent latest PDF generation status', { chatId, chapterId });
    
    try {
      cleanupTempFiles();
      const pdf = await createChapterPDF(chapterId);
      
      try {
        await bot.editMessageText('✅ PDF ready! Uploading...', {
          chat_id: chatId,
          message_id: status.message_id
        });
      } catch (editError) {
        logger.warn('Could not edit latest PDF status message', { chatId, error: editError.message });
        await bot.sendMessage(chatId, '✅ PDF ready! Uploading...');
      }

      await bot.sendDocument(chatId, pdf.path, { 
        caption: `📖 ${pdf.filename}\n📄 ${pdf.totalPages} pages • ${pdf.size} MB`
      });
      
      try {
        await bot.deleteMessage(chatId, status.message_id);
        logger.info('Deleted latest PDF status message', { chatId, messageId: status.message_id });
      } catch (deleteError) {
        logger.warn('Could not delete latest PDF status message', { chatId, error: deleteError.message });
      }
      
      logger.info('Sent PDF document', { chatId, filename: pdf.filename });
      
      setTimeout(() => {
        try {
          if (fs.existsSync(pdf.path)) {
            fs.unlinkSync(pdf.path);
            logger.info('Cleaned up PDF file', { chatId, filename: pdf.filename });
          }
        } catch (e) {
          logger.error('PDF cleanup failed', { chatId, error: e.message });
        }
      }, 5000);
    } catch (err) {
      logger.error('Latest PDF generation failed', { chatId, chapterId, error: err.message });
      try {
        await bot.editMessageText(
          `❌ Failed to generate PDF\n${err.message}`,
          {
            chat_id: chatId,
            message_id: status.message_id,
            parse_mode: 'Markdown'
          }
        );
      } catch (editError) {
        logger.warn('Could not edit latest PDF error message', { chatId, error: editError.message });
        await bot.sendMessage(chatId, `❌ Failed to generate PDF\n${err.message}`, { parse_mode: 'Markdown' });
      }
    }

  } else if (data.startsWith('search_page_')) {
    const page = parseInt(data.split('_')[2], 10);
    logger.info('Processing search page callback', { chatId, page });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const searchData = getStoredSearchResults(chatId);
        if (searchData) {
          const messageOptions = createSearchResultsMessage(searchData.results, page);
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: messageOptions.text,
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
          logger.info('Updated search results page', { chatId, page });
        } else {
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Search results not found. Please search again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔍 New Search',
                callback_data: 'quick_search'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
          logger.warn('Search results not found', { chatId });
        }
      },
      `🔍 Loading search results page ${page}...`,
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );

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
          }, true, DELETION_TIMEOUTS.CHAPTER_LIST);
        } else {
          await safeEditOrSend(bot, chatId, msg.message_id, {
            text: caption,
            reply_markup: chapterKeyboard,
            parse_mode: 'Markdown'
          }, false, DELETION_TIMEOUTS.CHAPTER_LIST);
        }
        logger.info('Sent new chapter message', { chatId, shortMangaId, page });
      }
    } else {
      logger.warn('No manga details found for chapter pagination', { chatId, shortMangaId });
      await sendMessageWithAutoDeletion(bot, chatId, {
        text: 'Sorry, manga details not found. Please try searching again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔍 New Search',
            callback_data: 'quick_search'
          }]]
        }
      }, {}, DELETION_TIMEOUTS.ERROR_MESSAGE);
    }

  } else if (data.startsWith('chlist_')) {
    const parts = data.split('_');
    if (parts.length < 3) {
      await sendMessageWithAutoDeletion(bot, chatId, {
        text: '❌ Invalid pagination data.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🏠 Back to Start',
            callback_data: 'back_to_start'
          }]]
        }
      }, {}, DELETION_TIMEOUTS.ERROR_MESSAGE);
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
      await sendMessageWithAutoDeletion(bot, chatId, {
        text: 'Session expired. Please use /chapters command again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔍 New Search',
            callback_data: 'quick_search'
          }]]
        }
      }, {}, DELETION_TIMEOUTS.ERROR_MESSAGE);
      return;
    }
    
    const fullMangaId = shortMangaId;
    const messageOptions = createChapterListMessage(details.chapters, details.title, fullMangaId, page);
    
    if (msg.photo && msg.photo.length > 0) {
      await safeEditOrSend(bot, chatId, msg.message_id, {
        caption: messageOptions.text,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      }, true, DELETION_TIMEOUTS.CHAPTER_LIST);
    } else {
      await safeEditOrSend(bot, chatId, msg.message_id, {
        text: messageOptions.text,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      }, false, DELETION_TIMEOUTS.CHAPTER_LIST);
    }
    logger.info('Updated chapter list pagination', { chatId, shortMangaId, page });

  } else if (data.startsWith('ch_')) {
    const [_, chapterIndex, shortMangaId] = data.split('_');
    const details = getStoredMangaData(shortMangaId);
    logger.info('Processing chapter PDF request', { chatId, shortMangaId, chapterIndex });

    if (details) {
      const chapter = details.chapters[parseInt(chapterIndex, 10)];
      const chapterId = chapter.id;

      const statusMsg = await bot.sendMessage(
        chatId, 
        `📚 Generating PDF for *${details.title}* - Chapter *${chapter.chapter}*...`, 
        { parse_mode: 'Markdown' }
      );
      logger.info('Sent chapter PDF generation status', { chatId, chapterId });

      try {
        cleanupTempFiles();
        const pdfInfo = await createChapterPDF(chapterId, details.title, chapter.chapter);

        try {
          await bot.editMessageText(
            `✅ PDF ready! Uploading...`,
            { chat_id: chatId, message_id: statusMsg.message_id }
          );
        } catch (editError) {
          logger.warn('Could not edit chapter PDF status message', { chatId, error: editError.message });
          await bot.sendMessage(chatId, '✅ PDF ready! Uploading...');
        }

        await bot.sendDocument(chatId, pdfInfo.path, {
          caption: `📖 ${pdfInfo.filename}\n📄 ${pdfInfo.totalPages} pages • ${pdfInfo.size} MB\n\nRead Online: https://duckydx.samirb.com.np/read/${chapterId}`
        });
        logger.info('Sent PDF document', { chatId, chapterId, filename: pdfInfo.filename });

        try {
          await bot.deleteMessage(chatId, statusMsg.message_id);
          logger.info('Deleted PDF status message', { chatId, messageId: statusMsg.message_id });
        } catch (deleteError) {
          logger.warn('Could not delete chapter PDF status message', { chatId, error: deleteError.message });
        }

        setTimeout(() => {
          try {
            if (fs.existsSync(pdfInfo.path)) {
              fs.unlinkSync(pdfInfo.path);
              logger.info('Cleaned up PDF file', { chatId, filename: pdfInfo.filename });
            }
          } catch (e) {
            logger.error('PDF cleanup failed', { chatId, error: e.message });
          }
        }, 5000);
      } catch (err) {
        logger.error('PDF generation failed', { chatId, chapterId, error: err.message });
        try {
          await bot.editMessageText(
            `❌ Failed to generate PDF for *${details.title}* - Chapter *${chapter.chapter}*\nError: ${err.message}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
        } catch (editError) {
          logger.warn('Could not edit chapter PDF error message', { chatId, error: editError.message });
          await bot.sendMessage(chatId, `❌ Failed to generate PDF\nError: ${err.message}`, { parse_mode: 'Markdown' });
        }
      }
    } else {
      logger.warn('No manga details found for PDF generation', { chatId, shortMangaId });
      await sendMessageWithAutoDeletion(bot, chatId, {
        text: 'Sorry, manga details not found. Please try searching again.',
        reply_markup: {
          inline_keyboard: [[{
            text: '🔍 New Search',
            callback_data: 'quick_search'
          }]]
        }
      }, {}, DELETION_TIMEOUTS.ERROR_MESSAGE);
    }
  } else if (data.startsWith('mangalist_')) {
    const parts = data.split('_');
    
    if (data === 'mangalist_categories') {
      logger.info('Showing manga categories', { chatId });
      
      await handleCallbackWithLoading(
        bot,
        callbackQuery,
        async (bot, callbackQuery) => {
          const messageOptions = createCategorySelectionMessage();
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: messageOptions.text,
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          }, false, DELETION_TIMEOUTS.USER_INTERACTION);
          logger.info('Updated to category selection', { chatId });
        },
        '📚 Loading categories...',
        DELETION_TIMEOUTS.LOADING_MESSAGE
      );
      
    } else if (parts.length >= 2) {
      const category = parts[1];
      const page = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
      
      if (isValidCategory(category)) {
        logger.info('Fetching manga list for category', { chatId, category, page });
        
        await handleCallbackWithLoading(
          bot,
          callbackQuery,
          async (bot, callbackQuery) => {
            const data = await fetchMangaList(category, page);
            if (data) {
              const messageOptions = createMangaListMessage(data, category, page);
              await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
                text: messageOptions.text,
                reply_markup: messageOptions.reply_markup,
                parse_mode: messageOptions.parse_mode
              }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
              logger.info('Updated manga list', { chatId, category, page });
            } else {
              await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
                text: '❌ Failed to fetch manga list. Please try again later.',
                reply_markup: {
                  inline_keyboard: [[{
                    text: '🔙 Back to Categories',
                    callback_data: 'mangalist_categories'
                  }]]
                }
              }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
              logger.warn('Failed to fetch manga list', { chatId, category });
            }
          },
          `📚 Loading ${getCategoryDisplayName(category)}... (Page ${page})`,
          DELETION_TIMEOUTS.LOADING_MESSAGE
        );
      } else {
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Invalid category selected.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔙 Back to Categories',
              callback_data: 'mangalist_categories'
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        logger.warn('Invalid category selected', { chatId, category });
      }
    }
  } else if (data.startsWith('genre_')) {
    const parts = data.split('_');
    
    if (data === 'genre_back') {
      logger.info('Showing genres list', { chatId });
      
      await handleCallbackWithLoading(
        bot,
        callbackQuery,
        async (bot, callbackQuery) => {
          const genres = await fetchGenres();
          
          if (genres) {
            const messageOptions = createGenreSelectionMessage(genres, 0);
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: messageOptions.text,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, false, DELETION_TIMEOUTS.USER_INTERACTION);
            logger.info('Updated to genre selection', { chatId });
          } else {
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: '❌ Failed to fetch genres. Please try again later.',
              reply_markup: {
                inline_keyboard: [[{
                  text: '🔄 Try Again',
                  callback_data: 'genre_back'
                }]]
              }
            }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
            logger.warn('Failed to fetch genres', { chatId });
          }
        },
        '🎭 Loading genres...',
        DELETION_TIMEOUTS.LOADING_MESSAGE
      );
      
    } else if (data.startsWith('genre_page_')) {
      const page = parseInt(parts[2], 10);
      logger.info('Showing genres page', { chatId, page });
      
      await handleCallbackWithLoading(
        bot,
        callbackQuery,
        async (bot, callbackQuery) => {
          const genres = await fetchGenres();
          
          if (genres) {
            const messageOptions = createGenreSelectionMessage(genres, page);
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: messageOptions.text,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, false, DELETION_TIMEOUTS.USER_INTERACTION);
            logger.info('Updated genre selection page', { chatId, page });
          } else {
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: '❌ Failed to fetch genres. Please try again later.',
              reply_markup: {
                inline_keyboard: [[{
                  text: '🔄 Try Again',
                  callback_data: 'genre_back'
                }]]
              }
            }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
            logger.warn('Failed to fetch genres', { chatId });
          }
        },
        `🎭 Loading genres page ${page}...`,
        DELETION_TIMEOUTS.LOADING_MESSAGE
      );
      
    } else if (parts.length >= 2) {
      const genreSlug = parts[1];
      const page = parts.length >= 3 ? parseInt(parts[2], 10) : 1;
      
      logger.info('Fetching manga for genre', { chatId, genreSlug, page });
      
      await handleCallbackWithLoading(
        bot,
        callbackQuery,
        async (bot, callbackQuery) => {
          const genres = await fetchGenres();
          
          if (!genres || !isValidGenre(genres, genreSlug)) {
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: `❌ Invalid genre: ${genreSlug}`,
              reply_markup: {
                inline_keyboard: [[{
                  text: '🔙 Back to Genres',
                  callback_data: 'genre_back'
                }]]
              }
            }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
            logger.warn('Invalid genre selected', { chatId, genreSlug });
            return;
          }
          
          const genreDisplayName = getGenreDisplayName(genres, genreSlug);
          const data = await fetchMangaByGenre(genreSlug, page);
          
          if (data) {
            const messageOptions = createGenreMangaListMessage(data, genreSlug, genreDisplayName, page);
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: messageOptions.text,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
            logger.info('Updated genre manga list', { chatId, genreSlug, page });
          } else {
            await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: '❌ Failed to fetch manga list. Please try again later.',
              reply_markup: {
                inline_keyboard: [[{
                  text: '🔙 Back to Genres',
                  callback_data: 'genre_back'
                }]]
              }
            }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
            logger.warn('Failed to fetch genre manga list', { chatId, genreSlug });
          }
        },
        `🎭 Loading ${genreSlug} manga... (Page ${page})`,
        DELETION_TIMEOUTS.LOADING_MESSAGE
      );
    }
  } else if (data === 'page_info') {
    logger.debug('Ignored page_info callback', { chatId });
    
  } else if (data === 'latest_manga') {
    logger.info('Latest manga callback triggered', { chatId });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const latestList = await fetchLatest();
        if (!latestList || latestList.length === 0) {
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ No latest manga updates found. Please try again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 Retry',
                callback_data: 'refresh_latest'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
          logger.warn('No latest manga updates found', { chatId });
          return;
        }
        
        storeLatestResults(chatId, latestList);
        logger.info('Fetched latest results via callback', { chatId, resultCount: latestList.length });
        
        const messageOptions = createLatestMessage(latestList, 0);
        await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Updated to latest releases via callback', { chatId });
      },
      '🆕 Loading latest releases...',
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
  } else if (data === 'refresh_latest') {
    logger.info('Refreshing latest releases', { chatId });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const latestList = await fetchLatest();
        if (!latestList || latestList.length === 0) {
          await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ No latest manga updates found. Please try again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 Retry',
                callback_data: 'refresh_latest'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
          logger.warn('No latest manga updates found', { chatId });
          return;
        }
        
        storeLatestResults(chatId, latestList);
        logger.info('Refreshed latest results', { chatId, resultCount: latestList.length });
        
        const messageOptions = createLatestMessage(latestList, 0);
        await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
          text: messageOptions.text,
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        }, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Updated to latest releases', { chatId });
      },
      '🆕 Refreshing latest releases...',
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
  } else if (data === 'quick_search') {
    logger.info('Quick search callback triggered', { chatId });
    await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: '🔍 **Quick Search**\n\nSend me the name of any manga you want to search for!\n\nExample: `Naruto` or `One Piece`',
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🏠 Back to Start', callback_data: 'back_to_start' }
        ]]
      }
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
    
  } else if (data === 'show_help') {
    logger.info('Show help callback triggered', { chatId });
    const botUsername = await getBotUsername();
    const isGroup = isGroupChat({ chat: { id: chatId } });
    
    const helpMessage = `
🤖✨ **DuckDex Bot - Command Guide** ✨🤖

🔍 **Search & Discovery:**
• \`/search <query>\` - Search for any manga
• \`/latest\` - Browse latest manga updates
• \`/mangalist [category]\` - Browse by categories
• \`/genre [genre]\` - Explore by genres

📖 **Manga Information:**
• \`/details <manga_id>\` - Get detailed manga info
• \`/chapters <manga_id>\` - List all chapters

📄 **Downloads:**
• \`/pdf <chapter_id>\` - Download chapter as PDF

🎆 **General:**
• \`/start\` - Welcome message with quick actions
• \`/help\` - Show this comprehensive guide

${isGroup ? `🏢 **Group Usage:**\nMention me with @${botUsername} or reply to my messages\n\n` : ''}💡 **Pro Tips:**
• Just type a manga name to search instantly!
• Use buttons for easier navigation
• Commands work in both private and group chats
• All results include interactive buttons

🚀 **Ready to explore manga? Try any command above!**
    `;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔍 Quick Search', callback_data: 'quick_search' },
          { text: '🔥 Latest Manga', callback_data: 'latest_manga' }
        ],
        [
          { text: '📊 Categories', callback_data: 'mangalist_categories' },
          { text: '🎨 Genres', callback_data: 'genre_back' }
        ],
        [
          { text: '🏠 Back to Start', callback_data: 'back_to_start' }
        ]
      ]
    };
    
    await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: helpMessage,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
    
  } else if (data === 'back_to_start') {
    logger.info('Back to start callback triggered', { chatId });
    const botUsername = await getBotUsername();
    const isGroup = isGroupChat({ chat: { id: chatId } });
    
    const welcomeMessage = `
🦆✨ **Welcome back to DuckDex Bot!** ✨🦆

🎯 **Your Ultimate Manga Companion**

🌟 **What I can do for you:**
📚 **Search** - Find any manga instantly
📖 **Details** - Get comprehensive manga info
📃 **Chapters** - Browse all available chapters
🔥 **Latest** - Stay updated with new releases
📊 **Categories** - Explore by manga types
🎨 **Genres** - Discover by your favorite genres
📄 **PDF Export** - Download chapters as PDF

${isGroup ? `🏢 **Group Usage:** Mention me with @${botUsername} or reply to my messages\n` : ''}💡 **Quick Start:** Just type a manga name or use /help for all commands!

🚀 **Ready to dive into the world of manga?**
    `;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔍 Search Manga', callback_data: 'quick_search' },
          { text: '🔥 Latest Updates', callback_data: 'latest_manga' }
        ],
        [
          { text: '📊 Browse Categories', callback_data: 'mangalist_categories' },
          { text: '🎨 Browse Genres', callback_data: 'genre_back' }
        ],
        [
          { text: '❓ Help & Commands', callback_data: 'show_help' }
        ]
      ]
    };
    
    await safeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: welcomeMessage,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
  }
});

// Error handling
bot.on('polling_error', (error) => {
  logger.error('Polling error', { error: error.message });
});

logger.info('Bot is running! Send /start to begin.');