import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestModeBanner } from './TestModeBanner';

describe('TestModeBanner', () => {
  it('announces test mode and points to Settings', () => {
    render(<TestModeBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Using mock data, no live API calls. Turn off in Settings.');
  });
});
