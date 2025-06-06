# B-Bot: CSV Data Processing & Import Tool

A powerful Node.js command-line tool for validating, processing, and importing CSV data with advanced features like duplicate detection, progress tracking, and comprehensive reporting.

## ✨ Features

- **📊 CSV Validation**: Comprehensive data validation with detailed reporting
- **🔍 Duplicate Detection**: Smart duplicate detection and removal
- **📈 Progress Tracking**: Real-time progress monitoring with visual indicators
- **🎯 Batch Processing**: Configurable batch processing with rate limiting
- **📋 Detailed Reports**: Export validation and import results in multiple formats
- **⚡ Resume Capability**: Resume interrupted sessions
- **🎨 Interactive CLI**: Beautiful command-line interface with colors and prompts

## 🚀 Quick Start

### Step 1: Install Node.js

**For Windows:**
1. Visit [nodejs.org](https://nodejs.org)
2. Download the LTS version (recommended)
3. Run the installer and follow the setup wizard
4. Open Command Prompt or PowerShell to verify: `node --version`

**For macOS:**
1. Visit [nodejs.org](https://nodejs.org) and download the LTS version, OR
2. Use Homebrew: `brew install node`
3. Verify installation: `node --version`

**For Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 2: Download & Setup

1. **Clone or download this repository:**
   ```bash
   git clone https://github.com/melgharbawy/b-bot.git
   cd b-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up configuration:**
   ```bash
   cp env.template .env
   ```
   Then edit `.env` file with your settings (see Configuration section below)

### Step 3: Prepare Your Data

1. **Place your CSV file in the `data/` folder**
   - Your CSV should have headers like: `email`, `first_name`, `last_name`, `phone_number`
   - Example: `data/my-subscribers.csv`

2. **CSV Format Example:**
   ```csv
   email,first_name,last_name,phone_number
   john@example.com,John,Doe,+1234567890
   jane@example.com,Jane,Smith,+1987654321
   ```

## 🎮 How to Use

### Basic Commands

**Get Help:**
```bash
npm start help
```

**Validate CSV (without importing):**
```bash
npm start validate data/my-subscribers.csv
```

**Import CSV Data:**
```bash
npm start import data/my-subscribers.csv
```

**Check Import Status:**
```bash
npm start status
```

**Resume Interrupted Import:**
```bash
npm start resume
```

### Advanced Usage

**Dry Run (test without actually importing):**
```bash
npm start import data/my-subscribers.csv --dry-run
```

**Export Validation Report:**
```bash
npm start validate data/my-subscribers.csv --export-format json --output report.json
```

**Custom Batch Size:**
```bash
npm start import data/my-subscribers.csv --batch-size 10
```

**Watch Status in Real-time:**
```bash
npm start status --watch
```

## ⚙️ Configuration

Edit your `.env` file with the following settings:

```env
# API Configuration
API_BASE_URL=https://your-api-endpoint.com
API_KEY=your-api-key-here

# Processing Settings
BATCH_SIZE=5
RATE_LIMIT_DELAY=1000
MAX_RETRIES=3

# File Paths
CSV_FILE_PATH=data/subscribers.csv

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
```

### Configuration Options Explained:

- **API_BASE_URL**: Your API endpoint URL
- **API_KEY**: Your API authentication key
- **BATCH_SIZE**: Number of records to process simultaneously (recommended: 5-10)
- **RATE_LIMIT_DELAY**: Delay between batches in milliseconds (recommended: 1000ms)
- **MAX_RETRIES**: Number of retry attempts for failed requests
- **LOG_LEVEL**: Logging verbosity (`error`, `warn`, `info`, `debug`)

## 📊 Understanding the Output

### Validation Report
When you run validation, you'll see:
- ✅ **Total Records**: Number of records in your CSV
- ✅ **Valid Records**: Records that passed validation
- ❌ **Invalid Records**: Records with errors
- 🔍 **Duplicates Found**: Number of duplicate entries
- 📈 **Validation Rate**: Percentage of valid records

### Import Progress
During import, you'll see:
- Real-time progress bar
- Current batch being processed
- Success/failure counts
- Estimated time remaining

### Reports
After processing, you'll find detailed reports in:
- `logs/` folder - Processing logs
- Export files (if requested) - Detailed results

## 🔧 Troubleshooting

### Common Issues:

**"Command not found" error:**
- Make sure Node.js is installed: `node --version`
- Make sure you're in the project directory
- Try: `npx node src/index.js help`

**"Cannot find module" error:**
- Run: `npm install`
- Make sure you're in the correct directory

**API connection issues:**
- Check your `.env` file configuration
- Verify your API key is correct
- Check internet connection

**CSV format issues:**
- Ensure your CSV has proper headers
- Check for special characters or encoding issues
- Use UTF-8 encoding for your CSV file

### Getting More Help:

**Enable debug logging:**
```bash
# Add to your .env file
LOG_LEVEL=debug
```

**Check logs:**
- Look in the `logs/` folder for detailed execution logs
- Recent logs are in `logs/app.log`

## 📁 File Structure

```
b-bot/
├── data/                 # Place your CSV files here
│   └── .gitkeep
├── logs/                 # Application logs
│   └── .gitkeep
├── src/                  # Application source code
├── .env                  # Configuration file
├── package.json          # Project dependencies
└── README.md            # This file
```

## 🤝 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the logs in the `logs/` folder
3. Make sure your CSV format matches the expected structure
4. Verify your configuration in the `.env` file

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Made with ❤️ for efficient data processing** 