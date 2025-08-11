'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = !!session?.user?.isAdmin;

  useEffect(() => {
    if (status === 'authenticated' && isAdmin) {
      fetchUsers();
    }
  }, [status, isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message || 'Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const toggleDisabled = async (id: string, disable: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDisabled: disable }),
      });
      if (!res.ok) throw new Error('Failed to update user');
      await fetchUsers();
    } catch (e: any) {
      setError(e.message || 'Update failed');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">Loading...</div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white border rounded-xl p-6 space-y-4">
          <h1 className="text-xl font-semibold">Admin Sign In</h1>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const email = String(fd.get('email'));
              const password = String(fd.get('password'));
              await signIn('credentials', { email, password, callbackUrl: '/admin' });
            }}
          >
            <input
              name="email"
              type="email"
              placeholder="Email"
              className="w-full border rounded-md px-3 py-2"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              className="w-full border rounded-md px-3 py-2"
              required
            />
            <Button type="submit" fullWidth>Sign in</Button>
          </form>
          <div className="text-xs text-gray-500">Only admin users can sign in here.</div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-gray-700">You are not authorized to view this page.</p>
          <Button onClick={() => signOut({ callbackUrl: '/' })}>Sign out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{session?.user?.email}</span>
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/' })}>Sign out</Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-md">{error}</div>
        )}

        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-0 font-medium text-sm bg-gray-50 border-b px-4 py-2">
            <div className="col-span-4">User</div>
            <div className="col-span-3">Email</div>
            <div className="col-span-2">Admin</div>
            <div className="col-span-2">Disabled</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          <div>
            {loading ? (
              <div className="p-4">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-gray-600">No users found.</div>
            ) : (
              users.map(u => (
                <div key={u.id} className="grid grid-cols-12 items-center px-4 py-3 border-b last:border-0">
                  <div className="col-span-4 truncate">{u.name || '—'}</div>
                  <div className="col-span-3 truncate">{u.email}</div>
                  <div className="col-span-2">{u.isAdmin ? 'Yes' : 'No'}</div>
                  <div className="col-span-2">{u.isDisabled ? 'Yes' : 'No'}</div>
                  <div className="col-span-1 text-right">
                    <Button
                      size="sm"
                      variant={u.isDisabled ? 'secondary' : 'outline'}
                      onClick={() => toggleDisabled(u.id, !u.isDisabled)}
                    >
                      {u.isDisabled ? 'Enable' : 'Disable'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
