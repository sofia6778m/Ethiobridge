import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchMyComplaints,
  fetchComplaintDetail,
  normalizeTimeline,
  notifyComplaintsChanged,
  onComplaintsChanged,
} from './complaintService';
import { getWithRetry } from '../utils/requestUtils';

vi.mock('../utils/requestUtils', () => ({
  getWithRetry: vi.fn(),
}));

const infraReport = {
  _id: 'r1',
  reportId: 'IR-2026-0001',
  title: 'Broken water pipe',
  description: 'Leaking for a week',
  region: 'Addis Ababa',
  subcity: 'BOLE',
  woredaName: 'Bole 02',
  status: 'In Progress',
  severityLevel: 'High',
  department: 'Water',
  assignedTo: { fullName: 'Officer One' },
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
  timeline: [
    {
      action: 'created',
      description: 'Submitted',
      performedByName: 'Alem',
      performedByRole: 'citizen',
      createdAt: '2026-08-01T10:00:00.000Z',
    },
  ],
};

const governanceComplaint = {
  _id: 'g1',
  trackingId: 'GOV-2026-0001',
  category: 'Corruption',
  title: 'Bribe requested',
  description: 'Asked for money',
  subcity: 'LEMMI_KURA',
  woredaName: 'Lem 03',
  office: 'Trade Bureau',
  status: 'Under Review',
  urgencyLevel: 'High',
  assignedToOffice: 'Trade Bureau',
  createdAt: '2026-08-04T10:00:00.000Z',
  timeline: [
    {
      action: 'submitted',
      title: 'Complaint submitted',
      message: 'Sent to the governance office',
      performedByRole: 'citizen',
      performedByName: 'Alem',
      at: '2026-08-04T10:00:00.000Z',
    },
    {
      action: 'status_changed',
      title: 'Status changed',
      message: 'Now under review',
      performedByRole: 'GOVERNANCE_OFFICER',
      performedByName: 'Officer Three',
      at: '2026-08-05T10:00:00.000Z',
      previousStatus: 'Submitted',
      newStatus: 'Under Review',
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('fetchMyComplaints', () => {
  it('merges the two collections into one newest-first list', async () => {
    getWithRetry
      .mockResolvedValueOnce({ data: { success: true, reports: [infraReport] } })
      .mockResolvedValueOnce({
        data: { success: true, data: { complaints: [governanceComplaint] } },
      });

    const result = await fetchMyComplaints({});

    expect(getWithRetry).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(2);
    // Newest first: governance (08-04) > infra (08-01)
    expect(result.items.map((i) => i.type)).toEqual([
      'Public Complaint',
      'Infrastructure',
    ]);
    expect(result.counts).toEqual({
      All: 2,
      Infrastructure: 1,
      'Public Complaint': 1,
    });
  });

  it('keeps normalizers type-specific', async () => {
    getWithRetry
      .mockResolvedValueOnce({ data: { success: true, reports: [infraReport] } })
      .mockResolvedValueOnce({ data: { success: true, data: { complaints: [] } } });

    const result = await fetchMyComplaints({});
    const infra = result.items[0];
    expect(infra.typeKey).toBe('infrastructure');
    expect(infra.refId).toBe('IR-2026-0001');
    expect(infra.assignedTo).toBe('Officer One');
    expect(infra.location).toBe('Addis Ababa / BOLE / Bole 02');
  });

  it('normalizes public complaints to the Public Complaint label', async () => {
    getWithRetry
      .mockResolvedValueOnce({ data: { success: true, reports: [] } })
      .mockResolvedValueOnce({
        data: { success: true, data: { complaints: [governanceComplaint] } },
      });

    const result = await fetchMyComplaints({});
    const gov = result.items[0];
    expect(gov.typeKey).toBe('governance');
    expect(gov.type).toBe('Public Complaint');
    expect(gov.refId).toBe('GOV-2026-0001');
    expect(result.counts['Public Complaint']).toBe(1);
  });

  it('tolerates a failing endpoint without losing the others', async () => {
    getWithRetry
      .mockResolvedValueOnce({ data: { success: true, reports: [infraReport] } })
      .mockRejectedValueOnce(new Error('network down'));

    const result = await fetchMyComplaints({});
    expect(result.items).toHaveLength(1);
    expect(result.counts.Infrastructure).toBe(1);
    expect(result.counts['Public Complaint']).toBe(0);
  });
});

describe('fetchComplaintDetail', () => {
  it('loads an infrastructure report and its timeline', async () => {
    getWithRetry.mockResolvedValueOnce({ data: { success: true, report: infraReport } });
    const item = await fetchComplaintDetail({ typeKey: 'infrastructure', id: 'r1' });
    expect(item.type).toBe('Infrastructure');
    expect(item.timeline).toHaveLength(1);
    expect(item.timeline[0].title).toBe('created');
    expect(item.timeline[0].at).toBe('2026-08-01T10:00:00.000Z');
  });

  it('loads a governance complaint and normalizes its timeline to newest-first sorting input', async () => {
    getWithRetry.mockResolvedValueOnce({
      data: { success: true, data: governanceComplaint },
    });
    const item = await fetchComplaintDetail({ typeKey: 'governance', id: 'g1' });
    expect(item.type).toBe('Public Complaint');
    expect(item.title).toBe('Corruption — Bribe requested');
    expect(item.timeline).toHaveLength(2);
    // chronological ascending so the UI can render newest-first by reversing
    expect(item.timeline[0].at).toBe('2026-08-04T10:00:00.000Z');
    expect(item.timeline[1].newStatus).toBe('Under Review');
  });

  it('falls back to the public endpoint for a governance complaint the user does not own', async () => {
    const forbidden = new Error('Forbidden');
    forbidden.response = { status: 403 };
    const publicSummary = {
      _id: 'g1',
      trackingId: 'GOV-2026-0001',
      category: 'Corruption',
      title: 'Bribe requested',
      description: 'Asked for money',
      status: 'Under Review',
      displayStatus: 'Assigned',
      subcity: 'LEMMI_KURA',
      woredaName: 'Lem 03',
      office: 'Trade Bureau',
      createdAt: '2026-08-04T10:00:00.000Z',
      timeline: governanceComplaint.timeline,
    };
    getWithRetry
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValueOnce({ data: { success: true, data: publicSummary } });

    const item = await fetchComplaintDetail({ typeKey: 'governance', id: 'g1' });
    expect(getWithRetry).toHaveBeenCalledTimes(2);
    expect(getWithRetry).toHaveBeenLastCalledWith(
      '/public/governance-complaints/g1',
      expect.any(Object)
    );
    expect(item.type).toBe('Public Complaint');
    expect(item.isOwner).toBe(false);
  });

  it('throws for unknown types', async () => {
    await expect(fetchComplaintDetail({ typeKey: 'nonsense', id: 'x' })).rejects.toThrow(
      'Unknown complaint type'
    );
    expect(getWithRetry).not.toHaveBeenCalled();
  });
});

describe('normalizeTimeline', () => {
  it('handles infra and governance shapes together', () => {
    const raw = {
      _id: 'x',
      createdAt: '2026-01-01T00:00:00.000Z',
      timeline: [
        { action: 'created', description: 'd', performedByName: 'A', createdAt: '2026-01-02T00:00:00.000Z' },
        { action: 'note_added', description: 'n', at: '2026-01-03T00:00:00.000Z' },
        { action: 'submitted', title: 't', message: 'm', at: '2026-01-04T00:00:00.000Z' },
      ],
    };
    const items = normalizeTimeline('governance', raw);
    expect(items).toHaveLength(3);
    expect(items[2].title).toBe('t');
    expect(items[2].description).toBe('m');
    expect(items[0].title).toBe('created');
  });
});

describe('change notification', () => {
  it('calls registered listeners on notifyComplaintsChanged', () => {
    const listener = vi.fn();
    const unsub = onComplaintsChanged(listener);
    notifyComplaintsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    notifyComplaintsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps going when a listener throws', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    onComplaintsChanged(bad);
    onComplaintsChanged(good);
    expect(() => notifyComplaintsChanged()).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
