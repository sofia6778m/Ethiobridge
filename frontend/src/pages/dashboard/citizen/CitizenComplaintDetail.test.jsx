import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CitizenComplaintDetail from './CitizenComplaintDetail';

vi.mock('../../../services/api', () => ({
  governanceComplaintAPI: {
    reopen: vi.fn(),
    addEvidence: vi.fn(),
    citizenReply: vi.fn(),
    feedback: vi.fn(),
    acknowledgment: vi.fn(),
    confirmResolution: vi.fn(),
  },
}));

const { fetchComplaintDetail } = vi.hoisted(() => ({
  fetchComplaintDetail: vi.fn(),
}));

vi.mock('../../../services/complaintService', () => ({
  fetchComplaintDetail,
  TYPE_KEYS: {
    Infrastructure: 'infrastructure',
    infrastructure: 'infrastructure',
    'Public Complaint': 'governance',
    Public: 'governance',
    Governance: 'governance',
    governance: 'governance',
  },
  TYPE_LABELS: {
    infrastructure: 'Infrastructure',
    governance: 'Public Complaint',
  },
}));

const infraItem = {
  key: 'infrastructure-r1',
  typeKey: 'infrastructure',
  type: 'Infrastructure',
  id: 'r1',
  refId: 'IR-2026-0001',
  title: 'Broken water pipe',
  description: 'Leaking for a week',
  location: 'Addis Ababa / BOLE / Bole 02',
  status: 'In Progress',
  category: 'water_supply_issue',
  office: 'Water',
  subcity: 'BOLE',
  woredaName: 'Bole 02',
  priority: 'High',
  assignedTo: 'Officer One',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
  timeline: [
    {
      id: 't1',
      action: 'created',
      title: 'created',
      description: 'Report submitted and routed to Water',
      note: '',
      previousStatus: '',
      newStatus: '',
      performedByName: 'Alem',
      performedByRole: 'citizen',
      at: '2026-08-01T10:00:00.000Z',
    },
  ],
  raw: { _id: 'r1' },
};

const govItem = {
  key: 'governance-g1',
  typeKey: 'governance',
  type: 'Public Complaint',
  id: 'g1',
  refId: 'GOV-2026-0001',
  title: 'Corruption — Bribe requested',
  description: 'Asked for money',
  status: 'Resolved',
  category: 'Corruption',
  office: 'Trade Bureau',
  subcity: 'LEMMI_KURA',
  woredaName: 'Lem 03',
  priority: 'High',
  assignedTo: 'Trade Bureau',
  createdAt: '2026-08-04T10:00:00.000Z',
  timeline: [],
  raw: {
    _id: 'g1',
    trackingId: 'GOV-2026-0001',
    status: 'Resolved',
    isOverdue: false,
    confirmedByCitizen: false,
    reopenedCount: 0,
    evidenceFiles: [],
    officialDocuments: [],
    woredaRequests: [],
  },
};

beforeEach(() => {
  fetchComplaintDetail.mockReset();
});

const renderPage = (type, id = 'abc') =>
  render(
    <MemoryRouter initialEntries={[`/dashboard/citizen/complaints/${type}/${id}`]}>
      <Routes>
        <Route path="dashboard/citizen/complaints/:type/:id" element={<CitizenComplaintDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe('CitizenComplaintDetail (unified detail)', () => {
  it('renders infrastructure details with meta and timeline', async () => {
    fetchComplaintDetail.mockResolvedValue(infraItem);
    renderPage('Infrastructure', 'r1');
    expect(await screen.findByText('Broken water pipe')).toBeInTheDocument();
    expect(screen.getByText('IR-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Water')).toBeInTheDocument();
    expect(screen.getByText('Officer One')).toBeInTheDocument();
    expect(screen.getByText('Report submitted and routed to Water')).toBeInTheDocument();
    expect(fetchComplaintDetail).toHaveBeenCalledWith(
      expect.objectContaining({ typeKey: 'infrastructure', id: 'r1' })
    );
  });

  it('shows governance citizen actions only for governance complaints', async () => {
    fetchComplaintDetail.mockResolvedValue(govItem);
    renderPage('governance', 'g1');
    expect(await screen.findByText('Corruption — Bribe requested')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download Acknowledgment/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm Resolution/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reopen Complaint/ })).toBeInTheDocument();
  });

  it('hides citizen actions for a public complaint the viewer does not own', async () => {
    fetchComplaintDetail.mockResolvedValue({ ...govItem, isOwner: false });
    renderPage('governance', 'g1');
    expect(await screen.findByText('Corruption — Bribe requested')).toBeInTheDocument();
    expect(screen.getByText(/public complaint shared by another citizen/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Acknowledgment/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm Resolution/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reopen Complaint/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rate Service/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Add Additional Evidence')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Back to My Complaints/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Public Complaints/ })).toBeInTheDocument();
  });

  it('does not show governance actions for infrastructure', async () => {
    fetchComplaintDetail.mockResolvedValue(infraItem);
    renderPage('Infrastructure', 'r1');
    await screen.findByText('Broken water pipe');
    expect(screen.queryByRole('button', { name: /Download Acknowledgment/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Add Additional Evidence')).not.toBeInTheDocument();
  });

  it('rejects unknown complaint types', async () => {
    renderPage('Nonsense', 'x');
    expect(screen.getByText('Unknown complaint type.')).toBeInTheDocument();
  });
});
