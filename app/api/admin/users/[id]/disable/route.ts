import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const me = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, session.user.id) });
  if (!me?.isAdmin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const isDisabled = !!body?.isDisabled;

  await db.update(users).set({ isDisabled }).where(eq(users.id, params.id));

  return NextResponse.json({ ok: true });
}
