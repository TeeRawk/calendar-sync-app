# Admin Panel Setup Guide

## Overview

The Calendar Sync App includes a complete admin panel for user management and system administration. This guide will help you set up and use the admin functionality.

## ✅ Admin Panel Features

- **User Management**: View, enable/disable users
- **Admin Authentication**: Secure credential-based login for admin users
- **Duplicate Cleanup**: Advanced duplicate calendar event cleanup tools
- **Role-Based Access**: Only admin users can access the admin panel

## 🚀 Quick Setup

### 1. Create Admin User

Run the admin user creation script:

```bash
# Create admin user with default credentials
npx tsx scripts/create-admin-user.ts

# Or create with custom credentials
npx tsx scripts/create-admin-user.ts admin@yourdomain.com your-secure-password
```

**Default Admin Credentials:**
- Email: `admin@calendar-sync.com`
- Password: `admin123456`

⚠️ **Important**: Change the default password after first login!

### 2. Access Admin Panel

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the admin panel:
   ```
   http://localhost:3000/admin
   ```

3. Sign in using the admin credentials created above

## 🔐 Security Features

### Authentication
- **Credential-based login**: Admins use email/password authentication
- **Session management**: Secure session handling with NextAuth
- **Password hashing**: Passwords are hashed using bcrypt (12 rounds)
- **Role verification**: Only users with `isAdmin: true` can access admin features

### Access Control
- **Route protection**: Admin routes require authentication and admin role
- **API endpoint protection**: All admin API endpoints verify admin status
- **User account control**: Admins can enable/disable user accounts

## 🎛️ Admin Panel Functionality

### User Management Tab
- **View all users**: Complete user list with details
- **User information**: Name, email, admin status, disabled status
- **Enable/Disable users**: Toggle user account access
- **Admin status display**: Shows which users have admin privileges

### Duplicate Cleanup Tab
- **Advanced cleanup tools**: Intelligent duplicate event detection
- **Batch operations**: Clean up multiple duplicates at once
- **Safe deletion**: Backup and restore capabilities

## 🛠️ Technical Implementation

### Database Schema
The admin functionality uses these database columns in the `users` table:
- `isAdmin: boolean` - Admin role flag
- `isDisabled: boolean` - Account enabled/disabled status  
- `passwordHash: text` - Hashed password for credential authentication

### API Endpoints
- `GET /api/admin/users` - List all users (admin only)
- `POST /api/admin/users/[id]/disable` - Enable/disable user (admin only)
- `POST /api/admin/cleanup-duplicates` - Duplicate cleanup operations

### Components
- `/app/admin/page.tsx` - Main admin dashboard
- `/components/admin/DuplicateCleanup.tsx` - Cleanup interface
- `/lib/auth.ts` - Authentication configuration with admin support

## 📝 Usage Examples

### Creating Additional Admin Users

```bash
# Create admin user for production
npx tsx scripts/create-admin-user.ts admin@yourcompany.com SecurePassword123!

# Update existing user to admin
npx tsx scripts/create-admin-user.ts existing@user.com NewPassword123!
```

### Managing Users
1. Access admin panel at `/admin`
2. Go to "User Management" tab
3. View user list and current status
4. Click "Disable" or "Enable" to toggle user access

## 🔧 Troubleshooting

### Can't Access Admin Panel
- Verify admin user was created successfully
- Check that `isAdmin` is `true` in database
- Ensure environment variables are properly configured

### Authentication Issues
- Verify `.env.local` contains `NEXTAUTH_SECRET`
- Check database connection is working
- Confirm password was set correctly

### Permission Denied
- Only users with `isAdmin: true` can access admin features
- Regular users will see "You are not authorized" message
- Use the admin creation script to grant admin privileges

## 🚨 Security Best Practices

1. **Change Default Passwords**: Always change default admin passwords
2. **Use Strong Passwords**: Minimum 8 characters with complexity
3. **Limit Admin Users**: Only grant admin access to trusted users
4. **Regular Audits**: Review user access periodically
5. **Monitor Access**: Check admin panel usage logs

## 📋 Environment Setup

Ensure these environment variables are configured in `.env.local`:

```env
DATABASE_URL=your-database-connection-string
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

## 🎯 Next Steps

After setting up the admin panel:

1. ✅ Create your admin user
2. ✅ Test admin panel access  
3. ✅ Change default password
4. ✅ Review user management features
5. ✅ Configure additional admin users as needed

The admin panel is now ready for production use with full user management and system administration capabilities!