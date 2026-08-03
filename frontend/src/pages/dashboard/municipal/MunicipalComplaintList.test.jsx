import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MunicipalComplaintList from './MunicipalComplaintList';
import API from '../../../services/api';
import { municipalComplaintAPI } from '../../../services/api';
import { toast } from 'react-toastify';
import { requestCache } from '../../../utils/requestCache';

let mockUser = { _id: 'u1', role: 'woreda' };

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-toastify', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('../../../services/api', () => ({
  default: { get: vi.fn() },
  municipalComplaintAPI: { exportPDF: vi.fn(), exportExcel: vi.fn(), runEscalation: vi.fn() },
}));

const listPayload = {
  complaints: [
    {
      _id: '1',
      trackingId: 'MC-1001',
      title: 'Road pothole near the gate',
      department: 'Infrastructure',
      assignedToDepartment: 'Infrastructure',
      assignedLevel: 'Woreda',
      priority: 'High',
      status: 'Open',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
  pages: 1,
};

const statsPayload = {
  open: 1,
  overdue: 0,
  escalated: 0,
  resolvedToday: 0,
  averageResponseMinutes: 30,
  averageResolutionHours: 2,
  pendingByDepartment: [],
};

const listCalls = () => API.get.mock.calls.filter(([url]) => url === '/municipal-complaints');

beforeEach(() => {
  mockUser = { _id: 'u1', role: 'woreda' };
  requestCache.clear();
  vi.clearAllMocks();
  API.get.mockImplementation((url) => {
    if (url === '/municipal-complaints/stats') return Promise.resolve({ data: { data: statsPayload } });
    return Promise.resolve({ data: { data: listPayload } });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MunicipalComplaintList', () => {
  it('shows a skeleton on first load, then the complaints table', async () => {
    render(<MunicipalComplaintList basePath="/dashboard" />);

    expect(screen.getByLabelText('Loading list')).toBeInTheDocument();
    expect(screen.queryByText('Road pothole near the gate')).toBeNull();

    expect(await screen.findByText('Road pothole near the gate')).toBeInTheDocument();
    expect(screen.getByText('MC-1001')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading list')).toBeNull();
  });

  it('shows the empty state when the API returns no complaints', async () => {
    API.get.mockImplementation((url) => {
      if (url === '/municipal-complaints/stats') return Promise.resolve({ data: { data: statsPayload } });
      return Promise.resolve({ data: { data: { complaints: [], total: 0, pages: 0 } } });
    });
    render(<MunicipalComplaintList basePath="/dashboard" />);
    expect(await screen.findByText('No complaints found')).toBeInTheDocument();
  });

  it('debounces search so keystrokes do not hit the API, then refetches once', async () => {
    vi.useFakeTimers();
    render(<MunicipalComplaintList basePath="/dashboard" />);
    await act(async () => {});
    await act(async () => {});
    expect(listCalls()).toHaveLength(1);

    const input = screen.getByPlaceholderText('Search title / tracking ID / phone…');
    fireEvent.change(input, { target: { value: 'r' } });
    fireEvent.change(input, { target: { value: 'ro' } });
    expect(listCalls()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {});
    expect(listCalls()).toHaveLength(2);
    expect(listCalls()[1][1].params).toMatchObject({ search: 'ro', page: 1, limit: 12 });
  });

  it('does not re-fetch when the search is cleared back to empty', async () => {
    const user = userEvent.setup();
    render(<MunicipalComplaintList basePath="/dashboard" />);
    await screen.findByText('Road pothole near the gate');
    expect(listCalls()).toHaveLength(1);

    await user.type(screen.getByPlaceholderText('Search title / tracking ID / phone…'), 'abc');
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(listCalls().filter((c) => c[1].params.search)).toHaveLength(1);

    await user.clear(screen.getByPlaceholderText('Search title / tracking ID / phone…'));
    await new Promise((r) => setTimeout(r, 800));
    expect(listCalls()).toHaveLength(2);
  });

  it('shows the error card and toasts once after retries are exhausted (500)', async () => {
    API.get.mockImplementation((url) => {
      if (url === '/municipal-complaints') {
        return Promise.reject({ message: 'boom', response: { status: 500 } });
      }
      return Promise.resolve({ data: { data: statsPayload } });
    });

    render(<MunicipalComplaintList basePath="/dashboard" />);
    expect(
      await screen.findByText('Could not load complaints', {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(listCalls().length).toBeGreaterThanOrEqual(3);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('does not toast when a request is canceled on unmount', async () => {
    API.get.mockImplementation((url, { signal }) => {
      if (url === '/municipal-complaints') {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject({ name: 'AbortError', code: 'ERR_CANCELED' }));
        });
      }
      return Promise.resolve({ data: { data: statsPayload } });
    });

    const { unmount } = render(<MunicipalComplaintList basePath="/dashboard" />);
    unmount();
    await new Promise((r) => setTimeout(r, 50));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('exports the filtered complaints as PDF', async () => {
    municipalComplaintAPI.exportPDF.mockResolvedValue({
      data: new Blob(['pdf']),
      headers: { 'content-disposition': 'attachment; filename="complaints.pdf"' },
    });
    const user = userEvent.setup();
    render(<MunicipalComplaintList basePath="/dashboard" />);
    await screen.findByText('Road pothole near the gate');
    await user.click(screen.getByRole('button', { name: 'PDF' }));
    expect(municipalComplaintAPI.exportPDF).toHaveBeenCalledTimes(1);
  });

  it('shows Run Escalation only for admin/government and reloads after running', async () => {
    render(<MunicipalComplaintList basePath="/dashboard" />);
    await screen.findByText('Road pothole near the gate');
    expect(screen.queryByRole('button', { name: 'Run Escalation' })).toBeNull();

    mockUser = { _id: 'u1', role: 'admin' };
    municipalComplaintAPI.runEscalation.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<MunicipalComplaintList basePath="/dashboard" />);
    await user.click(await screen.findByRole('button', { name: 'Run Escalation' }));

    expect(municipalComplaintAPI.runEscalation).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });
});
