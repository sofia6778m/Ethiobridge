import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComplaintTrack from './ComplaintTrack';
import { complaintAPI } from '../../services/api';

vi.mock('react-i18next', () => {
  const en = {
    'complaintTracking.title': 'Public Complaint Tracking',
    'complaintTracking.desc': 'Enter your tracking number and the phone number used to submit your complaint to check its current status.',
    'complaintTracking.trackingLabel': 'Tracking Number',
    'complaintTracking.trackingPlaceholder': 'CMP-2026-000001',
    'complaintTracking.phoneLabel': 'Phone Number',
    'complaintTracking.phonePlaceholder': '09XXXXXXXX',
    'complaintTracking.checkStatus': 'Check Status',
    'complaintTracking.checking': 'Checking...',
    'complaintTracking.invalid': 'Invalid tracking number or phone number.',
    'complaintTracking.retry': 'Try Again',
    'complaintTracking.privacy': 'No login required. Your phone number is only used to verify you are the reporter.',
    'complaintTracking.progress': 'Complaint Progress',
    'complaintTracking.current': 'Current',
    'complaintTracking.latestUpdate': 'Latest Update',
    'complaintTracking.noUpdates': 'No updates yet.',
    'complaintTracking.stepSubmitted': 'Complaint Submitted',
    'complaintTracking.stepReceived': 'Received by Government Office',
    'complaintTracking.stepAssigned': 'Assigned to Officer',
    'complaintTracking.stepInvestigation': 'Investigation Started',
    'complaintTracking.stepResponse': 'Response Provided',
    'complaintTracking.stepResolved': 'Resolved',
  };
  return {
    useTranslation: () => ({ t: (key) => en[key] ?? key }),
  };
});

vi.mock('../../services/api', () => ({
  complaintAPI: { track: vi.fn() },
}));

const complaint = {
  _id: '1',
  trackingNumber: 'CMP-2026-000001',
  title: 'Broken streetlight on Bole road',
  status: 'In Progress',
  category: 'Government Service Complaint',
  subcity: 'Bole',
  woredaName: 'Woreda 2',
  department: 'Infrastructure',
  incidentDate: '2026-01-04T00:00:00.000Z',
  createdAt: '2026-01-05T00:00:00.000Z',
  description: 'The streetlight has been off for two weeks.',
  publicNotifications: [
    { event: 'accepted', title: 'Received', message: 'Your complaint was received by the Bole sub-city office.', at: '2026-01-06T00:00:00.000Z' },
    { event: 'in_progress', title: 'In Progress', message: 'Investigation has started.', at: '2026-01-07T00:00:00.000Z' },
  ],
  timeline: [],
};

const trackCalls = () => complaintAPI.track.mock.calls;

async function fillForm(tracking = 'cmp-2026-000001', phone = '0967786170') {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('CMP-2026-000001'), tracking);
  await user.type(screen.getByPlaceholderText('09XXXXXXXX'), phone);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ComplaintTrack', () => {
  it('renders the public tracking form and keeps Check Status disabled until both fields are filled', async () => {
    const user = userEvent.setup();
    render(<ComplaintTrack />);

    expect(screen.getByRole('heading', { name: 'Public Complaint Tracking' })).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Check Status' });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText('CMP-2026-000001'), 'CMP-2026-000001');
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText('09XXXXXXXX'), '0967786170');
    expect(button).toBeEnabled();
  });

  it('submits uppercased tracking number and shows the complaint, progress steps and latest update', async () => {
    complaintAPI.track.mockResolvedValue({ data: { complaint } });
    render(<ComplaintTrack />);

    const user = await fillForm('cmp-2026-000001', '0967786170');
    await user.click(screen.getByRole('button', { name: 'Check Status' }));

    expect(trackCalls()[0]).toEqual(['CMP-2026-000001', { phone: '0967786170' }]);

    expect(await screen.findByText('Broken streetlight on Bole road')).toBeInTheDocument();
    expect(screen.getByText('CMP-2026-000001')).toBeInTheDocument();

    expect(screen.getByText('Complaint Progress')).toBeInTheDocument();
    expect(screen.getByText('Investigation Started')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Response Provided')).toBeInTheDocument();

    expect(screen.getByText('Latest Update')).toBeInTheDocument();
    expect(screen.getByText('Investigation has started.')).toBeInTheDocument();
  });

  it('shows the invalid message for a mismatching phone number (403) and offers a retry', async () => {
    complaintAPI.track.mockRejectedValue({
      response: { status: 403, data: { message: 'The phone number does not match the one used to submit this complaint.' } },
    });
    render(<ComplaintTrack />);

    const user = await fillForm('CMP-2026-000001', '0911222333');
    await user.click(screen.getByRole('button', { name: 'Check Status' }));

    expect(await screen.findByText('Invalid tracking number or phone number.')).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Try Again' });
    await user.click(retry);
    expect(screen.queryByText('Invalid tracking number or phone number.')).toBeNull();
  });

  it('shows the invalid message for an unknown tracking number (404)', async () => {
    complaintAPI.track.mockRejectedValue({ response: { status: 404, data: { message: 'Complaint not found' } } });
    render(<ComplaintTrack />);

    const user = await fillForm('CMP-2026-999999', '0967786170');
    await user.click(screen.getByRole('button', { name: 'Check Status' }));

    expect(await screen.findByText('Invalid tracking number or phone number.')).toBeInTheDocument();
  });

  it('shows the loading state on the button while checking', async () => {
    let resolveTrack;
    complaintAPI.track.mockImplementation(() => new Promise((res) => { resolveTrack = res; }));
    render(<ComplaintTrack />);

    const user = await fillForm('CMP-2026-000001', '0967786170');
    await user.click(screen.getByRole('button', { name: 'Check Status' }));

    expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();

    resolveTrack({ data: { complaint } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check Status' })).toBeEnabled());
    expect(await screen.findByText('Broken streetlight on Bole road')).toBeInTheDocument();
  });
});
