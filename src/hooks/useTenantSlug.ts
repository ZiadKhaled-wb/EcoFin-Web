import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const clean = (v: string) => v.trim().toLowerCase();

/**
 * Decision 2 (A + B): `?tenant=` wins, then localStorage, else the user types it.
 * `locked` = we already know the slug, so show it as read-only context.
 */
export function useTenantSlug() {
  const [params] = useSearchParams();
  const stored = useAuthStore((s) => s.tenantSlug);

  const fromUrl = clean(params.get('tenant') ?? '');
  const initial = SLUG_RE.test(fromUrl) ? fromUrl : (stored ?? '');

  const [slug, setSlug] = useState(initial);
  const [locked, setLocked] = useState(initial !== '');

  return {
    slug,
    setSlug: (v: string) => setSlug(clean(v)),
    locked,
    unlock: () => setLocked(false),
  };
}
