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

  it('shows a checking-access placeholder and fetches nothing while roleLoading', () => {
    render(<AdminView role={null} roleLoading={true} />);

    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
    expect(adminApiClient.listAccounts).not.toHaveBeenCalled();
    expect(adminApiClient.getKillswitch).not.toHaveBeenCalled();
  });

  it('shows an access-denied notice for a non-admin role and never calls the admin API', () => {
    render(<AdminView role="user" roleLoading={false} />);

    expect(screen.getByText(/don.t have admin access/i)).toBeInTheDocument();
    expect(adminApiClient.listAccounts).not.toHaveBeenCalled();
    expect(adminApiClient.getKillswitch).not.toHaveBeenCalled();
  });

  it('renders the fetched accounts as cards, including their quotas', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([fakeAccount()]);
    const { container } = render(<AdminView role="admin" roleLoading={false} />);

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    const quotaPills = [...container.querySelectorAll('.account-card__quotas .project-card__stat')].map((el) => el.textContent);
    expect(quotaPills).toEqual(['5 films', '5 projects', '2 concurrent']);
  });

  it('shows account/enabled/admin summary stats', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([
      fakeAccount({ uid: 'u1', label: 'Alice', role: 'admin' }),
      fakeAccount({ uid: 'u2', label: 'Carol', disabled: true }),
    ]);
    const { container } = render(<AdminView role="admin" roleLoading={false} />);

    await screen.findByText('Carol');
    const stats = [...container.querySelectorAll('.admin-stat')].map((el) => el.textContent);
    expect(stats).toEqual(['2accounts', '1enabled', '1admin']);
  });

  it('opens the provision modal, submits it with the entered payload, and prepends the new account', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([]);
    const created = fakeAccount({ uid: 'u2', email: 'bob@example.com', label: 'Bob', role: 'admin' });
    vi.mocked(adminApiClient.createAccount).mockResolvedValue(created);
    render(<AdminView role="admin" roleLoading={false} />);

    await screen.findByText(/no accounts yet/i);
    await userEvent.click(screen.getByRole('button', { name: /\+ provision account/i }));

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
    // Modal itself closed after a successful submit.
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it('opens the edit modal pre-filled with the account, and saves changes', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([fakeAccount()]);
    const updated = fakeAccount({ label: 'Alice B.', quotas: { maxFilms: 9, maxProjects: 5, maxConcurrentAgentRuns: 2 } });
    vi.mocked(adminApiClient.updateAccount).mockResolvedValue(updated);
    render(<AdminView role="admin" roleLoading={false} />);

    await screen.findByText('Alice');
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByLabelText(/^label$/i)).toHaveValue('Alice');
    expect(screen.getByLabelText(/max films/i)).toHaveValue(5);

    await userEvent.clear(screen.getByLabelText(/^label$/i));
    await userEvent.type(screen.getByLabelText(/^label$/i), 'Alice B.');
    await userEvent.clear(screen.getByLabelText(/max films/i));
    await userEvent.type(screen.getByLabelText(/max films/i), '9');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(adminApiClient.updateAccount).toHaveBeenCalledWith('u1', {
        label: 'Alice B.',
        role: 'user',
        quotas: { maxFilms: 9, maxProjects: 5, maxConcurrentAgentRuns: 2 },
      }),
    );
    expect(await screen.findByText('Alice B.')).toBeInTheDocument();
  });

  it('requires going through the confirm modal before the killswitch toggle calls the API', async () => {
    vi.mocked(adminApiClient.listAccounts).mockResolvedValue([]);
    vi.mocked(adminApiClient.getKillswitch).mockResolvedValue(fakeKillswitch({ enabled: false }));
    vi.mocked(adminApiClient.setKillswitch).mockResolvedValue(fakeKillswitch({ enabled: true }));
    render(<AdminView role="admin" roleLoading={false} />);

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
