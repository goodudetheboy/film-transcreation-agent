import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultsList } from './ResultsList';

describe('ResultsList', () => {
  it('shows a placeholder when there are no flagged lines', () => {
    render(<ResultsList lines={[]} status="idle" />);
    expect(screen.getByText(/no flagged lines/i)).toBeInTheDocument();
  });

  it('renders one row per flagged line with reason and suggestion', () => {
    render(
      <ResultsList
        lines={[
          { line: 'broccoli line', reason: 'unfamiliar food', suggestedReplacement: 'green peppers' },
        ]}
        status="done"
      />,
    );
    expect(screen.getByText('broccoli line')).toBeInTheDocument();
    expect(screen.getByText('unfamiliar food')).toBeInTheDocument();
    expect(screen.getByText('green peppers')).toBeInTheDocument();
  });

  it('shows a loading state while status is streaming', () => {
    render(<ResultsList lines={[]} status="streaming" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
