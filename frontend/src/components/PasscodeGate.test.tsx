import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasscodeGate } from './PasscodeGate';

describe('PasscodeGate', () => {
  it('renders an input and a submit button', () => {
    render(<PasscodeGate onUnlock={() => {}} />);
    expect(screen.getByLabelText(/passcode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument();
  });

  it('calls onUnlock with the entered passcode on submit', async () => {
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.type(screen.getByLabelText(/passcode/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(onUnlock).toHaveBeenCalledWith('secret');
  });

  it('does not call onUnlock when the field is empty', async () => {
    const onUnlock = vi.fn();
    render(<PasscodeGate onUnlock={onUnlock} />);
    await userEvent.click(screen.getByRole('button', { name: /unlock/i }));
    expect(onUnlock).not.toHaveBeenCalled();
  });
});
