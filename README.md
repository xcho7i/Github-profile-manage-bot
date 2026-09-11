# 🚀 GitHub Badge Bot

<div align="center">

![GitHub stars](https://img.shields.io/github/stars/sneaker-dev/github_badeg_bot_all?style=social)
![GitHub forks](https://img.shields.io/github/forks/sneaker-dev/github_badeg_bot_all?style=social)
![GitHub issues](https://img.shields.io/github/issues/sneaker-dev/github_badeg_bot_all)
![GitHub license](https://img.shields.io/github/license/sneaker-dev/github_badeg_bot_all)

**⭐ If you find this project useful, please give it a star! It helps others discover the project. ⭐**

</div>

---

> 🏆 **Automatically earn all 6 GitHub achievement badges (up to x4 level) with this powerful automation bot!**

A fully automated GitHub bot that helps you earn **all GitHub achievement badges** while maintaining an active repository. Features automated PR creation, badge management, code reviews, and intelligent workflow automation.

## ✨ Why Use This Bot?

- 🎯 **Earn All Badges**: Automatically earn Pair Extraordinaire, Pull Shark, Quickdraw, YOLO, Starstruck, and Galaxy Brain badges
- 🤖 **Fully Automated**: Set it up once and let it run - no manual intervention needed
- ⚡ **Smart & Efficient**: Built-in rate limit protection and error handling
- 🔧 **Highly Configurable**: Customize every aspect via environment variables
- 📊 **Production Ready**: TypeScript, robust error handling, and comprehensive logging

## 🌟 Features

### 🤖 Automated Pull Request Creation
- **Pluggable Strategy System**: Easily swap strategies for different PR creation patterns
- **Default Strategy**: Automatically touches README files to create PRs
- **Customizable Branch Names**: Configurable branch prefix and naming patterns
- **Auto-merge Support**: Automatically merge PRs with configurable merge methods (merge, squash, rebase)
- **Auto-review**: Automatically review and approve your own PRs

### 🏆 GitHub Badge Management
Automatically earn all GitHub achievement badges:

- **Pair Extraordinaire** (x4): Co-authored commits with another user
- **Pull Shark** (x4): Merged pull requests
- **Quickdraw** (x4): Fast PR reviews within 1 hour
- **YOLO** (x4): Auto-merged pull requests
- **Starstruck** (x4): Stars added to repositories
- **Galaxy Brain** (x4): Accepted answers in GitHub Discussions
  - Creates new repositories for each discussion (32 total for Platinum)
  - Fully automated with two-user collaboration
  - Auto-cleanup of created repositories after completion

### 📝 Master Flow
- Automatically edits files on the master branch
- Creates PRs from master to default branch
- Configurable interval and commit messages

### 🐛 Issue Flow
- Automatically creates issues with custom labels
- Virtual certificate generation
- Configurable templates with timestamp variables

### 👀 Review Flow
- Automatically reviews open pull requests
- Configurable review events (APPROVE, COMMENT, REQUEST_CHANGES)
- Rate limit protection
- Can run independently or alongside other flows

### 🔧 Advanced Configuration
- **Commit Message Templates**: Support for `${timestamp}`, `${random}`, `${date}`, `${time}` variables
- **Co-author Support**: Add co-authors to commits for Pair Extraordinaire badge
- **GitHub App Support**: Use GitHub App authentication or Personal Access Tokens
- **Rate Limit Management**: Built-in rate limit checking and retry logic
- **Error Handling**: Robust error handling with retry mechanisms
- **Automatic Topic Management**: 
  - Adds first topic immediately on startup
  - Then adds one new topic every hour automatically
  - Tracks progress in `.topics-state.json`
  - Gradually builds up repository topics for better discoverability
- **Auto-Star Repository**: Automatically stars your own repository on startup

### 🛠️ Diagnostic Tools
- **Badge Status Checker**: Check your current badge counts
- **Galaxy Brain Diagnostics**: Detailed diagnostics for Galaxy Brain badge setup
- **GraphQL API Testing**: Test GraphQL API access and permissions

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Create a `.env` file with the following variables:

```env
# Required
GITHUB_TOKEN=your_github_token_here
GITHUB_OWNER=your_github_username_or_org
GITHUB_REPO=your_repository_name
DEFAULT_BRANCH=main

# Optional: Second token for Galaxy Brain badge (full automation)
GITHUB_TOKEN_2=your_second_user_token_here

# Badge Management
BADGE_MANAGEMENT_ENABLED=true
BADGE_TARGET_COUNT=4
BADGE_MANAGEMENT_INTERVAL_SECONDS=3600

# Auto-merge (for YOLO badge)
AUTO_MERGE=true
MERGE_METHOD=squash

# Co-author (for Pair Extraordinaire badge)
CO_AUTHOR_ENABLED=true
CO_AUTHOR_NAME=Co-Author Name
CO_AUTHOR_EMAIL=coauthor@example.com

# Review Flow
REVIEW_FLOW=true
REVIEW_INTERVAL_SECONDS=60

# Master Flow
MASTER_FLOW=true
MASTER_INTERVAL_SECONDS=30

# Issue Flow
ISSUE_FLOW=true
ISSUE_INTERVAL_SECONDS=60
```

### 3. Run

**Development:**
```bash
npm run dev
```

> **Note:** When you run `npm run dev`, the bot will automatically:
> 1. 🔄 **Reload github-badge-bot module**: Removes and reinstalls the latest version of `github-badge-bot` from npm
> 2. ⭐ **Star your repository**: Automatically stars your repository
> 3. 🏷️ **Add GitHub topics gradually**:
>    - Adds the first topic immediately
>    - Then adds one new topic every hour
>    - Tracks progress to avoid duplicates
>    - Gradually builds up to 15+ topics for better discoverability
> 4. 🚀 **Start the bot**: Runs all configured flows (badge management, PR creation, reviews, etc.)
> 
> You can also manually add all topics at once using: `npm run add-topics`

**Production:**
```bash
npm run build
npm start
```

## 📋 Available Scripts

- `npm run dev` - Start development server (reloads github-badge-bot module, adds GitHub topics, and stars repo)
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm run diagnose` - Run Galaxy Brain badge diagnostics
- `npm run test-graphql` - Test GraphQL API access
- `npm run check-badges` - Check your current badge status
- `npm run check-galaxy-brain` - Detailed Galaxy Brain badge check
- `npm run add-topics` - Manually add GitHub topics to your repository
- `npm run master-flow` - Run master flow only
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## 🎯 Badge Earning Guide

### Pair Extraordinaire Badge
Enable co-author in commits:
```env
CO_AUTHOR_ENABLED=true
CO_AUTHOR_NAME=Your Co-Author Name
CO_AUTHOR_EMAIL=coauthor@example.com
```

### Pull Shark Badge
Automatically earned by merging PRs. The bot creates and merges PRs automatically.

### Quickdraw Badge
Enable review flow to review PRs quickly:
```env
REVIEW_FLOW=true
REVIEW_INTERVAL_SECONDS=60
```

### YOLO Badge
Enable auto-merge:
```env
AUTO_MERGE=true
MERGE_METHOD=squash
```

### Starstruck Badge
Automatically earned by starring repositories.

### Galaxy Brain Badge
Requires two tokens for full automation:
1. Enable Discussions in your repository
2. Set `GITHUB_TOKEN_2` in `.env`
3. Enable badge management:
```env
BADGE_MANAGEMENT_ENABLED=true
GITHUB_TOKEN_2=your_second_user_token
```

The bot will:
- Create 32 new repositories (one per discussion)
- User 2 creates discussions
- User 1 provides answers
- User 2 accepts answers
- Automatically delete all created repositories after completion

## 📝 Commit Message Configuration

Commit messages support template variables:

- `${timestamp}` - ISO timestamp (e.g., `2024-01-15T10:30:45.123Z`)
- `${random}` - Random alphanumeric string (6 characters)
- `${date}` - Date in YYYY-MM-DD format
- `${time}` - Time in HH:MM:SS format

### Examples

```env
COMMIT_MESSAGE_TEMPLATE=chore: automated update at ${timestamp}
MASTER_COMMIT_MESSAGE_TEMPLATE=chore: update test.txt [${date} ${time}]
CREDITS_COMMIT_MESSAGE_TEMPLATE=docs: update credits [${random}]
```

## 🔐 Token Permissions

Your GitHub tokens need these permissions:

- `repo` - Full control of private repositories
- `write:discussion` - Write access to discussions (for Galaxy Brain badge)

## 📚 Project Structure

```
├── src/
│   ├── flows/          # Different workflow flows
│   │   ├── badgeManagementFlow.ts    # Badge earning logic
│   │   ├── reviewFlow.ts             # PR review automation
│   │   ├── masterEditFlow.ts         # Master branch editing
│   │   └── issueFlow.ts              # Issue creation
│   ├── strategies/     # Pluggable PR creation strategies
│   ├── github.ts       # GitHub API wrapper
│   ├── config.ts       # Configuration management
│   └── index.ts        # Main entry point
├── scripts/            # Utility scripts
└── dist/              # Compiled JavaScript
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[MIT License](LICENSE) - Feel free to use this project for your own purposes!

## 🙏 Support

If this project helped you earn GitHub badges or maintain an active repository:

- ⭐ **Star this repository** - It helps others discover the project
- 🐛 **Report bugs** - Help improve the bot
- 💡 **Suggest features** - Share your ideas
- 📢 **Share with others** - Spread the word!

---

<div align="center">

**Made with ❤️ for the GitHub community**

⭐ **Star this repo if you find it useful!** ⭐

</div>

## ⚠️ Important Notes

- This bot creates real GitHub activity. Use responsibly.
- Ensure you have proper permissions for all operations.
- Rate limits are managed automatically, but be aware of GitHub's limits.
- Galaxy Brain badge requires public repositories for discussions.

## 🆘 Troubleshooting

### Badge Not Appearing
- Run `npm run diagnose` to check setup
- Verify token permissions
- Check that Discussions are enabled (for Galaxy Brain)
- Wait 24 hours for badge sync

### Rate Limit Issues
- The bot automatically checks and respects rate limits
- Increase intervals if needed
- Use multiple tokens for different operations

### GraphQL Errors
- Ensure tokens have `write:discussion` scope
- Verify Discussions are enabled in repository
- Check repository visibility (must be public for Galaxy Brain)

---

⭐ **If you find this project useful, please give it a star!** ⭐
