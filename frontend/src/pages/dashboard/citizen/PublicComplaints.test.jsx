import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PublicComplaints from './PublicComplaints';

const { getWithRetry } = vi.hoisted(() => ({
  getWithRetry: vi.fn(),
}));

vi.mock('../../../utils/requestUtils', () => ({
  getWithRetry,
}));

const infraReport = {
  _id: 'r1',
  reportId: 'IR-2026-0001',
  title: 'Broken water pipe',
  description: 'Leaking for a week',
  region: 'Addis Ababa',
  subcity: 'BOLE',
  status: 'In Progress',
  category: 'water_supply_issue',
  createdAt: '2026-08-01T10:00:00.000Z',
};

const govComplaint = {
  _id: 'g1',
  trackingId: 'GOV-2026-0001',
  category: 'Corruption',
  title: 'Bribe requested',
  description: 'Asked for money',
  subcity: 'LEMMI_KURA',
  woredaName: 'Lem 03',
  office: 'Trade Bureau',
  status: 'Under Review',
  displayStatus: 'Assigned',
  assignedToOffice: 'Trade Bureau',
  createdAt: '2026-08-04T10:00:00.000Z',
};

const mockBoth = () => {
  getWithRetry.mockImplementation((url) => {
    if (url.includes('/infrastructure/public')) {
      return Promise.resolve({ data: { success: true, total: 1, reports: [infraReport] } });
    }
    return Promise.resolve({ data: { success: true, data: { complaints: [govComplaint], total: 1 } } });
  });
};

const mockEmpty = () => {
  getWithRetry.mockImplementation(() =>
    Promise.resolve({ data: { success: true, data: { complaints: [], total: 0 }, reports: [], total: 0 } })
  );
};

beforeEach(() => {
  getWithRetry.mockReset();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PublicComplaints />
    </MemoryRouter>
  );

describe('PublicComplaints (community browse)', () => {
  it('lists both infrastructure reports and public complaints merged newest-first', async () => {
    mockBoth();
    renderPage();

    expect(await screen.findByText('Broken water pipe')).toBeInTheDocument();
    expect(screen.getByText('Corruption — Bribe requested')).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: /View details/ });
    expect(links).toHaveLength(2);
    // Newest first: governance (08-04) > infra (08-01)
    expect(links[0]).toHaveAttribute('href', '/dashboard/citizen/complaints/governance/g1');
    expect(links[1]).toHaveAttribute('href', '/dashboard/citizen/complaints/infrastructure/r1');
  });

  it('fetches only the selected tab collection', async () => {
    mockBoth();
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Broken water pipe');
    getWithRetry.mockClear();

    await user.click(screen.getByRole('button', { name: 'Infrastructure' }));

    expect(screen.getByText('Broken water pipe')).toBeInTheDocument();
    expect(screen.queryByText('Corruption — Bribe requested')).not.toBeInTheDocument();
    const urls = getWithRetry.mock.calls.map(([url]) => url);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes('/infrastructure/public'))).toBe(true);
  });

  it('shows an empty state when nothing is available', async () => {
    mockEmpty();
    renderPage();

    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('renders the display status vocabulary for public complaints', async () => {
    mockBoth();
    renderPage();

    const row = await screen.findByRole('row', { name: /Bribe requested/ });
    expect(within(row).getByText('Assigned')).toBeInTheDocument();
  });
});
