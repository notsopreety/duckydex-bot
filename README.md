# DuckDex Manga Telegram Bot

A Telegram bot for searching and browsing manga using the `api.samirb.com.np` API.

## Features

✅ **Search for manga** - Users can search for manga by title  
✅ **View manga details** - Shows title, author, status, genres, rating, and summary with cover image  
✅ **Browse chapters** - Navigate through available chapters with pagination  
✅ **Auto-search** - Just send any text (non-command) to search  
✅ **Inline keyboards** - Interactive buttons for navigation  
✅ **Pagination** - Handle large search results and chapter lists  
✅ **Image proxy** - Properly load manga cover images through the API  

## Commands

- `/start` - Welcome message and introduction
- `/help` - Show available commands
- `/search <query>` - Search for manga by title
- `/details <manga_id>` - Get detailed information about a specific manga
- `/trending` - Show trending manga (placeholder)
- `/random` - Get a random manga suggestion

## Usage Examples

1. **Search for manga:**
   ```
   /search Naruto
   ```
   or just send:
   ```
   Naruto
   ```

2. **Get manga details:**
   ```
   /details lookism
   ```

3. **Get random manga:**
   ```
   /random
   ```

## Architecture

### Files Structure
```
├── main.js                 # Main bot logic and command handlers
├── utils/
│   ├── search.js          # Search functionality and result formatting
│   ├── details.js         # Manga details retrieval and formatting
│   ├── chapters.js        # Chapter navigation and keyboard creation
│   └── pagination.js      # Pagination utilities and caching
├── package.json           # Dependencies and scripts
└── .env.local            # Bot token configuration
```

### API Integration

The bot integrates with `https://api.samirb.com.np/manga/` endpoints:

- **Search**: `GET /manga/search?q={query}`
- **Details**: `GET /manga/details/{id}`  
- **Image Proxy**: `GET /manga/img?url={encodedUrl}`

### Key Features Implementation

#### Search Results
- Shows up to 10 results per page
- Each result displays: title, author, updated date, views
- Numbered buttons (1, 2, 3...) for each manga
- Pagination controls for large result sets
- Results cached for pagination navigation

#### Manga Details
- Shows cover image using the image proxy API
- Displays comprehensive manga information
- Interactive chapter selection with 4 chapters per row
- 20 chapters per page with pagination
- Back navigation to return to details

#### Chapter Navigation  
- Chapters organized in a grid layout (4 per row)
- Pagination for manga with many chapters
- Chapter buttons show "Ch. X" format
- Back button to return to manga details

#### Caching System
- In-memory storage for search results (1 hour TTL)
- Automatic cleanup of old cached data
- Supports pagination without re-querying API

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local` file with your bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```
4. Start the bot:
   ```bash
   npm start
   ```

## Development

For development with auto-restart:
```bash
npm run dev
```

## Dependencies

- `node-telegram-bot-api` - Telegram Bot API wrapper
- `axios` - HTTP client for API requests  
- `dotenv` - Environment variable management
- `nodemon` - Development auto-restart (dev dependency)

## Future Enhancements

- [ ] Chapter reading functionality
- [ ] Real trending manga API integration  
- [ ] User favorites system
- [ ] Reading progress tracking
- [ ] Better image handling and caching
- [ ] Database integration for persistent storage
- [ ] Advanced search filters (genre, status, etc.)
