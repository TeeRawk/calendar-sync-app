import { db } from '@/lib/db';
import { accounts, users, sessions } from '@/lib/db/schema';

export async function POST() {
  try {
    console.log('💥 NUCLEAR RESET - Clearing ALL authentication data');
    
    // Delete ALL accounts, sessions, and users for a completely fresh start
    await Promise.all([
      db.delete(accounts),
      db.delete(sessions),
      db.delete(users), // Delete users too for complete reset
    ]);
    
    console.log('✅ Nuclear reset complete - all auth data cleared');
    
    return Response.json({ 
      success: true, 
      message: 'Complete database reset performed. All authentication data cleared.' 
    });
  } catch (error) {
    console.error('❌ Nuclear reset failed:', error);
    return Response.json(
      { error: 'Failed to perform nuclear reset' },
      { status: 500 }
    );
  }
}