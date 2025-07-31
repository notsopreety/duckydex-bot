const dotenv = require('dotenv');
const fs = require('fs');
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
dotenv.config({ path: envPath });
const TelegramBot = require('node-telegram-bot-api');
// Import utility functions
const { searchManga, createSearchResultsMessage } = require('./utils/search');
const { getMangaDetails, createMangaDetailsMessage } = require('./utils/details');
const { createChapterKeyboard, getChapterListMessage, storeMangaData, getStoredMangaData } = require('./utils/chapters');
const { storeSearchResults, getStoredSearchResults, storeLatestResults, getStoredLatestResults } = require('./utils/pagination');
const { createChapterListMessage } = require('./utils/chapterList');
const { fetchLatest, createLatestMessage } = require('./utils/latest');
const { createChapterPDF, cleanupTempFiles } = require('./utils/pdf');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('Bot is starting...');

// Helper function to check if message is from group
function isGroupChat(msg) {
  return msg.chat.type === 'group' || msg.chat.type === 'supergroup';
}

// Helper function to safely edit or send new message
async function safeEditOrSend(bot, chatId, messageId, messageOptions, isPhoto = false) {
  try {
    if (isPhoto && messageOptions.photo) {
      // Try to edit photo caption
      await bot.editMessageCaption(messageOptions.caption || messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
    } else {
      // Try to edit text message
      await bot.editMessageText(messageOptions.text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
    }
  } catch (error) {
    console.log('Edit failed, sending new message:', error.message);
    // If edit fails, send a new message
    if (isPhoto && messageOptions.photo) {
      await bot.sendPhoto(chatId, messageOptions.photo, {
        caption: messageOptions.caption || messageOptions.text,
        parse_mode: messageOptions.parse_mode,
        reply_markup: messageOptions.reply_markup
      });
    } else {
      await bot.sendMessage(chatId, messageOptions.text, {
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      });
    }
  }
}

// Start command
bot.onText(/\/start(@\w+)?/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🦆 Welcome to DuckDex Bot! 🦆

I can help you:
📚 Search for manga
📖 View manga details
📃 Browse chapters
🔍 Find your favorite series

Type /help to see all available commands!
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

// Help command
bot.onText(/\/help(@\w+)?/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
🤖 Available Commands:

/start - Welcome message
/help - Show this help message
/search <query> - Search for manga
/details <manga_id> - Get detailed info about a manga
/chapters <manga_id> - List all chapters with details
/pdf <chapter_id> - Get a chapter as a PDF file
/latest - Show latest manga updates
/trending - Show trending manga
/random - Get a random manga suggestion

Just send me a manga name and I'll search for it!
  `;
  
  bot.sendMessage(chatId, helpMessage);
});

// Search command and auto-search handler
async function handleSearch(msg, query) {
  const chatId = msg.chat.id;
  const searchingMsg = await bot.sendMessage(chatId, `🔍 Searching for "${query}"...`);

  try {
    const results = await searchManga(query);
    storeSearchResults(chatId, results, query);

    const messageOptions = createSearchResultsMessage(results);
    
    // Delete the "searching..." message
    try {
      await bot.deleteMessage(chatId, searchingMsg.message_id);
    } catch (e) {
      console.log('Could not delete searching message:', e.message);
    }
    
    bot.sendMessage(chatId, messageOptions.text, {
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    });
  } catch (error) {
    console.error('Search error:', error);
    await safeEditOrSend(bot, chatId, searchingMsg.message_id, {
      text: '❌ Search failed. Please try again later.'
    });
  }
}

bot.onText(/\/search(@\w+)?\s+(.+)/, (msg, match) => {
  handleSearch(msg, match[2]);
});

// Details command
bot.onText(/\/details(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mangaId = match[2];

  const loadingMsg = await bot.sendMessage(chatId, `📚 Loading details for manga ID: ${mangaId}...`);

  try {
    const details = await getMangaDetails(mangaId);
    
    if (details) {
      // Store full manga data for pagination
      const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
      storeMangaData(shortMangaId, details);
      storeMangaData(mangaId, details);
      
      const messageOptions = createMangaDetailsMessage(details);

      // Delete loading message
      try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {
        console.log('Could not delete loading message:', e.message);
      }

      if (messageOptions.photo) {
        bot.sendPhoto(chatId, messageOptions.photo, {
          caption: messageOptions.caption,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }).catch(error => {
          console.log('Failed to send photo, sending text only:', error.message);
          bot.sendMessage(chatId, messageOptions.text, {
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
        });
      } else {
        bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.'
      });
    }
  } catch (error) {
    console.error('Details error:', error);
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch manga details. Please try again later.'
    });
  }
});

// Chapters command
bot.onText(/\/chapters(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mangaId = match[2];

  const loadingMsg = await bot.sendMessage(chatId, `📚 Loading chapters for manga ID: ${mangaId}...`);

  try {
    const details = await getMangaDetails(mangaId);
    
    if (details) {
      // Store manga data for pagination
      const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
      storeMangaData(shortMangaId, details);
      storeMangaData(mangaId, details);
      storeMangaData(`chlist_${shortMangaId}`, details);
      storeMangaData(`chlist_${mangaId}`, details);
      
      const messageOptions = createChapterListMessage(details.chapters, details.title, mangaId, 0);
      
      // Delete loading message
      try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {
        console.log('Could not delete loading message:', e.message);
      }
      
      // Send with image if available
      if (details.imageUrl) {
        const imageUrl = `https://api.samirb.com.np/manga/img?url=${encodeURIComponent(details.imageUrl)}`;
        
        bot.sendPhoto(chatId, imageUrl, {
          caption: messageOptions.text,
          parse_mode: messageOptions.parse_mode,
          reply_markup: messageOptions.reply_markup
        }).catch(error => {
          console.log('Failed to send photo, sending text only:', error.message);
          bot.sendMessage(chatId, messageOptions.text, {
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
        });
      } else {
        bot.sendMessage(chatId, messageOptions.text, {
          reply_markup: messageOptions.reply_markup,
          parse_mode: messageOptions.parse_mode
        });
      }
    } else {
      await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
        text: '❌ Could not fetch manga details. Please check the manga ID and try again.'
      });
    }
  } catch (error) {
    console.error('Chapters error:', error);
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch chapters. Please try again later.'
    });
  }
});

