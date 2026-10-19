import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { walletsApi } from '@/services/walletsApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { USER_ID } from '@/test/authFixtures';
import CustomerCollectorCard from './CustomerCollectorCard';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const COLLECTOR = 'a0900000-0000-4000-8000-0000000000f1';
const customer = (over: Partial<Customer> = {}): Customer =>
  ({
    id: 'a0900000-0000-4000-8000-0000000000f2',
    full_name: 'Cairo Ahmed',
    collector: null,
    ...over,
  }) as Customer;

function as(keys: PermissionKey[]) {
  signIn('OWNER');
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
  vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
}

afterEach(() => {
  signOut();
  vi.restoreAllMocks();
});

describe('N06 customer collector card', () => {
  it('assigns a collector (the signed-in employee when the list is not allowed)', async () => {
    const user = userEvent.setup();
    as(['customer.edit', 'collection.create']);
    const set = vi.spyOn(walletsApi, 'setCollector').mockResolvedValue(customer());
    const changed = vi.fn();
    await renderApp(<CustomerCollectorCard customer={customer()} onChanged={changed} />, {
      lang: 'en',
    });
    expect(screen.getByTestId('customer-collector')).toHaveTextContent('No collector assigned');
    await user.click(await screen.findByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('You can only choose yourself');
    await user.selectOptions(await within(dialog).findByLabelText(/Collector/), USER_ID);
    await user.type(within(dialog).getByLabelText(/Reason/), 'East side');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(set).toHaveBeenCalledWith(customer().id, { employee_id: USER_ID, reason: 'East side' });
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it('shows the collector, and removes them after a confirmation', async () => {
    const user = userEvent.setup();
    as(['customer.edit']);
    const set = vi.spyOn(walletsApi, 'setCollector').mockResolvedValue(customer());
    await renderApp(
      <CustomerCollectorCard
        customer={customer({ collector: { id: COLLECTOR, name: 'Hany Collector' } })}
        onChanged={() => undefined}
      />,
      { lang: 'en' },
    );
    expect(screen.getByTestId('customer-collector')).toHaveTextContent('Hany Collector');
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(set).toHaveBeenCalledWith(customer().id, { employee_id: null });
  });

  it('shows the server refusal for an employee who cannot collect', async () => {
    const user = userEvent.setup();
    as(['customer.edit', 'collection.create']);
    vi.spyOn(walletsApi, 'setCollector').mockRejectedValue(
      new ApiError(422, 'COLLECTOR_INVALID', 'no'),
    );
    await renderApp(<CustomerCollectorCard customer={customer()} onChanged={() => undefined} />, {
      lang: 'en',
    });
    await user.click(await screen.findByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(await within(dialog).findByLabelText(/Collector/), USER_ID);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/can't be a collector/)).toBeVisible();
  });

  it('shows no buttons without customer.edit', async () => {
    as(['collection.create']);
    await renderApp(
      <CustomerCollectorCard
        customer={customer({ collector: { id: COLLECTOR, name: 'Hany Collector' } })}
        onChanged={() => undefined}
      />,
      { lang: 'en' },
    );
    expect(screen.getByTestId('customer-collector')).toHaveTextContent('Hany Collector');
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});
