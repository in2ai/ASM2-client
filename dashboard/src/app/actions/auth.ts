'use server';

import { redirect } from 'next/navigation';

export async function signOutAction() {
  redirect('/api/logto/sign-out');
}
