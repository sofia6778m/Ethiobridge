import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MyComplaints from './MyComplaints';

const items = [
  {
    key: 'infrastructure-r1',
    typeKey: 'infrastructure',
    type: 'Infrastructure',
    id: 'r1',
    refId: 'IR-2026-0001',
    title: 'Broken water pipe',
    description: 'Leaking',
    location: 'Addis Ababa / BOLE / Bole 02',
    status: 'In Progress',
    createdAt: '2026-08-01T10:00:00.000Z',
  },
  {
    key: 'governance-g1',
    typeKey: 'governance',
    type: 'Public Complaint',
    id: 'g1',
    refId: 'GOV-2026-0001',
    title: 'Corruption — Bribe requested',
    location: 'LEMMI_KURA / Lem 03 / Trade Bureau',
    status: 'Resolved',
    createdAt: '2026-08-04T10:00:00.000Z',
  },
];

const mockHook = vi.fn();

vi.mock('../../../hooks/useMyComplaints', () => ({
  default: (props) => mockHook(props),
}));

beforeEach(() => {
  mockHook.mockReturnValue({
    complaints: items,
    counts: { All: 2, Infrastructure: 1, 'Public Complaint': 1 },
    loading: false,
    refreshing: false,
    error: null,
    reload: vi.fn(),
  });
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyComplaints />
    </MemoryRouter>
  );

describe('MyComplaints (unified table)', () => {
  it('shows one unified table containing all types', () => {
    renderPage();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Broken water pipe')).toBeInTheDocument();
    expect(within(table).getByText('Corruption — Bribe requested')).toBeInTheDocument();
  });

  it('renders type tabs with counts', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Infrastructure/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Public Complaint/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Municipal Complaint/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Governance Complaint/ })).toBeNull();
  });

  it('links every row to the unified detail route', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /View details/ });
    expect(links).toHaveLength(2);
    // Newest first: governance (08-04) > infra (08-01)
    expect(links[0]).toHaveAttribute('href', '/dashboard/citizen/complaints/governance/g1');
    expect(links[1]).toHaveAttribute('href', '/dashboard/citizen/complaints/infrastructure/r1');
  });

  it('filters rows by type tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /Public Complaint/ }));
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2); // header + one data row
    expect(screen.queryByText('Broken water pipe')).not.toBeInTheDocument();
  });

  it('filters by tracking search', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('textbox', { name: /Search by tracking number or title/ }), 'GOV-2026');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Corruption — Bribe requested')).toBeInTheDocument();
    expect(screen.queryByText('Broken water pipe')).not.toBeInTheDocument();
  });

  it('refresh button triggers a reload', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    mockHook.mockReturnValue({
      complaints: items,
      counts: { All: 2, Infrastructure: 1, 'Public Complaint': 1 },
      loading: false,
      refreshing: false,
      error: null,
      reload,
    });
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no complaints', () => {
    mockHook.mockReturnValue({
      complaints: [],
      counts: { All: 0, Infrastructure: 0, 'Public Complaint': 0 },
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No complaints yet')).toBeInTheDocument();
  });
});
