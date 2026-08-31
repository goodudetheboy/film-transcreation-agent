import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectItemView } from './ProjectItemView';
import * as projectsApiClient from '../api/projectsApiClient';
import type { ProjectItem, Rubric } from '../api/apiClient.types';

vi.mock('../api/projectsApiClient');
vi.mock('../api/projectChatApiClient');

// jsdom doesn't implement Element.scrollTo — ResearchChatPanel (docked inside this
// panel) calls it on every render to keep its thread scrolled to the bottom.
Element.prototype.scrollTo = vi.fn();

function fakeItem(overrides: Partial<ProjectItem> = {}): ProjectItem {
  return {
    id: 'item-1',
    projectId: 'proj-1',
    filmId: 'film-1',
    detailRowId: 'row-1',
    startMs: 0,
    endMs: 2000,
    subtitleText: 'that meme is so played out',
    sceneDescription: 'a character references a dated meme',
    customValues: {},
    action: 'pending',
    importanceScore: null,
    scores: [],
    summary: 'This should change.',
    shouldTranscreate: true,
    suggestedReplacement: { text: 'evergreen replacement', justification: 'because' },
    trendSuggestions: null,
    lastResearchedAt: null,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
}

const RUBRICS: Rubric[] = [];

describe('ProjectItemView', () => {
  beforeEach(() => {
    vi.mocked(projectsApiClient.listChatSessions).mockResolvedValue([]);
  });

  it('renders the evergreen suggested replacement but no trend card when trendSuggestions is null', () => {
    render(
      <ProjectItemView
        projectId="proj-1"
        passcode="secret"
        testMode={true}
        item={fakeItem()}
        rubrics={RUBRICS}
        allItems={[fakeItem()]}
        onBack={() => {}}
        onNavigate={() => {}}
        onScorePatched={() => {}}
      />,
    );

    expect(screen.getByText('evergreen replacement')).toBeInTheDocument();
    expect(screen.queryByText(/trend-sourced/i)).not.toBeInTheDocument();
  });

  it('renders a trend-sourced alternative alongside the suggested replacement, with a source link and a staleness indicator', () => {
    const publishedDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 120).toISOString().slice(0, 10);
    const item = fakeItem({
      trendSuggestions: [
        {
          text: 'use the current trend',
          justification: 'it is what people are saying right now',
          sourceUrl: 'https://example.com/trend',
          sourceTitle: 'Trend Roundup',
          publishedDate,
        },
      ],
    });

    render(
      <ProjectItemView
        projectId="proj-1"
        passcode="secret"
        testMode={true}
        item={item}
        rubrics={RUBRICS}
        allItems={[item]}
        onBack={() => {}}
        onNavigate={() => {}}
        onScorePatched={() => {}}
      />,
    );

    expect(screen.getByText('evergreen replacement')).toBeInTheDocument();
    expect(screen.getByText('use the current trend')).toBeInTheDocument();
    expect(screen.getByText('it is what people are saying right now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trend Roundup' })).toHaveAttribute('href', 'https://example.com/trend');
    expect(screen.getByText(/4 months ago/i)).toBeInTheDocument();
  });
});