// Handle regular text messages (auto-search) - only in private chats or when bot is mentioned
bot.on('message', (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  
  if (!text || text.startsWith('/')) return;
  
  // In group chats, only respond if bot is mentioned or replied to
  if (isGroupChat(msg)) {
    const botUsername = bot.username || 'duckdex_bot';
    const isMentioned = text.includes(`@${botUsername}`);
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from.is_bot;
    
    if (!isMentioned && !isReplyToBot) return;
    
    // Remove bot mention from search query
    const query = text.replace(new RegExp(`@${botUsername}`, 'g'), '').trim();
    if (query) {
      handleSearch(msg, query);
    }
  } else {
    // Private chat - search directly
    handleSearch(msg, text);
  }
});

// Callback query handler for search results, details, and chapters
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const data = callbackQuery.data;

  // Acknowledge the callback query
  bot.answerCallbackQuery(callbackQuery.id);

  if (data.startsWith('det_')) {
    const mangaId = data.split('_')[1];
    
    // Show loading indicator
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Loading details...', show_alert: false });
    
    try {
      const details = await getMangaDetails(mangaId);
      
      if (details) {
        // Store details with both short and full IDs
        const shortMangaId = mangaId.length > 10 ? mangaId.substring(0, 10) : mangaId;
        storeMangaData(shortMangaId, details);
        storeMangaData(mangaId, details);
        
        console.log(`Stored manga data for IDs: ${shortMangaId} and ${mangaId}`);
        
        const messageOptions = createMangaDetailsMessage(details);

        // Always send new message in callback queries to avoid edit conflicts
        if (messageOptions.photo) {
          bot.sendPhoto(chatId, messageOptions.photo, {
            caption: messageOptions.caption,
            parse_mode: messageOptions.parse_mode,
            reply_markup: messageOptions.reply_markup
          });
        } else {
          bot.sendMessage(chatId, messageOptions.text, { 
            reply_markup: messageOptions.reply_markup,
            parse_mode: messageOptions.parse_mode
          });
        }
      }
    } catch (error) {
      console.error('Details callback error:', error);
      bot.sendMessage(chatId, '❌ Failed to load manga details. Please try again.');
    }

  } else if (data.startsWith('latest_page_')) {
    const page = parseInt(data.split('_')[2], 10);
    const latestList = getStoredLatestResults(chatId);
    if (latestList) {
      const msgOptions = createLatestMessage(latestList, page);
      await safeEditOrSend(bot, chatId, msg.message_id, msgOptions);
    }

  } else if (data.startsWith('latpdf_')) {
    const chapterId = data.substring(7);
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
      setTimeout(()=>{ try{ if(fs.existsSync(pdf.path)) fs.unlinkSync(pdf.path);}catch(e){} },5000);
    } catch(err) {
      console.error('latest pdf error',err);
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
    }

  } else if (data.startsWith('chp_')) {
    const [_, shortMangaId, pageStr] = data.split('_');
    const page = parseInt(pageStr, 10);
    
    console.log(`Chapter pagination: shortMangaId=${shortMangaId}, page=${page}`);
    
    const details = getStoredMangaData(shortMangaId);
    
    console.log(`Found details:`, details ? 'Yes' : 'No');
    
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

      console.log(`Trying to edit message with ${details.chapters.length} chapters`);

      // Try to update just the keyboard first
      try {
        await bot.editMessageReplyMarkup(chapterKeyboard, {
          chat_id: chatId,
          message_id: msg.message_id
        });
        console.log('Successfully updated chapter pagination buttons');
      } catch (error) {
        console.log('Failed to edit reply markup:', error.message);
        // If can't edit, send new message
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
      }
    } else {
      console.log('No details found, sending error message');
      bot.sendMessage(chatId, 'Sorry, manga details not found. Please try searching again.');
    }

  } else if (data.startsWith('chlist_')) {
    // Handle chapter list pagination
    const parts = data.split('_');
    if (parts.length < 3) {
      bot.sendMessage(chatId, '❌ Invalid pagination data.');
      return;
    }
    
    const shortMangaId = parts[1];
    const page = parseInt(parts[2], 10);
    
    console.log(`Chapter list pagination: shortMangaId=${shortMangaId}, page=${page}`);
    
    // Find the matching manga data
    let details = getStoredMangaData(shortMangaId);
    
    // If not found with short ID, try searching through all stored data
    if (!details) {
      const allKeys = ['chlist_', 'det_', ''].map(prefix => `${prefix}${shortMangaId}`);
      for (const key of allKeys) {
        details = getStoredMangaData(key);
        if (details) break;
      }
    }
    
    if (!details) {
      console.log('No manga data found for chapter list pagination');
      bot.sendMessage(chatId, 'Session expired. Please use /chapters command again.');
      return;
    }
    
    const fullMangaId = shortMangaId;
    const messageOptions = createChapterListMessage(details.chapters, details.title, fullMangaId, page);
    
    // Check if the current message has a photo (caption) or is text-only
    if (msg.photo && msg.photo.length > 0) {
      await safeEditOrSend(bot, chatId, msg.message_id, {
        caption: messageOptions.text,
        reply_markup: messageOptions.reply_markup,
        parse_mode: messageOptions.parse_mode
      }, true);
    } else {
      await safeEditOrSend(bot, chatId, msg.message_id, messageOptions);
    }
    
    console.log('Chapter list pagination updated successfully');

  } else if (data.startsWith('ch_')) {
    const [_, chapterIndex, shortMangaId] = data.split('_');
    const details = getStoredMangaData(shortMangaId);

    if (details) {
      const chapter = details.chapters[parseInt(chapterIndex, 10)];
      const chapterId = chapter.id;

      // Inform user
      const statusMsg = await bot.sendMessage(chatId, 
        `📚 Generating PDF for *${details.title}* \- Chapter *${chapter.chapter}*...`, 
        { parse_mode: 'Markdown' }
      );

      try {
        cleanupTempFiles();

        const pdfInfo = await createChapterPDF(chapterId, details.title, chapter.chapter);

        // Update status
        await bot.editMessageText(
          `✅ PDF ready! Uploading...`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );

        // Send PDF
        await bot.sendDocument(chatId, pdfInfo.path, {
          caption: `📖 ${pdfInfo.filename}\n📄 ${pdfInfo.totalPages} pages • ${pdfInfo.size} MB\n\nRead Online: https://duckydex.samirb.com.np/read/${chapterId}`
        });

        // Delete status message
        await bot.deleteMessage(chatId, statusMsg.message_id);

        // Clean up after send
        setTimeout(() => {
          try {
            if (fs.existsSync(pdfInfo.path)) fs.unlinkSync(pdfInfo.path);
          } catch (e) {
            console.error('Cleanup error:', e.message);
          }
        }, 5000);
      } catch (err) {
        console.error('PDF gen error:', err);
        await safeEditOrSend(bot, chatId, statusMsg.message_id, {
          text: `❌ Failed to generate PDF for chapter *${chapter.chapter}*\nError: ${err.message}`,
          parse_mode: 'Markdown'
        });
      }
    }

  } else if (data === 'page_info') {
    // Do nothing for page info clicks
  }
});

