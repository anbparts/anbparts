'use client';

export type DetranAuthUser = {
  username?: string | null;
  displayName?: string | null;
} | null | undefined;

export function isDetranAllowedUser(user: DetranAuthUser) {
  return String(user?.username || '').trim().toLowerCase() === 'bruno';
}
