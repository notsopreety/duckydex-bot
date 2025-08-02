# 🦆 DuckDex Bot - Ultimate Manga Telegram Bot

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="License">
</div>


<div align="center">
  <a href="https://duckydex.samirb.com.np">
    <img src="icon.png" alt="Icon" width="150" height="150"><br>
    <caption>Visit DuckDex Online🔗</caption>
    <br>
  </a>
  <h3>🚀 Your Ultimate Manga Companion on Telegram</h3>
  <p>Search, browse, and download manga with an intuitive and feature-rich Telegram bot</p>
</div>

---

## 🌟 Features

### 🔍 **Search & Discovery**
- **🔎 Smart Search** - Find any manga instantly with intelligent search
- **🔥 Latest Updates** - Stay updated with the newest manga releases
- **📊 Category Browsing** - Explore manga by categories (Latest, Hot, New, Completed)
- **🎨 Genre Filtering** - Discover manga by your favorite genres
- **🎯 Auto-Search** - Just type a manga name without commands

### 📚 **Manga Information**
- **📖 Detailed Info** - Comprehensive manga details with cover images
- **📃 Chapter Lists** - Browse all available chapters with pagination
- **⭐ Ratings & Stats** - View ratings, status, and popularity metrics
- **🏷️ Genre Tags** - See all genres and categories

### 💾 **Downloads & Export**
- **📄 PDF Generation** - Download any chapter as a high-quality PDF
- **🖼️ Image Optimization** - Properly formatted images and layouts
- **📱 Mobile Friendly** - Optimized for mobile reading

### 🎛️ **User Experience**
- **🎨 Interactive Buttons** - Intuitive inline keyboard navigation
- **📄 Pagination** - Smooth browsing through large result sets
- **⚡ Auto-Deletion** - Smart message cleanup to reduce chat spam
- **🔄 Loading States** - Real-time feedback during operations
- **🛡️ Error Handling** - Robust error recovery with retry options
- **👥 Group Support** - Works seamlessly in both private chats and groups

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/notsopreety/duckydex-bot.git
   cd duckydex-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   # Create .env or .env.local file
   echo "TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here" > .env.local
   ```

4. **Start the bot**
   ```bash
   # Development mode with auto-restart
   npm run dev
   
   # Production mode
   npm start
   ```

---

## 🎮 Commands & Usage

### 📋 **Basic Commands**
| Command | Description | Example |
|---------|-------------|----------|
| `/start` | Welcome message with quick actions | `/start` |
| `/help` | Comprehensive command guide | `/help` |
| `/search <query>` | Search for manga by title | `/search Naruto` |
| `/details <manga_id>` | Get detailed manga information | `/details lookism` |
| `/chapters <manga_id>` | List all chapters with details | `/chapters one-piece` |

### 🗂️ **Browse Commands**
| Command | Description | Example |
|---------|-------------|----------|
| `/latest` | Show latest manga updates | `/latest` |
| `/mangalist [category]` | Browse by categories | `/mangalist hot-manga` |
| `/genre [genre]` | Explore by genres | `/genre action` |

### 📥 **Download Commands**
| Command | Description | Example |
|---------|-------------|----------|
| `/pdf <chapter_id>` | Download chapter as PDF | `/pdf naruto-chapter-1` |

### 💡 **Pro Tips**
- **Quick Search**: Just type a manga name without any command!
- **Interactive Navigation**: Use buttons for easier browsing
- **Group Usage**: Mention the bot `@yourbotname` in groups
- **Direct Access**: Use commands with parameters for direct access

---

## 🏗️ Architecture

### 📁 **Project Structure**
```
duckydex-bot/
├── 📄 main.js                # Main bot logic and command handlers
├── 📁 utils/                 # Utility modules
│   ├── 📃 chapterList.js     # Chapter list handling
│   ├── 📃 chapters.js        # Chapter management
│   ├── 🗑️ deletion.js        # Auto-deletion system
│   ├── 📖 details.js         # Manga details handling
│   ├── 🎨 genre.js           # Genre filtering
│   ├── 📊 latest.js          # Latest updates
│   ├── 📊 mangalist.js       # Category browsing
│   ├── 📟 pagination.js      # Pagination handling
│   ├── 🏓 ping.js            # Response speed pinger
│   ├── 📄 pdf.js             # PDF generation
│   ├── 🔍 search.js          # Search functionality
│   └── 🌐 speedtest.js       # Download and upload speed test 
├── 📋 package.json           # Dependencies and scripts
├── 🔧 .env/.env.local        # Environment configuration
└── 📚 README.md              # This file
```

### 🔧 **Core Technologies**
- **Runtime**: Node.js 16+
- **Bot Framework**: node-telegram-bot-api
- **HTTP Client**: Axios
- **PDF Generation**: pdf-lib
- **Image Processing**: Sharp
- **Logging**: Winston
- **Environment**: dotenv

---

## 🎨 **Key Features Showcase**

### 🔍 **Smart Search System**
- Instant search results with pagination
- Auto-complete suggestions
- Typo-tolerant search
- Category and genre filtering

### 📱 **Interactive UI**
- Beautiful inline keyboards
- Smooth navigation flow
- Loading states and progress indicators
- Error handling with retry options

### 🧹 **Smart Message Management**
- Auto-deletion of temporary messages
- Reduced chat spam
- Efficient message editing
- Batch cleanup operations

### 📊 **Advanced Browsing**
- Category-based exploration
- Genre-specific filtering
- Latest updates tracking
- Popularity-based sorting

---

## 🛠️ **Development**

### 🔧 **Available Scripts**
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Install dependencies
npm install
```

### 📝 **Environment Variables**
```bash
# Required
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

### 🐛 **Debugging**
- Logs are written to `combined.log` and `error.log`
- Use `npm run dev` for development with auto-restart
- Check console output for real-time debugging

---

## 📈 **Performance Features**

- **⚡ Fast Response Times** - Optimized API calls and caching
- **🔄 Auto-Retry Logic** - Automatic retry for failed operations
- **📊 Efficient Pagination** - Smart loading of large datasets
- **🗑️ Memory Management** - Auto-cleanup of old data and messages
- **📱 Mobile Optimized** - Responsive design for all devices

---

## 🔮 **Upcoming Features (Maybe When I get support on this ✨.)**
- [ ] User Personalized Settings
- [ ] AI Suggestion Integration
- [ ] Activity Tracking
- [ ] Personalized Latest Updates Notification
- [ ] ... and many more

## 🤝 **Contributing**

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 **Author**

**Samir Thakuri**
- GitHub: [@notsopreety](https://github.com/notsopreety)
- Telegram: [@samirxyz](https://t.me/samirxyz)

---

## 🙏 **Acknowledgments**

- [Telegram Bot API](https://core.telegram.org/bots/api) for the excellent bot platform
- All contributors and users who help improve this bot

---

<div align="center">
  <h3>🌟 If you found this project helpful, please give it a star! ⭐</h3>
  <p>Made with ❤️ for the manga community</p>
</div>
