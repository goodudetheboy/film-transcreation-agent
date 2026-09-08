import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderSettings, type HeaderSettingsProps } from './HeaderSettings';
import { signOut } from 'firebase/auth';

vi.mock('../firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  signOut: vi.fn(),
}));

function renderHeaderSettings(overrides: Partial<HeaderSettingsProps> = {}) {
  const props: HeaderSettingsProps = {
    email: 'testuser@example.com',
    testMode: true,
    onTestModeChange: () => {},
    theme: 'dark',
    onThemeChange: () => {},
    ...overrides,
  };
  render(<HeaderSettings {...props} />);
}

async function openSettingsModal() {
  await userEvent.click(screen.getByRole('button', { name: /testuser/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /settings/i }));
}

describe('HeaderSettings', () => {
  it('renders an account chip labeled with the email local-part and keeps the menu closed initially', () => {
    renderHeaderSettings();
    expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a dropdown menu with Settings and Sign out when the account chip is clicked', async () => {
    renderHeaderSettings();
    await userEvent.click(screen.getByRole('button', { name: /testuser/i }));
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('closes the dropdown when Escape is pressed', async () => {
    renderHeaderSettings();
    await userEvent.click(screen.getByRole('button', { name: /testuser/i }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls signOut when the dropdown Sign out item is clicked', async () => {
    renderHeaderSettings();
    await userEvent.click(screen.getByRole('button', { name: /testuser/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }));
    expect(signOut).toHaveBeenCalled();
  });

  it('opens the settings modal when the dropdown Settings item is clicked', async () => {
    renderHeaderSettings();
    await openSettingsModal();
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/test mode/i)).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the modal when the close button is clicked', async () => {
    renderHeaderSettings();
    await openSettingsModal();
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the modal when the backdrop is clicked', async () => {
    renderHeaderSettings();
    await openSettingsModal();
    await userEvent.click(screen.getByTestId('modal-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close when clicking inside the modal panel itself', async () => {
    renderHeaderSettings();
    await openSettingsModal();
    await userEvent.click(screen.getByRole('dialog', { name: /settings/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reflects the current testMode value in the checkbox', async () => {
    renderHeaderSettings({ testMode: false });
    await openSettingsModal();
    expect(screen.getByLabelText(/test mode/i)).not.toBeChecked();
  });

  it('calls onTestModeChange when the checkbox is toggled', async () => {
    const onTestModeChange = vi.fn();
    renderHeaderSettings({ onTestModeChange });
    await openSettingsModal();
    await userEvent.click(screen.getByLabelText(/test mode/i));
    expect(onTestModeChange).toHaveBeenCalledWith(false);
  });

  it('reflects the current theme value in the select', async () => {
    renderHeaderSettings({ theme: 'light' });
    await openSettingsModal();
    expect(screen.getByLabelText(/theme/i)).toHaveValue('light');
  });

  it('calls onThemeChange when the theme select is changed', async () => {
    const onThemeChange = vi.fn();
    renderHeaderSettings({ onThemeChange });
    await openSettingsModal();
    await userEvent.selectOptions(screen.getByLabelText(/theme/i), 'light');
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });
});
