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
  enhancedSafeEditOrSend, 
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

// Helper function to safely edit or send new message (enhanced version)
async function safeEditOrSend(bot, chatId, messageId, messageOptions, isPhoto = false, deleteAfter = 0) {
  return await enhancedSafeEditOrSend(bot, chatId, messageId, messageOptions, isPhoto, deleteAfter);
}

// Enhanced start command
bot.onText(/\/start(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  const isGroup = isGroupChat(msg);
  const userName = msg.from.first_name || 'there';
  
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
  
  logger.info('Sent enhanced start message', { chatId, chatType: msg.chat.type, userName });
});

// Enhanced help command
bot.onText(/\/help(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
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
  
  logger.info('Sent enhanced help message', { chatId, chatType: msg.chat.type });
});

// Enhanced search command and auto-search handler
async function handleSearch(msg, query) {
  const chatId = msg.chat.id;
  const isGroup = isGroupChat(msg);
  logger.info('Starting search', { chatId, query, chatType: msg.chat.type });
  
  const searchingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `🔍 Searching for "${query}"...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );
  logger.info('Sent searching message', { chatId, messageId: searchingMsg.message_id });

  try {
    const results = await searchManga(query);
    storeSearchResults(chatId, results, query);
    logger.info('Stored search results', { chatId, resultCount: results.length });

    const messageOptions = createSearchResultsMessage(results);
    
    // Delete loading message
    try {
      await bot.deleteMessage(chatId, searchingMsg.message_id);
      logger.info('Deleted searching message', { chatId, messageId: searchingMsg.message_id });
    } catch (e) {
      logger.warn('Could not delete searching message', { chatId, error: e.message });
    }
    
    await sendMessageWithAutoDeletion(bot, chatId, messageOptions, {}, DELETION_TIMEOUTS.SEARCH_RESULTS);
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
  const loadingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `📚 Loading chapters for manga ID: ${mangaId}...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );
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

// Start command
bot.onText(/\/start(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const userName = msg.from.first_name || 'Friend';
  const isGroup = isGroupChat(msg);
  
  logger.info('Sent enhanced start message', { chatId, userName, chatType: isGroup ? 'group' : 'private' });
  
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
});

// Help command
bot.onText(/\/help(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  const isGroup = isGroupChat(msg);
  
  logger.info('Sent enhanced help message', { chatId, chatType: isGroup ? 'group' : 'private' });
  
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
});

// Latest command
bot.onText(/\/latest(@\w+)?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Fetching latest releases', { chatId });
  const loadingMsg = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    '🆕 Loading latest releases...', 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );
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
  } catch (error) {
    logger.error('Latest fetch failed', { chatId, error: error.message });
    await enhancedSafeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch latest releases. Please try again later.',
      reply_markup: {
        inline_keyboard: [[{
          text: '🔄 Try Again',
          callback_data: 'refresh_latest'
        }]]
      }
    }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
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

