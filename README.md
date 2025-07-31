# Calendar Sync App

A fullstack React application that automatically syncs ICS calendar feeds to Google Calendar every month.

## Features

- 🔄 **Automatic Monthly Sync**: Events sync automatically on the 1st of each month
- 🔒 **Privacy-First**: Events are copied without attendees for privacy
- 📅 **Multiple Sources**: Support for multiple ICS feeds to different Google calendars
- 🎨 **Clean UI**: Minimalistic and bright design
- ☁️ **Vercel Ready**: Fully deployable on Vercel with Postgres database

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, NextAuth.js
- **Database**: Vercel Postgres with Drizzle ORM
- **Authentication**: Google OAuth 2.0
- **APIs**: Google Calendar API, ICS parsing
- **Deployment**: Vercel with automatic cron jobs

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Update `.env.local` with your values:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-change-this-in-production

# Database (for Neon or Vercel Postgres)
DATABASE_URL=your-postgres-connection-string

# Optional: Vercel Postgres env vars (auto-populated when using Vercel Postgres)
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=
POSTGRES_USER=
POSTGRES_HOST=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=

# Optional: Cron job security
CRON_SECRET=your-cron-secret
```

### 3. Database Setup

Generate and run database migrations:

```bash
npm run db:generate
npm run db:migrate
```

### 4. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.vercel.app/api/auth/callback/google` (production)

### 5. Run Development Server

```bash
npm run dev
```

## Deployment on Vercel

### 1. Deploy to Vercel

```bash
npx vercel
```

### 2. Add Vercel Postgres

1. Go to your Vercel dashboard
2. Select your project → Storage → Create Database
3. Choose Postgres
4. Environment variables will be auto-populated

### 3. Run Database Migrations

```bash
npx vercel env pull .env.local
npm run db:generate
npm run db:migrate
```

### 4. Configure Production Environment

Update your Google OAuth settings with the production domain and ensure all environment variables are set in Vercel.

## How It Works

1. **Authentication**: Users sign in with Google OAuth
2. **Calendar Access**: App requests Google Calendar permissions
3. **ICS Parsing**: Fetches and parses ICS calendar feeds
4. **Event Sync**: Creates copies of events (without attendees) in Google Calendar
5. **Automatic Sync**: Vercel cron job runs monthly to sync all active calendars

## API Endpoints

- `GET /api/calendars` - Get user's Google calendars
- `GET /api/syncs` - Get user's calendar syncs
- `POST /api/syncs` - Create new calendar sync
- `DELETE /api/syncs/[id]` - Delete calendar sync
- `POST /api/syncs/[id]/sync` - Manual sync trigger
- `GET /api/cron/sync` - Cron job endpoint (runs monthly)

## Database Schema

- **users**: User accounts
- **accounts**: OAuth account connections
- **sessions**: User sessions
- **calendar_syncs**: Calendar sync configurations
- **sync_logs**: Sync operation history

## Security Features

- Google OAuth 2.0 authentication
- User-specific data isolation
- Optional cron job secret verification
- No sensitive data in client-side code

## Performance

- Server-side rendering with Next.js
- Efficient database queries with Drizzle ORM
- Optimized API calls to Google Calendar
- Automatic error handling and retry logic

## Support

For issues or questions, please check the code comments or create an issue in the repository.