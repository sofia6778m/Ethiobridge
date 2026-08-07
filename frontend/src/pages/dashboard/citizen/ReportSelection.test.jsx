import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportSelection from './ReportSelection';

describe('ReportSelection (Citizen Create Report)', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <ReportSelection />
      </MemoryRouter>
    );

  it('shows exactly two report cards: Infrastructure Report and Public Complaint', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Infrastructure Report' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Public Complaint' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Municipal Complaint' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Governance Complaint' })).toBeNull();
  });

  it('shows the correct descriptions for both cards', () => {
    renderPage();

    expect(
      screen.getByText(/Report infrastructure issues such as roads, water, electricity/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Report government service delays, corruption, misconduct/i)
    ).toBeInTheDocument();
  });

  it('provides a Create Infrastructure Report button linking to the infrastructure form', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Create Infrastructure Report/ });
    expect(link).toHaveAttribute('href', '/dashboard/citizen/create-report/infrastructure');
  });

  it('provides a Create Public Complaint button linking directly to the governance form (no public redirect)', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Create Public Complaint/ });
    expect(link).toHaveAttribute('href', '/dashboard/citizen/create-report/governance');
  });

  it('no longer shows a municipal card or a green governance-complaint information box', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /Create Municipal Complaint/ })).toBeNull();
    expect(screen.queryByText(/public governance complaint form/i)).toBeNull();
    expect(screen.queryByText(/To submit a Governance Complaint/i)).toBeNull();
  });
});
