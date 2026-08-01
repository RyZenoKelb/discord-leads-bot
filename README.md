# Discord Leads Bot

Private Discord bot for local lead generation and prospect management.

The bot searches for businesses using the Google Places API, stores the results and helps organize the sales workflow directly inside Discord.

## Overview

The project includes:

- Local business search by city, category and radius
- Google Places and Geocoding API integration
- Lead filtering and deduplication
- Automatic lead scoring
- Prioritized call queue
- Lead status management
- Follow-up reminders
- Automatic statistics
- CSV export
- Discord slash commands and interactive buttons

The bot was originally created to help find French-speaking businesses in Israel, but its architecture can be adapted to other locations and business categories.

## Technologies

- TypeScript
- Node.js
- Discord.js
- SQLite
- Google Places API
- Google Geocoding API

## Technical features

- Modular command architecture
- Persistent lead database
- Automatic database migrations
- Lead scoring pipeline
- API rate limiting
- Scheduled background jobs
- Transaction-based status updates
- CSV generation
- Environment-based configuration

## Main workflow

1. Search for businesses in a selected location
2. Filter and score the results
3. Store leads in the database
4. Display them in Discord
5. Assign statuses and follow-up dates
6. Export or review sales statistics

## Project status

The project is functional and used as an internal tool.

Some parts may continue to evolve, including:

- Additional data sources
- More advanced lead enrichment
- PostgreSQL support
- Improved analytics
- External dashboard integration

## Repository notice

This repository contains a private personal project.

The source code is shared for portfolio, recruitment and technical evaluation purposes only.

## License

Copyright © 2026 Gabriel Sdika.

All rights reserved.

No part of this repository may be copied, modified, distributed, published, sublicensed or used commercially without prior written permission from the author.
