# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Instructions

**Linkwarden is a self-hosted, open-source collaborative bookmark manager to collect, read, annotate, and fully preserve what matters, all in one place.**

The objective is to organize useful webpages and articles you find across the web in one place, and since useful webpages can go away (see the inevitability of [Link Rot](https://en.wikipedia.org/wiki/Link_rot)), Linkwarden also saves a copy of each webpage as a Screenshot and PDF, ensuring accessibility even if the original content is no longer available.

In addition to preservation, Linkwarden provides a user-friendly reading and annotation experience that blends the simplicity of a “read-it-later” tool with the reliability of a web archive. Whether you’re highlighting key ideas, jotting down thoughts, or revisiting content long after it’s disappeared from the web, Linkwarden keeps your knowledge accessible and organized.

Linkwarden is also designed with collaboration in mind, enabling you to share links with the public and/or collaborate seamlessly with multiple users.

- If you are technically stuck or unsure about the next step, ask for help.
- cocoindex is a complex beast, so don't hesitate to ask for clarification or guidance.
- Tests should be pytest at ./tests (NOT at ./python/cocoindex_code_mcp_server/tests).
- Tests should use pytest and pytest plugins only (i.e. don't use unittest).
- You MUST use our own RAG (MCP server 'cocoindex-rag') each time before using grep or search.
- Never try to start/stop our RAG MCP server, just ask, I will do it for you.
- Use gw-memory to store and retrieve information about the codebase.
  + Tag all entries with 'linkwarden' to indicate they are related to the code MCP server.
  + After you have been started, it is a good idea to retrieve what's has been stored lately, so you have the latest context.

## MCP tool usage

Don't use tool 'vscode-mcp-server - execute_shell_command_code (MCP)' because of
issues. Instead, use bash directly.

For editing file, use tool 'Opened changes in Visual Studio Code'. This is
much better than tool 'update'. But if you use tool 'update', don't forget to
use tool 'filesystem - read_text_file (MCP)' before that. Otherwise you get the
following error: File has not been read yet. Read it first before writing to it.

## DB connections

DB connection properties could be found in .env and should be loaded with load_dotenv.
There are many examples how to do this throughout our code.

## Features

- 📸 Auto capture a screenshot, PDF, and single html file of each webpage.
- 📖 Reader view of the webpage, with the ability to highlight and annotate text.
- 🏛️ Send your webpage to Wayback Machine ([archive.org](https://archive.org)) for a snapshot. (Optional)
- ✨ Local AI Tagging to automatically tag your links based on their content (Optional).
- 📂 Organize links by collection, sub-collection, name, description and multiple tags.
- 👥 Collaborate on gathering links in a collection.
- 🎛️ Customize the permissions of each member.
- 🌐 Share your collected links and preserved formats with the world.
- 📌 Pin your favorite links to dashboard.
- 🔍 Full text search, filter and sort for easy retrieval.
- 📱 Responsive design and supports most modern browsers.
- 🌓 Dark/Light mode support.
- 🧩 Browser extension. [Star it here!](https://github.com/linkwarden/browser-extension)
- 🔄 Browser Synchronization (using [Floccus](https://floccus.org)!)
- ⬇️ Import and export your bookmarks.
- 🔐 SSO integration. (Enterprise and Self-hosted users only)
- 📦 Installable Progressive Web App (PWA).
- 🍎 iOS Shortcut to save Links to Linkwarden.
- 🔑 API keys.
- ✅ Bulk actions.
- 👥 User administration.
- 🌐 Support for Other Languages (i18n).
- 📁 Image and PDF Uploads.
- 🎨 Custom Icons for Links and Collections.
- 🔔 RSS Feed Subscription.
- ✨ And many more features. (Literally!)
