import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PublicAlertForm from './PublicAlertForm';
import { alertAPI, publicAPI } from '../../../services/api';

const mockUser = {
  _id: 'subcity-1',
  role: 'subcity_admin',
  fullName: 'Bole Subcity Admin',
  organizationName: 'EthioBridge',
  subcity: 'Bole',
  subcityId: 'sc-bole',
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../services/api', () => ({
  alertAPI: { create: vi.fn() },
  publicAPI: {
    getServerTime: vi.fn(),
    getSubcities: vi.fn(),
    getSubcityWoredas: vi.fn(),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: () => null,
  TileLayer: () => null,
}));

vi.mock('leaflet', () => ({
  default: { latLngBounds: () => ({}) },
}));

vi.mock('../../../components/map/BoundaryLayers', () => ({
  SubcityBoundaries: () => null,
  WoredaBoundaries: () => null,
  CityMaskLayer: () => null,
  AddisAbabaBoundary: () => null,
}));

const WREDAS = [
  { _id: 'w1', name: 'Woreda 01' },
  { _id: 'w2', name: 'Woreda 02' },
  { _id: 'w3', name: 'Woreda 03' },
];

beforeEach(() => {
  vi.clearAllMocks();
  publicAPI.getServerTime.mockResolvedValue({ data: { now: '2026-08-07T12:00:00.000Z' } });
  publicAPI.getSubcities.mockResolvedValue({ data: { subcities: [{ _id: 'sc-bole', name: 'Bole' }] } });
  publicAPI.getSubcityWoredas.mockResolvedValue({ data: { woredas: WREDAS } });
  alertAPI.create.mockResolvedValue({ data: { alert: { _id: 'a1' } } });
});

const renderForm = () =>
  render(
    <MemoryRouter>
      <PublicAlertForm homePath="/dashboard/subcity/alerts" />
    </MemoryRouter>
  );

const fillRequiredFields = async (user) => {
  await user.type(screen.getByPlaceholderText(/Heavy Rainfall Warning/i), 'Heavy rain expected');
  await user.click(screen.getByRole('button', { name: /high/i }));
  await user.type(screen.getByPlaceholderText(/Provide detailed information/i), 'Rain expected across the subcity.');
};

describe('PublicAlertForm — optional free-text category', () => {
  it('creates an alert with a typed category and sends it verbatim', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(await screen.findByRole('button', { name: /Woreda 01/ }));
    await user.type(screen.getByPlaceholderText(/Flood Warning, Road Closure/i), 'Road Closure');

    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));
    await waitFor(() => expect(alertAPI.create).toHaveBeenCalledTimes(1));

    const fd = alertAPI.create.mock.calls[0][0];
    expect(fd.get('category')).toBe('Road Closure');
  });

  it('creates an alert with an empty category (no category sent, no validation error)', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);
    await user.click(await screen.findByRole('button', { name: /Woreda 01/ }));

    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));
    await waitFor(() => expect(alertAPI.create).toHaveBeenCalledTimes(1));

    const fd = alertAPI.create.mock.calls[0][0];
    expect(fd.get('category')).toBeNull();
  });
});

describe('PublicAlertForm — subcity admin woreda targeting', () => {  it('publishes when a single woreda is selected and sends its id', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);

    await user.click(await screen.findByRole('button', { name: /Woreda 01/ }));
    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));

    expect(screen.queryByText('Select at least one woreda within your subcity')).not.toBeInTheDocument();
    await waitFor(() => expect(alertAPI.create).toHaveBeenCalledTimes(1));

    const fd = alertAPI.create.mock.calls[0][0];
    expect(fd.getAll('woredaIds')).toEqual(['w1']);
    expect(fd.getAll('woredaNames')).toEqual(['Woreda 01']);
  });

  it('publishes when multiple woredas are selected and sends all their ids', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);

    await user.click(await screen.findByRole('button', { name: /Woreda 01/ }));
    await user.click(screen.getByRole('button', { name: /Woreda 02/ }));
    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));

    expect(screen.queryByText('Select at least one woreda within your subcity')).not.toBeInTheDocument();
    await waitFor(() => expect(alertAPI.create).toHaveBeenCalledTimes(1));

    const fd = alertAPI.create.mock.calls[0][0];
    expect(fd.getAll('woredaIds')).toEqual(['w1', 'w2']);
    expect(fd.getAll('woredaNames')).toEqual(['Woreda 01', 'Woreda 02']);
  });

  it('shows the error and does not submit when no woreda is selected', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));

    expect(await screen.findByText('Select at least one woreda within your subcity')).toBeInTheDocument();
    expect(alertAPI.create).not.toHaveBeenCalled();
  });

  it('clears the woreda error as soon as a woreda is selected', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillRequiredFields(user);

    await user.click(screen.getByRole('button', { name: 'Publish Broadcast' }));
    expect(await screen.findByText('Select at least one woreda within your subcity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Woreda 01/ }));
    expect(screen.queryByText('Select at least one woreda within your subcity')).not.toBeInTheDocument();
  });
});
