import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderSettings } from './HeaderSettings';

describe('HeaderSettings', () => {
  it('renders a settings button and keeps the panel closed initially', () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/test mode/i)).not.toBeInTheDocument();
  });

  it('opens the panel when the settings button is clicked', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByLabelText(/test mode/i)).toBeInTheDocument();
  });

  it('closes the panel when the settings button is clicked again', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    const button = screen.getByRole('button', { name: /settings/i });
    await userEvent.click(button);
    await userEvent.click(button);
    expect(screen.queryByLabelText(/test mode/i)).not.toBeInTheDocument();
  });

  it('reflects the current testMode value in the checkbox', async () => {
    render(<HeaderSettings testMode={false} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByLabelText(/test mode/i)).not.toBeChecked();
  });

  it('calls onTestModeChange when the checkbox is toggled', async () => {
    const onTestModeChange = vi.fn();
    render(<HeaderSettings testMode={true} onTestModeChange={onTestModeChange} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByLabelText(/test mode/i));
    expect(onTestModeChange).toHaveBeenCalledWith(false);
  });
});
