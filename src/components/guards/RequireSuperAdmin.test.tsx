import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import RequireSuperAdmin from './RequireSuperAdmin';
afterEach(() => useAuthStore.getState().clearSession());
describe('platform route guard', () => {
  it('blocks shop users with the existing forbidden page', () => {
    useAuthStore.setState({ isSuperAdmin: false });
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<RequireSuperAdmin />}>
            <Route path="/" element={<p>platform-only</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('platform-only')).not.toBeInTheDocument();
    expect(screen.getByText(t('shell.forbidden.title'))).toBeInTheDocument();
  });
  it('allows an active platform session', () => {
    useAuthStore.setState({ isSuperAdmin: true });
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<RequireSuperAdmin />}>
            <Route path="/" element={<p>platform-only</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('platform-only')).toBeInTheDocument();
  });
});
