import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CitizenGovernanceComplaintForm from './CitizenGovernanceComplaintForm';

const mockUser = {
  _id: 'u1',
  fullName: 'Alem Tesfaye',
  phone: '0911223344',
  email: 'alem@example.com',
  role: 'citizen',
};

const submittedComplaint = {
  _id: 'c1',
  trackingId: 'GOV-2026-000042',
  status: 'Submitted',
};

let capturedProps = null;

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true }),
}));

vi.mock('../../../components/governance/GovernanceComplaintForm', () => ({
  default: (props) => {
    capturedProps = props;
    return (
      <form aria-label="Governance complaint form">
        <input aria-label="Full Name" value={props.user?.fullName || ''} readOnly />
        <input aria-label="Phone Number" value={props.user?.phone || ''} readOnly />
        <input aria-label="Email" value={props.user?.email || ''} readOnly />
        <button type="button" onClick={() => props.onSuccess?.(submittedComplaint)}>
          Submit
        </button>
      </form>
    );
  },
}));

beforeEach(() => {
  capturedProps = null;
});

describe('CitizenGovernanceComplaintForm', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <CitizenGovernanceComplaintForm />
      </MemoryRouter>
    );

  it('opens the governance complaint form directly and auto-fills the logged-in citizen details', () => {
    renderPage();

    expect(screen.getByLabelText('Governance complaint form')).toBeInTheDocument();
    expect(capturedProps.user).toBe(mockUser);
    expect(screen.getByLabelText('Full Name')).toHaveValue('Alem Tesfaye');
    expect(screen.getByLabelText('Phone Number')).toHaveValue('0911223344');
    expect(screen.getByLabelText('Email')).toHaveValue('alem@example.com');
  });

  it('shows the tracking ID in a success message after submission', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('Complaint Submitted Successfully')).toBeInTheDocument();
    expect(screen.getByText('GOV-2026-000042')).toBeInTheDocument();
  });

  it('offers navigation to My Complaints and back to the Citizen Dashboard after submission', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    const myComplaints = screen.getByRole('link', { name: 'Go to My Complaints' });
    expect(myComplaints).toHaveAttribute('href', '/dashboard/citizen/my-complaints');
    expect(screen.getByRole('button', { name: 'Back to Dashboard' })).toBeInTheDocument();
  });

  it('does not redirect to the public governance complaint page', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /public governance complaint form/i })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open My Complaints' })).toBeNull();
  });
});
