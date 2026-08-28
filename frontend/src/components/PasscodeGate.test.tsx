import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasscodeGate, PASSCODE_STORAGE_KEY } from './PasscodeGate';
import * as apiClient from '../api/apiClient';

vi.mock('../api/apiClient');

describe('PasscodeGate', () => {
  beforeEach(() => {
    vi.mocked(apiClient.verifyPasscode).mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders an input and a submit button', () => {
    render(<PasscodeGate onUnlock={() => {}} />);
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('calls onUnlock with the entered passcode once the backend confirms it', async () => {
    vi.mocked(apiClient.verifyPasscode).mockResolvedValue({ ok: true });
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(onUnlock).toHaveBeenCalledWith('secret');
  });

  it('does not call onUnlock or the backend when the field is empty', async () => {
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(onUnlock).not.toHaveBeenCalled();
    expect(apiClient.verifyPasscode).not.toHaveBeenCalled();
  });

  it('shows an inline error and does not call onUnlock when the backend rejects the passcode', async () => {
    vi.mocked(apiClient.verifyPasscode).mockResolvedValue({
      ok: false,
      message: 'invalid passcode',
    });
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid passcode/i);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  describe('remembered passcode', () => {
    it('saves the passcode to localStorage after a successful manual submit', async () => {
      vi.mocked(apiClient.verifyPasscode).mockResolvedValue({ ok: true });
      render(<PasscodeGate onUnlock={() => {}} />);
      await userEvent.type(screen.getByLabelText(/password/i), 'secret');
      await userEvent.click(screen.getByRole('button', { name: /log in/i }));
      expect(localStorage.getItem(PASSCODE_STORAGE_KEY)).toBe('secret');
    });

    it('does not call verifyPasscode automatically when nothing is saved', () => {
      render(<PasscodeGate onUnlock={() => {}} />);
      expect(apiClient.verifyPasscode).not.toHaveBeenCalled();
    });

    it('auto-unlocks using a passcode saved in localStorage, without user interaction', async () => {
      localStorage.setItem(PASSCODE_STORAGE_KEY, 'remembered');
      vi.mocked(apiClient.verifyPasscode).mockResolvedValue({ ok: true });
      const onUnlock = vi.fn();
      render(<PasscodeGate onUnlock={onUnlock} />);
      await waitFor(() => expect(onUnlock).toHaveBeenCalledWith('remembered'));
    });

    it('clears a stale saved passcode and shows the form when auto-verification fails', async () => {
      localStorage.setItem(PASSCODE_STORAGE_KEY, 'stale');
      vi.mocked(apiClient.verifyPasscode).mockResolvedValue({ ok: false, message: 'invalid passcode' });
      const onUnlock = vi.fn();
      render(<PasscodeGate onUnlock={onUnlock} />);
      await waitFor(() => expect(apiClient.verifyPasscode).toHaveBeenCalledWith('stale'));
      expect(onUnlock).not.toHaveBeenCalled();
      expect(localStorage.getItem(PASSCODE_STORAGE_KEY)).toBeNull();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });
  });
});
