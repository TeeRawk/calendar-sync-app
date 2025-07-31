// Simple in-memory storage for local development
// In production, this would use the database

interface CalendarSync {
  id: string;
  userId: string;
  name: string;
  icsUrl: string;
  googleCalendarId: string;
  googleCalendarName?: string;
  isActive: boolean;
  lastSync: string | null;
  syncErrors: string[] | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory storage
let syncs: CalendarSync[] = [];
let syncCounter = 1;

export const localStore = {
  // Calendar syncs
  createSync: (userId: string, data: Omit<CalendarSync, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastSync' | 'syncErrors'>) => {
    const sync: CalendarSync = {
      id: `sync_${syncCounter++}`,
      userId,
      ...data,
      isActive: true,
      lastSync: null,
      syncErrors: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    syncs.push(sync);
    return sync;
  },

  getUserSyncs: (userId: string) => {
    return syncs.filter(sync => sync.userId === userId);
  },

  deleteSync: (syncId: string, userId: string) => {
    syncs = syncs.filter(sync => !(sync.id === syncId && sync.userId === userId));
  },

  updateSync: (syncId: string, userId: string, updates: Partial<CalendarSync>) => {
    const index = syncs.findIndex(sync => sync.id === syncId && sync.userId === userId);
    if (index !== -1) {
      syncs[index] = { ...syncs[index], ...updates, updatedAt: new Date().toISOString() };
      return syncs[index];
    }
    return null;
  },

  getSync: (syncId: string, userId: string) => {
    return syncs.find(sync => sync.id === syncId && sync.userId === userId) || null;
  },
};