// PDF command
bot.onText(/\/pdf(@\w+)?\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const chapterId = match[2].trim();

  // Send initial message
  const statusMessage = await bot.sendMessage(chatId, `📚 Generating PDF for chapter: ${chapterId}...`);

  try {
    // Clean up old temp files first
    cleanupTempFiles();

    // Create the PDF
    const result = await createChapterPDF(chapterId);
    
    // Update status message
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

    // Send the PDF file
    await bot.sendDocument(chatId, result.path, {
      caption: `📖 ${result.filename}\n
📄 ${result.totalPages} pages • ${result.size} MB\n\nRead Online: https://duckydex.samirb.com.np/read/${result.filename}`
    });

    // Delete status message
    await bot.deleteMessage(chatId, statusMessage.message_id);

    // Clean up the file after sending
    setTimeout(() => {
      try {
        if (fs.existsSync(result.path)) {
          fs.unlinkSync(result.path);
          console.log(`🗑️ Cleaned up PDF file: ${result.filename}`);
        }
      } catch (err) {
        console.error('Error cleaning up PDF file:', err.message);
      }
    }, 5000);

  } catch (error) {
    console.error('PDF generation error:', error);
    
    // Update status message with error
    await safeEditOrSend(bot, chatId, statusMessage.message_id, {
      text: `❌ Failed to generate PDF for chapter: ${chapterId}\n\nError: ${error.message}\n\nPlease check the chapter ID and try again.`
    });
  }
});

// Latest command
bot.onText(/\/latest(@\w+)?/, async (msg) => {
  const chatId = msg.chat.id;
  const loadingMsg = await bot.sendMessage(chatId, '🆕 Fetching latest releases...');

  try {
    const latestList = await fetchLatest();
    storeLatestResults(chatId, latestList);

    const messageOptions = createLatestMessage(latestList, 0);
    
    // Delete loading message
    try {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
    } catch (e) {
      console.log('Could not delete loading message:', e.message);
    }
    
    bot.sendMessage(chatId, messageOptions.text, {
      reply_markup: messageOptions.reply_markup,
      parse_mode: messageOptions.parse_mode
    });
  } catch (err) {
    console.error('Latest fetch error:', err);
    await safeEditOrSend(bot, chatId, loadingMsg.message_id, {
      text: '❌ Failed to fetch latest releases. Please try again later.'
    });
  }
});

// Trending command
bot.onText(/\/trending(@\w+)?/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '🔥 Trending feature is coming soon! For now, try searching for popular manga like "Naruto", "One Piece", or "Attack on Titan".');
});

// Error handling
bot.on('polling_error', (error) => {
  console.log('Polling error:', error);
});

console.log('Bot is running! Send /start to begin.');