import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderSettings } from './HeaderSettings';

describe('HeaderSettings', () => {
  it('renders a settings button and keeps the modal closed initially', () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the modal when the settings button is clicked', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/test mode/i)).toBeInTheDocument();
  });

  it('closes the modal when the close button is clicked', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the modal when the backdrop is clicked', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close when clicking inside the modal panel itself', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.click(screen.getByRole('dialog', { name: /settings/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the modal when Escape is pressed', async () => {
    render(<HeaderSettings testMode={true} onTestModeChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
