import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PublicTrack from './PublicTrack';
import { publicTrackAPI } from '../../services/api';

vi.mock('../../services/api', () => ({
  publicTrackAPI: { track: vi.fn() },
}));

const result = {
  trackingId: 'GOV-2026-0001',
  type: 'Public Complaint',
  title: 'Bribe requested',
  status: 'Under Review',
  displayStatus: 'Assigned',
  subcity: 'LEMMI_KURA',
  woreda: 'Lem 03',
  office: 'Trade Bureau',
  department: '',
  submittedDate: '2026-08-04T10:00:00.000Z',
  lastUpdated: '2026-08-05T10:00:00.000Z',
  latestResponse: { date: '2026-08-05T10:00:00.000Z', message: 'Assigned to an officer', byName: 'Officer Three' },
  timeline: [
    { date: '2026-08-04T10:00:00.000Z', title: 'Complaint submitted', message: 'Sent to the governance office', byName: '', role: 'citizen' },
    { date: '2026-08-05T10:00:00.000Z', title: 'Status changed', message: 'Now under review', byName: 'Officer Three', role: 'GOVERNANCE_OFFICER' },
  ],
};

const notFound = new Error('Not found');
notFound.response = { status: 404, data: { message: 'No record found for the provided tracking ID and phone number.' } };

beforeEach(() => {
  vi.resetAllMocks();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <PublicTrack />
    </MemoryRouter>
  );

describe('PublicTrack (no-login tracking page)', () => {
  it('submits tracking id + phone and renders the redacted status', async () => {
    publicTrackAPI.track.mockResolvedValueOnce({ data: { success: true, data: result } });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Tracking ID/), 'GOV-2026-0001');
    await user.type(screen.getByLabelText(/Phone Number/), '0912345678');
    await user.click(screen.getByRole('button', { name: 'Track Status' }));

    expect(publicTrackAPI.track).toHaveBeenCalledWith({
      trackingId: 'GOV-2026-0001',
      phone: '0912345678',
    });

    expect(screen.getByText('GOV-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Bribe requested')).toBeInTheDocument();
    expect(screen.getAllByText('Assigned')).toHaveLength(2);
    // Redacted: no reporter phone/name surfaces
    expect(screen.queryByText(/0912345678/)).not.toBeInTheDocument();
    expect(screen.getByText('Assigned to an officer')).toBeInTheDocument();
    expect(screen.getByText('Complaint submitted')).toBeInTheDocument();
  });

  it('requires both fields before submitting', async () => {
    const user = userEvent.setup();
    renderPage();

    const submit = screen.getByRole('button', { name: 'Track Status' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Tracking ID/), 'GOV-2026-0001');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/Phone Number/), '0912345678');
    expect(submit).toBeEnabled();
  });

  it('shows the generic error for a wrong phone (404)', async () => {
    publicTrackAPI.track.mockRejectedValueOnce(notFound);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Tracking ID/), 'GOV-2026-0001');
    await user.type(screen.getByLabelText(/Phone Number/), '0999999999');
    await user.click(screen.getByRole('button', { name: 'Track Status' }));

    expect(await screen.findByText('No record found for the provided tracking ID and phone number.')).toBeInTheDocument();
    expect(screen.queryByText('Bribe requested')).not.toBeInTheDocument();
  });

  it('falls back to the generic message when the server gives none', async () => {
    const err = new Error('network down');
    publicTrackAPI.track.mockRejectedValueOnce(err);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/Tracking ID/), 'IR-2026-0001');
    await user.type(screen.getByLabelText(/Phone Number/), '0912345678');
    await user.click(screen.getByRole('button', { name: 'Track Status' }));

    expect(await screen.findByText('No record found for the provided tracking ID and phone number.')).toBeInTheDocument();
  });
});
