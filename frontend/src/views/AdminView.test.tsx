import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminView } from './AdminView';
import * as adminApiClient from '../api/adminApiClient';
import type { Account, KillswitchState } from '../api/adminApiClient';

vi.mock('../api/adminApiClient');

function fakeAccount(overrides: Partial<Account> = {}): Account {
  return {
    uid: 'u1',
    email: 'alice@example.com',
    role: 'user',
    label: 'Alice',
    quotas: { maxFilms: 5, maxProjects: 5, maxConcurrentAgentRuns: 2 },
    disabled: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    callCount24h: 3,
    lastCallAt: '2026-09-06T12:00:00.000Z',
    lastEndpoint: '/api/films',
    ...overrides,
  };
}

function fakeKillswitch(overrides: Partial<KillswitchState> = {}): KillswitchState {
  return { enabled: false, ...overrides };
}

describe('AdminView', () => {
  beforeEach(() => {
    vi.mocked(adminApiClient.listAccounts).mockReset();
    vi.mocked(adminApiClient.createAccount).mockReset();
    vi.mocked(adminApiClient.updateAccount).mockReset();
    vi.mocked(adminApiClient.deleteAccount).mockReset();
    vi.mocked(adminApiClient.getKillswitch).mockReset();
    vi.mocked(adminApiClient.setKillswitch).mockReset();
    vi.mocked(adminApiClient.listActivity).mockReset();

    vi.mocked(adminApiClient.getKillswitch).mockResolvedValue(fakeKillswitch());
    vi.mocked(adminApiClient.listActivity).mockResolvedValue([]);
  });

  it('renders the fetched accounts in the table', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([fakeAccount()]);
    render(<AdminView />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('submits the provision form with the entered payload and prepends the new account', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([]);
    const created = fakeAccount({ uid: 'u2', email: 'bob@example.com', label: 'Bob', role: 'admin' });
    vi.mocked(adminApiClient.createAccount).mockResolvedValue(created);
    render(<AdminView />);

    await screen.findByText(/no accounts yet/i);

    await userEvent.type(screen.getByLabelText(/email/i), 'bob@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'hunter2');
    await userEvent.type(screen.getByLabelText(/label/i), 'Bob');
    await userEvent.selectOptions(screen.getByLabelText(/role/i), 'admin');
    await userEvent.click(screen.getByRole('button', { name: /^provision account$/i }));

    await waitFor(() =>
      expect(adminApiClient.createAccount).toHaveBeenCalledWith({
        email: 'bob@example.com',
        password: 'hunter2',
        label: 'Bob',
        role: 'admin',
        quotas: { maxFilms: 5, maxProjects: 5, maxConcurrentAgentRuns: 2 },
      }),
    );
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/account created for bob@example.com/i)).toBeInTheDocument();
  });

  it('requires going through the confirm modal before the killswitch toggle calls the API', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([]);
    vi.mocked(adminApiClient.getKillswitch).mockResolvedValue(fakeKillswitch({ enabled: false }));
    vi.mocked(adminApiClient.setKillswitch).mockResolvedValue(fakeKillswitch({ enabled: true }));
    render(<AdminView />);

    const toggleButton = await screen.findByRole('button', { name: /turn on killswitch/i });
    await userEvent.click(toggleButton);

    // Clicking the toggle alone must not call the API — only the modal's own
    // confirm button does.
    expect(adminApiClient.setKillswitch).not.toHaveBeenCalled();
    expect(await screen.findByLabelText(/reason/i)).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: /turn on killswitch/i });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(adminApiClient.setKillswitch).toHaveBeenCalledWith({ enabled: true, reason: undefined }));
  });
});
