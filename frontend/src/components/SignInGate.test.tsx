import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInGate } from './SignInGate';
import { signInWithEmailAndPassword } from 'firebase/auth';

vi.mock('../firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
}));

describe('SignInGate', () => {
  beforeEach(() => {
    vi.mocked(signInWithEmailAndPassword).mockReset();
  });

  it('renders email and password fields and a submit button', () => {
    render(<SignInGate />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  it('calls signInWithEmailAndPassword with the entered credentials on submit', async () => {
    vi.mocked(signInWithEmailAndPassword).mockResolvedValue(undefined as never);
    render(<SignInGate />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'admin@example.com', 'secret');
  });

  it('shows a friendly error message when sign-in is rejected', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({ code: 'auth/wrong-password' });
    render(<SignInGate />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
  });

  it('shows a generic error message for an unrecognized error code', async () => {
    vi.mocked(signInWithEmailAndPassword).mockRejectedValue({ code: 'auth/network-request-failed' });
    render(<SignInGate />);
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/failed to sign in/i);
  });

  it('does not submit when the fields are empty', async () => {
    render(<SignInGate />);
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});
