import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { signIn, signOut } from '@/test/renderApp';
import GuestOnly from './GuestOnly';

function renderAt(entry: string | { pathname: string; state: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<p>login page</p>} />
        </Route>
        <Route path="/dashboard" element={<p>dashboard page</p>} />
        <Route path="/onboarding" element={<p>wizard page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuestOnly', () => {
  afterEach(() => signOut());

  it('shows the login page to guests', () => {
    renderAt('/login');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a signed-in user to the dashboard', () => {
    signIn();
    renderAt('/login');
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });

  it('P02: after an invite, the first login goes to the setup wizard', () => {
    signIn();
    renderAt({ pathname: '/login', state: { afterLogin: 'onboarding' } });
    expect(screen.getByText('wizard page')).toBeInTheDocument();
  });

  it('ignores any other after-login value', () => {
    signIn();
    renderAt({ pathname: '/login', state: { afterLogin: '/audit' } });
    expect(screen.getByText('dashboard page')).toBeInTheDocument();
  });
});
