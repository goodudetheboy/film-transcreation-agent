import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NewProjectView } from './NewProjectView';
import * as projectsApiClient from '../api/projectsApiClient';
import type { Project } from '../api/apiClient.types';

vi.mock('../api/projectsApiClient');

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function fakeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Japan',
    country: 'Japan',
    items: [],
    rubrics: [],
    status: 'draft',
    batches: [],
    results: [],
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('NewProjectView', () => {
  beforeEach(() => {
    vi.mocked(projectsApiClient.createProject).mockReset();
    navigateMock.mockReset();
  });

  it('disables submit until a country and at least one non-empty detail are entered', async () => {
    render(
      <MemoryRouter>
        <NewProjectView passcode="secret" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/target country/i), 'Japan');
    expect(screen.getByRole('button', { name: /create project/i })).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/script line 1/i), "I'm not eating that broccoli.");
    expect(screen.getByRole('button', { name: /create project/i })).not.toBeDisabled();
  });

  it('adds and removes detail rows', async () => {
    render(
      <MemoryRouter>
        <NewProjectView passcode="secret" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/script line 1/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/script line 2/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add detail/i }));
    expect(screen.getByLabelText(/script line 2/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove detail 2/i }));
    expect(screen.queryByLabelText(/script line 2/i)).not.toBeInTheDocument();
  });

  it('cannot remove the last remaining row', () => {
    render(
      <MemoryRouter>
        <NewProjectView passcode="secret" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: /remove detail 1/i })).toBeDisabled();
  });

  it('creates the project and navigates to its detail page on submit', async () => {
    vi.mocked(projectsApiClient.createProject).mockResolvedValue(fakeProject({ id: 'new-id' }));
    render(
      <MemoryRouter>
        <NewProjectView passcode="secret" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/target country/i), 'Japan');
    await userEvent.type(screen.getByLabelText(/script line 1/i), "I'm not eating that broccoli.");
    await userEvent.type(screen.getByLabelText(/scene description 1/i), 'Riley pushes away a plate');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(projectsApiClient.createProject).toHaveBeenCalledWith({
      passcode: 'secret',
      country: 'Japan',
      items: [
        { scriptLine: "I'm not eating that broccoli.", sceneDescription: 'Riley pushes away a plate' },
      ],
    });
    expect(navigateMock).toHaveBeenCalledWith('/projects/new-id');
  });

  it('shows an error message when project creation fails', async () => {
    vi.mocked(projectsApiClient.createProject).mockRejectedValue(new Error('request failed with status 400'));
    render(
      <MemoryRouter>
        <NewProjectView passcode="secret" />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/target country/i), 'Japan');
    await userEvent.type(screen.getByLabelText(/script line 1/i), 'x');
    await userEvent.click(screen.getByRole('button', { name: /create project/i }));

    expect(await screen.findByText(/400/)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
