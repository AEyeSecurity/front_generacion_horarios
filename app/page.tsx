// app/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function Home() {
  const me = await getCurrentUser();
  redirect(me ? '/dashboard' : '/login');
}