// Enhanced callback query handler with better error handling and loading states
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  // Answer callback query immediately to prevent loading spinner
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
            await bot.deleteMessage(chatId, callbackQuery.message.message_id);
            await sendPhotoWithAutoDeletion(bot, chatId, messageOptions.photo, {
              caption: messageOptions.caption,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, DELETION_TIMEOUTS.MANGA_DETAILS);
          } else {
            await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
              text: messageOptions.text,
              reply_markup: messageOptions.reply_markup,
              parse_mode: messageOptions.parse_mode
            }, false, DELETION_TIMEOUTS.MANGA_DETAILS);
          }
          logger.info('Sent manga details', { chatId, mangaId });
        } else {
          await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Could not find manga details. Please check the manga ID and try again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔄 Retry',
                callback_data: data
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
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
          await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, messageOptions, false, DELETION_TIMEOUTS.USER_INTERACTION);
          logger.info('Updated latest releases page', { chatId, page });
        } else {
          await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Latest releases data not found. Please use /latest command again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🆕 Get Latest',
                callback_data: 'refresh_latest'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
        }
      },
      `🆕 Loading latest releases page ${page}...`,
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );

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
    logger.info('Processing search page callback', { chatId, page });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const searchData = getStoredSearchResults(chatId);
        if (searchData) {
          const messageOptions = createSearchResultsMessage(searchData.results, page);
          await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, messageOptions, false, DELETION_TIMEOUTS.SEARCH_RESULTS);
          logger.info('Updated search results page', { chatId, page });
        } else {
          await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
            text: '❌ Search results not found. Please search again.',
            reply_markup: {
              inline_keyboard: [[{
                text: '🔍 New Search',
                callback_data: 'new_search'
              }]]
            }
          }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
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
      
      // Show loading state
      await safeEditOrSend(bot, chatId, msg.message_id, {
        text: '📚 Loading categories...'
      }, false, 0);
      
      try {
        const messageOptions = createCategorySelectionMessage();
        await safeEditOrSend(bot, chatId, msg.message_id, messageOptions, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Updated to category selection', { chatId });
      } catch (error) {
        logger.error('Failed to show categories', { chatId, error: error.message });
        await safeEditOrSend(bot, chatId, msg.message_id, {
          text: '❌ Failed to load categories. Please try again.',
          reply_markup: {
            inline_keyboard: [[{
              text: '🔄 Retry',
              callback_data: data
            }]]
          }
        }, false, DELETION_TIMEOUTS.ERROR_MESSAGE);
      }
      
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
    
  } else if (data === 'latest_manga') {
    // Latest manga callback from start/help menu
    logger.info('Latest manga callback triggered', { chatId });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const latestList = await fetchLatest();
        storeLatestResults(chatId, latestList);
        logger.info('Fetched latest results via callback', { chatId, resultCount: latestList.length });
        
        const messageOptions = createLatestMessage(latestList, 0);
        await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, messageOptions, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Updated to latest releases via callback', { chatId });
      },
      '🆕 Loading latest releases...',
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
  } else if (data === 'refresh_latest') {
    // Refresh latest releases
    logger.info('Refreshing latest releases', { chatId });
    
    await handleCallbackWithLoading(
      bot,
      callbackQuery,
      async (bot, callbackQuery) => {
        const latestList = await fetchLatest();
        storeLatestResults(chatId, latestList);
        logger.info('Refreshed latest results', { chatId, resultCount: latestList.length });
        
        const messageOptions = createLatestMessage(latestList, 0);
        await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, messageOptions, false, DELETION_TIMEOUTS.USER_INTERACTION);
        logger.info('Updated to latest releases', { chatId });
      },
      '🆕 Refreshing latest releases...',
      DELETION_TIMEOUTS.LOADING_MESSAGE
    );
    
  } else if (data === 'quick_search') {
    // Quick search prompt
    logger.info('Quick search callback triggered', { chatId });
    await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: '🔍 **Quick Search**\n\nSend me the name of any manga you want to search for!\n\nExample: `Naruto` or `One Piece`',
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🏠 Back to Start', callback_data: 'back_to_start' }
        ]]
      }
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
    
  } else if (data === 'show_help') {
    // Show help from start menu
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
    
    await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: helpMessage,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
    
  } else if (data === 'back_to_start') {
    // Back to start menu
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
    
    await enhancedSafeEditOrSend(bot, chatId, callbackQuery.message.message_id, {
      text: welcomeMessage,
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }, false, DELETION_TIMEOUTS.USER_INTERACTION);
  }
});

// Enhanced PDF command with batch cleanup
bot.onText(/\/pdf(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const chapterId = match[2].trim();
  const botUsername = await getBotUsername();
  if (isGroupChat(msg) && match[1] && match[1] !== `@${botUsername}`) return;

  logger.info('Processing PDF command', { chatId, chapterId });
  const statusMessage = await sendMessageWithAutoDeletion(
    bot, 
    chatId, 
    `📚 Generating PDF for chapter: ${chapterId}...`, 
    {}, 
    DELETION_TIMEOUTS.LOADING_MESSAGE
  );
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