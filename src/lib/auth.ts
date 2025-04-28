import { sha256 } from 'js-sha256';

export function hashPassword(password: string): string {
  return password; // Remove hashing for now as Supabase handles this internally
}