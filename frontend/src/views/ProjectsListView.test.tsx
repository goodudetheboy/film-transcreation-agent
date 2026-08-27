import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectsListView } from './ProjectsListView';
import * as projectsApiClient from '../api/projectsApiClient';
import type { Project } from '../api/apiClient.types';

vi.mock('../api/projectsApiClient');

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Japan',
    country: 'Japan',
    items: [{ id: 'i1', scriptLine: 'a', sceneDescription: 'b' }],
    rubrics: [],
    status: 'draft',
    batches: [],
    results: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProjectsListView', () => {
  beforeEach(() => {
    vi.mocked(projectsApiClient.listProjects).mockReset();
  });

  it('shows a loading state, then the fetched projects', async () => {
    vi.mocked(projectsApiClient.listProjects).mockResolvedValue([fakeProject()]);
    render(
      <MemoryRouter>
        <ProjectsListView passcode="secret" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText('Japan')).toBeInTheDocument();
    expect(screen.getByText('1 detail')).toBeInTheDocument();
  });

  it('shows an empty state when there are no projects', async () => {
    vi.mocked(projectsApiClient.listProjects).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ProjectsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(projectsApiClient.listProjects).mockRejectedValue(new Error('request failed with status 401'));
    render(
      <MemoryRouter>
        <ProjectsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/401/)).toBeInTheDocument();
  });

  it('links to /projects/new for creating a new project', async () => {
    vi.mocked(projectsApiClient.listProjects).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <ProjectsListView passcode="secret" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: /new project/i })).toHaveAttribute(
      'href',
      '/projects/new',
    );
  });
});
