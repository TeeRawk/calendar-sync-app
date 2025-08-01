# Vercel Deployment Guide

## ✅ Pre-Deployment Validation

Run this endpoint to check if everything is ready for Vercel deployment:

```bash
curl https://your-domain.vercel.app/api/debug/vercel-deployment-check
```

## 🚀 Deployment Steps

### 1. Environment Variables
Ensure these environment variables are set in Vercel dashboard:

**Required:**
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret  
- `NEXTAUTH_URL` - Your production URL (e.g., https://your-app.vercel.app)
- `NEXTAUTH_SECRET` - Random secret for NextAuth.js
- `DATABASE_URL` - Neon/PostgreSQL connection string

**Optional:**
- `CRON_SECRET` - Bearer token for additional cron job security

### 2. Vercel Configuration
The `vercel.json` file includes two cron jobs:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 0 1 * *",
      "_comment": "Monthly sync: 1st of every month at midnight UTC"
    },
    {
      "path": "/api/cron/cleanup", 
      "schedule": "0 2 * * 0",
      "_comment": "Weekly cleanup: Every Sunday at 2 AM UTC"
    }
  ]
}
```

### 3. Google OAuth Setup
Update your Google OAuth consent screen with production domain:
- Authorized domains: `your-domain.vercel.app`
- Redirect URIs: `https://your-domain.vercel.app/api/auth/callback/google`

## 🔍 Post-Deployment Verification

### 1. Check Overall Health
```bash
curl https://your-domain.vercel.app/api/debug/vercel-deployment-check
```

### 2. Test Cron Jobs
```bash
# Test sync cron job
curl https://your-domain.vercel.app/api/cron/sync

# Test cleanup cron job  
curl https://your-domain.vercel.app/api/cron/cleanup
```

### 3. Check Auth State
```bash
curl https://your-domain.vercel.app/api/debug/check-auth-state
```

## 🔧 Cron Job Features

### Monthly Sync (`/api/cron/sync`)
- **When**: 1st of every month at midnight UTC
- **What**: Syncs all active calendar feeds to Google Calendar
- **Security**: Vercel cron user-agent detection + optional Bearer token
- **Monitoring**: Detailed logging with execution time

### Weekly Cleanup (`/api/cron/cleanup`)  
- **When**: Every Sunday at 2 AM UTC
- **What**: Removes expired sessions and orphaned auth records
- **Security**: Vercel cron user-agent detection + optional Bearer token
- **Monitoring**: Detailed cleanup report

## 🛡️ Security Features

### Cron Job Protection
Both cron jobs are protected with:
1. **User-Agent Detection**: Only allows `vercel-cron` user agent in production
2. **Optional Bearer Token**: Set `CRON_SECRET` for additional security
3. **Environment Validation**: Validates required environment variables

### Authentication Safety  
- **Automatic cleanup**: Prevents orphaned auth records
- **Error handling**: Graceful failure with proper logging
- **Account linking**: Prevents `OAuthAccountNotLinked` errors

## 📊 Monitoring Endpoints

- `/api/debug/vercel-deployment-check` - Comprehensive deployment validation
- `/api/debug/cron-status` - Check if cron jobs are accessible
- `/api/debug/check-auth-state` - Monitor database auth health
- `/api/debug/cleanup-orphans` - Manual cleanup trigger

## 🚨 Troubleshooting

### Cron Jobs Not Running
1. Check Vercel dashboard → Functions → Crons
2. Verify `vercel.json` is in project root
3. Check function logs for errors

### Authentication Issues
1. Run `/api/debug/cleanup-orphans` to clean orphaned records
2. Use `/api/debug/nuclear-reset` for complete reset (careful!)
3. Check Google OAuth configuration

### Database Issues
1. Verify `DATABASE_URL` is correct
2. Check Neon dashboard for connection limits
3. Run `/api/debug/check-auth-state` to verify connectivity

## ✅ Success Indicators

When properly deployed, you should see:
- `vercelReady: true` in deployment check
- Both cron jobs return 200 status
- Auth state shows proper user/account relationships
- No missing environment variables

The app is now ready for production use with automatic monthly syncing and weekly maintenance! 🎉