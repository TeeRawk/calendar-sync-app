import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // Only admins can access
  const me = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, session.user.id) });
  if (!me?.isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const all = await db.select({ id: users.id, name: users.name, email: users.email, image: users.image, isAdmin: users.isAdmin, isDisabled: users.isDisabled }).from(users);
  return NextResponse.json({ users: all });
}
