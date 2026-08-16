import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasscodeGate } from './PasscodeGate';
import * as apiClient from '../api/apiClient';

vi.mock('../api/apiClient');

describe('PasscodeGate', () => {
  beforeEach(() => {
    vi.mocked(apiClient.verifyPasscode).mockReset();
  });

  it('renders an input and a submit button', () => {
    render(<PasscodeGate onUnlock={() => {}} />);
    expect(screen.getByLabelText(/passcode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  it('calls onUnlock with the entered passcode once the backend confirms it', async () => {
    vi.mocked(apiClient.verifyPasscode).mockResolvedValue({ ok: true });
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText(/passcode/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(onUnlock).toHaveBeenCalledWith('secret');
  });

  it('does not call onUnlock or the backend when the field is empty', async () => {
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
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
    await userEvent.type(screen.getByLabelText(/passcode/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid passcode/i);
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
