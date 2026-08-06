import axios from 'axios';
import { logError } from '../utils/logger';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  // Avoid hanging requests (offline / dead server). Lists override with their
  // own, shorter timeouts and retry automatically.
  timeout: 15000,
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('zda_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally + log every failure (except cancelations).
// We deliberately skip auth endpoints (/auth/*) so the Login page can render its
// own inline error banner instead of being force-reloaded, and skip calls that
// opted out via the X-Skip-Auth-Redirect header (e.g. token verification).
API.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const optedOut = err.config?.headers?.['X-Skip-Auth-Redirect'];
    const isAuthEndpoint = url.startsWith('/auth/');

    if (status === 401 && !optedOut && !isAuthEndpoint) {
      localStorage.removeItem('zda_token');
      localStorage.removeItem('zda_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    const isCancel = !!(err && (err.code === 'ERR_CANCELED' || err.name === 'AbortError'));
    if (!isCancel) {
      logError('api', err, {
        endpoint: `${String(err.config?.method || 'GET').toUpperCase()} ${url}`,
      });
    }

    return Promise.reject(err);
  }
);

// ---- Auth ----
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: (config) => API.get('/auth/me', config),
  updateProfile: (data) =>
    API.put('/auth/profile', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  changePassword: (data) => API.put('/auth/change-password', data),
};

// ---- Infrastructure ----
export const infraAPI = {
  create: (data) => API.post('/infrastructure', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
  getPublic: (params) => API.get('/infrastructure/public', { params }),
  getPublicAutocomplete: (params) => API.get('/infrastructure/public/autocomplete', { params }),
  getAll: (params) => API.get('/infrastructure/admin/all', { params }),
  getMy: (params) => API.get('/infrastructure/my/reports', { params }),
  getAssigned: (params) => API.get('/infrastructure/assigned', { params }),
  getGovernmentReports: (params) => API.get('/infrastructure/government/reports', { params }),
  getOne: (id) => API.get(`/infrastructure/${id}`),
  track: (reportId) => API.get(`/infrastructure/track/${reportId}`),
  verify: (id, data) => API.put(`/infrastructure/${id}/verify`, data),
  assign: (id, data) => API.put(`/infrastructure/${id}/assign`, data),
  updateStatus: (id, data) => API.put(`/infrastructure/${id}/status`, data),
  citizenVerify: (id, data) => API.put(`/infrastructure/${id}/citizen-verify`, data),
  addFeedback: (id, data) => API.put(`/infrastructure/${id}/feedback`, data),
  addComment: (id, data) => API.post(`/infrastructure/${id}/comments`, data),
  addAfterMedia: (id, data) => API.put(`/infrastructure/${id}/after-media`, data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
  getAnalytics: (params) => API.get('/infrastructure/analytics', { params }),
  getEnhancedAnalytics: (params) => API.get('/infrastructure/analytics/enhanced', { params }),
  getSLAStats: () => API.get('/infrastructure/analytics/sla'),
  bulkVerify: (data) => API.post('/infrastructure/bulk/verify', data),
  bulkDelete: (data) => API.post('/infrastructure/bulk/delete', data),
  bulkAssign: (data) => API.post('/infrastructure/bulk/assign', data),
  export: (params) => API.get('/infrastructure/export', { params }),
  exportPDF: (id) => API.get(`/infrastructure/export/pdf/${id}`, { responseType: 'blob' }),
  exportBulkPDF: (params) => API.get('/infrastructure/export/pdf', { params, responseType: 'blob' }),
  exportExcel: (params) => API.get('/infrastructure/export/excel', { params, responseType: 'blob' }),
  getGovernmentUsers: () => API.get('/infrastructure/government-users'),
  getDepartmentStats: () => API.get('/infrastructure/department-stats'),
  delete: (id) => API.delete(`/infrastructure/${id}`),
};

// ---- Emergency ----
export const emergencyAPI = {
  create: (data) => API.post('/emergency', data),
  getPublic: (params) => API.get('/emergency', { params }),
  getAll: (params) => API.get('/emergency/admin/all', { params }),
  getGovernmentReports: (params) => API.get('/emergency/government/reports', { params }),
  getMy: (params) => API.get('/emergency/my/reports', { params }),
  getOne: (id) => API.get(`/emergency/${id}`),
  verify: (id, data) => API.put(`/emergency/${id}/verify`, data),
  updateStatus: (id, data) => API.put(`/emergency/${id}/status`, data),
  accept: (id) => API.put(`/emergency/${id}/accept`),
  delete: (id) => API.delete(`/emergency/${id}`),
};

// ---- News ----
export const newsAPI = {
  create: (data) => API.post('/news', data),
  getPublic: (params) => API.get('/news', { params }),
  getAll: (params) => API.get('/news/admin/all', { params }),
  getOne: (id) => API.get(`/news/${id}`),
  publish: (id) => API.put(`/news/${id}/publish`),
  update: (id, data) => API.put(`/news/${id}`, data),
  delete: (id) => API.delete(`/news/${id}`),
};

// ---- Notifications ----
export const notifAPI = {
  get: (params) => API.get('/notifications', { params }),
  markRead: (id) => API.put(`/notifications/${id}/read`),
  markAllRead: () => API.put('/notifications/read-all'),
  delete: (id) => API.delete(`/notifications/${id}`),
};

// ---- Messages ----
export const messageAPI = {
  send: (data) => API.post('/messages', data),
  getInbox: (params) => API.get('/messages/inbox', { params }),
  getSent: (params) => API.get('/messages/sent', { params }),
  getConversation: (id) => API.get(`/messages/conversation/${id}`),
  getContacts: (params) => API.get('/messages/contacts', { params }),
};

// ---- Admin ----
export const adminAPI = {
  getStats: () => API.get('/admin/stats'),
  getRegionStats: () => API.get('/admin/region-stats'),
  getDepartments: (params) => API.get('/admin/departments', { params }),
  // Subcity admin account provisioning (admin only)
  createSubcityAdmin: (data) => API.post('/admin/subcity-admins', data),
  // Create a subcity admin account — role (subcity_bole, …) is derived from the
  // selected subcity on the server, never chosen manually.
  createSubcityUser: (data) => API.post('/admin/subcity-users', data),
  resetSubcityAdminPassword: (id, data) => API.put(`/admin/subcity-admins/${id}/reset-password`, data),
  // Woreda admin accounts (admin only) — scoped to a subcity + woreda.
  createWoredaAdmin: (data) => API.post('/admin/woreda-admins', data),
  // Department officer accounts (admin only) — scoped to subcity + woreda + department.
  createDepartmentOfficer: (data) => API.post('/admin/department-officers', data),
  // Woreda master data (admin only)
  getWoredas: (params) => API.get('/woredas', { params }),
  getWoredasBySubcity: (subcityId) => API.get(`/woredas/by-subcity/${subcityId}`),
  createWoreda: (data) => API.post('/woredas', data),
  updateWoreda: (id, data) => API.put(`/woredas/${id}`, data),
  deleteWoreda: (id, params) => API.delete(`/woredas/${id}`, { params }),
  getWoredaDeps: (id) => API.get(`/woredas/${id}/deps`),
  // Department master data (admin only)
  getManagedDepartments: (params) => API.get('/departments', { params }),
  getDepartmentsBySubcity: (subcityId) => API.get(`/departments/by-subcity/${subcityId}`),
  createDepartment: (data) => API.post('/departments', data),
  updateDepartment: (id, data) => API.put(`/departments/${id}`, data),
  deleteDepartment: (id) => API.delete(`/departments/${id}`),
  getSubcities: () => API.get('/admin/subcities'),
  createSubcity: (data) => API.post('/admin/subcities', data),
  updateSubcity: (id, data) => API.put(`/admin/subcities/${id}`, data),
  deleteSubcity: (id) => API.delete(`/admin/subcities/${id}`),
  getLocations: () => API.get('/admin/locations'),
  getActivityLogs: (params) => API.get('/admin/activity-logs', { params }),
  getUsers: (params) => API.get('/admin/users', { params }),
  createUser: (data) => API.post('/admin/users', data),
  updateUser: (id, data) => API.put(`/admin/users/${id}`, data),
  approveUser: (id, data) => API.put(`/admin/users/${id}/approve`, data),
  toggleActive: (id) => API.put(`/admin/users/${id}/toggle-active`),
  deleteUser: (id) => API.delete(`/admin/users/${id}`),
  getPendingApprovals: () => API.get('/admin/pending-approvals'),
  resetPassword: (id, data) => API.put(`/admin/users/${id}/reset-password`, data),

  // ---- IssueType management ----
  getIssueTypes:    (params) => API.get('/admin/issue-types', { params }),
  createIssueType:  (data)   => API.post('/admin/issue-types', data),
  updateIssueType:  (id, data) => API.put(`/admin/issue-types/${id}`, data),
  toggleIssueType:  (id)     => API.patch(`/admin/issue-types/${id}/toggle`),
  deleteIssueType:  (id)     => API.delete(`/admin/issue-types/${id}`),
  seedIssueTypes:   ()       => API.post('/admin/issue-types/seed'),
};

// ---- Unified Report Submission (public, anonymous allowed) ----
// The single source of truth for SUBMISSION forms. Each form posts to its own
// endpoint so the backend always stores the report under the correct collection
// with the correct report_type — for logged-in and anonymous citizens alike:
//   POST /api/reports/infrastructure   → InfrastructureReport (IR-… reportId)
//   POST /api/reports/public-complaint → PublicComplaint     (trackingNumber)
export const reportAPI = {
  createInfrastructure: (data) => API.post('/reports/infrastructure', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
  createPublicComplaint: (data) => API.post('/reports/public-complaint', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
};

// ---- Public ----
export const publicAPI = {
  getStats: () => API.get('/public/stats'),
  getRegionStats: () => API.get('/public/region-stats'),
  getMapMarkers: () => API.get('/public/map-markers'),
  getVolunteers: (params) => API.get('/public/volunteers', { params }),
  submitContact: (data) => API.post('/public/contact', data),
  getSubcityWoredas: (subcity) => API.get('/public-complaints/subcity-woredas', { params: { subcity } }),
  getDepartments: (params) => API.get('/public/departments', { params }),
  getSubcities: () => API.get('/public/subcities'),
};

// ---- Users (role-scoped lists for assignment dropdowns) ----
// The ONLY allowed source for officer / technician dropdowns. These endpoints
// filter by role + location on the server — never reuse the full user list.
export const userAPI = {
  getOfficers: (params) => API.get('/users/officers', { params }),
  getTechnicians: (params) => API.get('/users/technicians', { params }),
};

// ---- Public Complaints ----
export const complaintAPI = {  create: (data) => API.post('/public-complaints', data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
  getAll: (params) => API.get('/public-complaints', { params }),
  getOne: (id) => API.get(`/public-complaints/${id}`),
  track: (trackingNumber, params) => API.get(`/public-complaints/track/${trackingNumber}`, { params }),
  updateStatus: (id, data) => API.patch(`/public-complaints/${id}/status`, data),
  getStats: () => API.get('/public-complaints/stats'),
  getAssignableUsers: (params) => API.get('/public-complaints/assignable-users', { params }),
  assignOfficer: (id, data) => API.put(`/public-complaints/${id}/assign-officer`, data),
  assignTechnician: (id, data) => API.put(`/public-complaints/${id}/assign-technician`, data),
  acceptOfficer: (id) => API.put(`/public-complaints/${id}/accept-officer`, {}),
  updateTechnicianWorkState: (id, data) => API.put(`/public-complaints/${id}/technician-work-state`, data),
  verifyWork: (id, data) => API.put(`/public-complaints/${id}/verify`, data),
  closeComplaint: (id, data) => API.put(`/public-complaints/${id}/close`, data),
  escalate: (id, data) => API.put(`/public-complaints/${id}/escalate`, data),
  addInternalNote: (id, data) => API.post(`/public-complaints/${id}/internal-notes`, data),
  // Citizen complaint workflow — department officer actions
  acceptComplaint: (id) => API.post(`/public-complaints/${id}/accept`),
  rejectComplaint: (id, data) => API.post(`/public-complaints/${id}/reject`, data),
  requestMoreInfo: (id, data) => API.post(`/public-complaints/${id}/request-info`, data),
  markWaitingParts: (id, data) => API.post(`/public-complaints/${id}/waiting-parts`, data),
  forwardToSubcity: (id, data) => API.post(`/public-complaints/${id}/forward`, data),
  resolveBySubcity: (id, data) => API.post(`/public-complaints/${id}/resolve-by-subcity`, data),
  getAudit: (id) => API.get(`/public-complaints/${id}/audit`),
};

// ---- Public Alerts & Broadcasts ----
export const alertAPI = {
  // Public
  getActive: (params) => API.get('/alerts', { params }),
  getOne: (id) => API.get(`/alerts/${id}`),
  // Citizen — location-matched alerts + subscription preferences
  getMyAlerts: (params) => API.get('/alerts/my', { params }),
  getSubscriptions: () => API.get('/alerts/subscriptions/me'),
  updateSubscriptions: (data) => API.put('/alerts/subscriptions/me', data),
  // Management (role-scoped)
  getAll: (params) => API.get('/alerts/manage', { params }),
  getManaged: (id) => API.get(`/alerts/manage/${id}`),
  create: (data) => API.post('/alerts', data),
  update: (id, data) => API.put(`/alerts/${id}`, data),
  updateStatus: (id, data) => API.patch(`/alerts/${id}/status`, data),
  delete: (id) => API.delete(`/alerts/${id}`),
  // Analytics
  getStats: () => API.get('/alerts/stats'),
  getAnalytics: () => API.get('/alerts/analytics'),
  getAuditLogs: (params) => API.get('/alerts/audit', { params }),
  exportAlerts: (format, params) => API.get('/alerts/export', { params: { ...params, format }, responseType: 'blob' }),
  getComplaintClusters: (params) => API.get('/alerts/complaint-clusters', { params }),
};

// ---- Workflow (Administrative Levels) ----
export const workflowAPI = {
  getStats: () => API.get('/workflow/stats'),
  getHierarchy: () => API.get('/workflow/hierarchy'),
  getReports: (params) => API.get('/workflow/reports', { params }),
  getReportDetail: (id) => API.get(`/workflow/reports/${id}`),
  forwardReport: (id, data) => API.post(`/workflow/reports/${id}/forward`, data),
  resolveReport: (id, data) => API.post(`/workflow/reports/${id}/resolve`, data),
  closeCase: (id, data) => API.post(`/workflow/reports/${id}/close`, data),
  addComment: (id, data) => API.post(`/workflow/reports/${id}/comment`, data),
  getOfficersAtLevel: (level) => API.get(`/workflow/officers/${level}`),
};

// ---- Campaigns / Fundraising ----
export const campaignAPI = {
  getPublic: (params) => API.get('/campaigns/public', { params }),
  getPublicCampaign: (id) => API.get(`/campaigns/public/${id}`),
  getSuccessStories: () => API.get('/campaigns/public/success-stories'),
  getTopDonors: () => API.get('/campaigns/public/top-donors'),

  getAll: (params) => API.get('/campaigns', { params }),
  getMy: (params) => API.get('/campaigns/my', { params }),
  getOne: (id) => API.get(`/campaigns/public/${id}`),
  create: (data) => API.post('/campaigns', data),
  update: (id, data) => API.put(`/campaigns/${id}`, data),
  delete: (id) => API.delete(`/campaigns/${id}`),
  approve: (id) => API.put(`/campaigns/${id}/approve`),
  reject: (id) => API.put(`/campaigns/${id}/reject`),
  getStats: () => API.get('/campaigns/stats'),

  donate: (data) => API.post('/campaigns/donate', data),
  getDonationHistory: (params) => API.get('/campaigns/donations/history', { params }),
  getReceipt: (receiptNumber) => API.get(`/campaigns/donations/receipt/${receiptNumber}`),
  getMyReceipts: () => API.get('/campaigns/donations/receipts/my'),

  saveCampaign: (id) => API.post(`/campaigns/${id}/save`),
  getSavedCampaigns: () => API.get('/campaigns/saved/my'),

  getFinancialReports: () => API.get('/campaigns/financial/reports'),
  getFinancialAnalytics: () => API.get('/campaigns/financial/analytics'),
  getDistributionReports: () => API.get('/campaigns/financial/distribution'),
  detectFraud: () => API.get('/campaigns/admin/fraud-detection'),

  // Report-to-Campaign Integration
  getAvailableReports: () => API.get('/campaigns/available-reports'),
  createFromReport: (data) => API.post('/campaigns/create-from-report', data),
};

// ---- Subcity Dashboard ----
export const subcityAPI = {
  getStats: () => API.get('/subcity/stats'),
  getReports: (params) => API.get('/subcity/reports', { params }),
  getReportDetail: (id) => API.get(`/subcity/reports/${id}`),
  updateReportStatus: (id, data) => API.put(`/subcity/reports/${id}/status`, data),
  getNotifications: () => API.get('/subcity/notifications'),
  getCitizens: () => API.get('/subcity/citizens'),
};

// ---- Woreda ----
export const woredaAPI = {
  getList: () => API.get('/woreda'),
  getStats: () => API.get('/woreda/stats'),
  getReports: (params) => API.get('/woreda/reports', { params }),
  getReportDetail: (id) => API.get(`/woreda/reports/${id}`),
  assignToDepartment: (id, data) => API.put(`/woreda/reports/${id}/assign-department`, data),
};

// ---- Department ----
export const deptAPI = {
  getStats: () => API.get('/department/stats'),
  getReports: (params) => API.get('/department/reports', { params }),
  getReportDetail: (id) => API.get(`/department/reports/${id}`),
  acceptReport: (id) => API.put(`/department/reports/${id}/accept`),
  rejectReport: (id, data) => API.put(`/department/reports/${id}/reject`, data),
  startWorking: (id) => API.put(`/department/reports/${id}/start`),
  markComplete: (id, data) => API.put(`/department/reports/${id}/complete`, data, {
    headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  }),
  // Public complaints routed to this department
  getComplaints: (params) => API.get('/department/complaints', { params }),
  updateComplaintStatus: (id, data) => API.patch(`/department/complaints/${id}/status`, data),
};

// ---- Workflow Complaints ----
export const workflowComplaintAPI = {
  // Master data
  getIssueTypes: (params) => API.get('/workflow-complaints/issue-types', { params }),

  // Citizen submission
  create: (data) =>
    API.post('/workflow-complaints', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),

  // Listing & detail (role-scoped on the server)
  getAll: (params) => API.get('/workflow-complaints', { params }),
  getOne: (id) => API.get(`/workflow-complaints/${id}`),
  track: (trackingNumber) => API.get(`/workflow-complaints/track/${trackingNumber}`),

  // Stats & analytics
  getStats: () => API.get('/workflow-complaints/stats'),
  getAnalytics: (params) => API.get('/workflow-complaints/analytics', { params }),

  // Woreda actions
  woredaResolve: (id, data) => API.patch(`/workflow-complaints/${id}/woreda-resolve`, data),
  woredaEscalate: (id, data) => API.patch(`/workflow-complaints/${id}/woreda-escalate`, data),

  // Subcity / department action
  subcityResolve: (id, data) => API.patch(`/workflow-complaints/${id}/subcity-resolve`, data),

  // Admin
  runEscalation: () => API.post('/workflow-complaints/admin/run-escalation'),
};

// Municipal complaint management workflow (Citizens / Woreda / Subcity / Admin)
export const municipalComplaintAPI = {
  // Built-in issue templates (Electricity / Water / Road, Woreda + Subcity levels)
  getIssueTemplates: (params) => API.get('/municipal-complaints/issue-templates', { params }),

  // Citizen submission (photos + videos via FormData under field 'media')
  create: (data) =>
    API.post('/municipal-complaints', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),

  // Role-scoped listing / detail / public tracking
  getAll: (params) => API.get('/municipal-complaints', { params }),
  getOne: (id) => API.get(`/municipal-complaints/${id}`),
  track: (trackingId) => API.get(`/municipal-complaints/track/${trackingId}`),

  // Workflow actions
  assess: (id, data) => API.post(`/municipal-complaints/${id}/assess`, data),
  forward: (id, data) => API.post(`/municipal-complaints/${id}/forward`, data),
  updateStatus: (id, data) =>
    API.post(`/municipal-complaints/${id}/status`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  addNote: (id, data) => API.post(`/municipal-complaints/${id}/notes`, data),
  escalate: (id, data) => API.post(`/municipal-complaints/${id}/escalate`, data),
  getAuditTrail: (id) => API.get(`/municipal-complaints/${id}/audit`),

  // Operational workflow
  getAssignable: (params) => API.get('/municipal-complaints/assignable', { params }),
  accept: (id) => API.post(`/municipal-complaints/${id}/accept`),
  reject: (id, data) => API.post(`/municipal-complaints/${id}/reject`, data),
  assignInspector: (id, data) => API.post(`/municipal-complaints/${id}/assign-inspector`, data),
  assignTechnician: (id, data) => API.post(`/municipal-complaints/${id}/assign-technician`, data),
  startWork: (id) => API.post(`/municipal-complaints/${id}/start-work`),
  completeWork: (id, data) =>
    API.post(`/municipal-complaints/${id}/complete-work`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  verifyResolution: (id, data) => API.post(`/municipal-complaints/${id}/verify-resolution`, data),
  reopen: (id) => API.post(`/municipal-complaints/${id}/reopen`),
  close: (id) => API.post(`/municipal-complaints/${id}/close`),
  feedback: (id, data) => API.post(`/municipal-complaints/${id}/feedback`, data),

  // Dashboard widgets + exports
  getStats: () => API.get('/municipal-complaints/stats'),
  exportPDF: (params) =>
    API.get('/municipal-complaints/export/pdf', { params, responseType: 'blob' }),
  exportExcel: (params) =>
    API.get('/municipal-complaints/export/excel', { params, responseType: 'blob' }),

  // Admin
  runEscalation: () => API.post('/municipal-complaints/admin/run-escalation'),
};

// Service Governance complaint system (Public + Citizen submission, Subcity
// Governance Office investigation, Woreda coordination). One shared workflow.
export const governanceComplaintAPI = {
  // Shared submission — anonymous public visitors and logged-in citizens post
  // to the SAME endpoint so a complaint never creates duplicate records.
  create: (data) =>
    API.post('/governance-complaints', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),

  // Role-scoped listing / detail
  getAll: (params) => API.get('/governance-complaints', { params }),
  getOne: (id) => API.get(`/governance-complaints/${id}`),

  // Public tracking (by trackingId + phone) and reporter reopen
  track: (trackingId, params) => API.get(`/governance-complaints/track/${trackingId}`, { params }),
  reopenByTracking: (data) => API.post('/governance-complaints/reopen-by-tracking', data),

  // Citizen actions
  addEvidence: (id, data) =>
    API.post(`/governance-complaints/${id}/evidence`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  reopen: (id, data) => API.post(`/governance-complaints/${id}/reopen`, data),
  confirmResolution: (id) => API.post(`/governance-complaints/${id}/confirm-resolution`),
  acknowledgment: (id) =>
    API.get(`/governance-complaints/${id}/acknowledgment`, { responseType: 'blob' }),

  // Subcity Governance Office actions
  updateStatus: (id, data) => API.post(`/governance-complaints/${id}/status`, data),
  assignableOfficers: (id) => API.get(`/governance-complaints/${id}/assignable-officers`),
  assign: (id, data) => API.post(`/governance-complaints/${id}/assign`, data),
  respondToCitizen: (id, data) =>
    API.post(`/governance-complaints/${id}/respond`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  requestMoreInfo: (id, data) => API.post(`/governance-complaints/${id}/request-info`, data),
  requestWoredaInfo: (id, data) => API.post(`/governance-complaints/${id}/request-woreda`, data),
  addNote: (id, data) => API.post(`/governance-complaints/${id}/notes`, data),
  uploadOfficialDocument: (id, data) =>
    API.post(`/governance-complaints/${id}/documents`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  recordAdministrativeAction: (id, data) =>
    API.post(`/governance-complaints/${id}/administrative-action`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
  resolve: (id, data) => API.post(`/governance-complaints/${id}/resolve`, data),
  reject: (id, data) => API.post(`/governance-complaints/${id}/reject`, data),
  escalate: (id, data) => API.post(`/governance-complaints/${id}/escalate`, data),

  // Woreda coordination
  respondWoreda: (id, data) =>
    API.post(`/governance-complaints/${id}/respond-woreda`, data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),

  // Dashboard widgets + exports
  getStats: () => API.get('/governance-complaints/stats'),
  getAnalytics: (params) => API.get('/governance-complaints/analytics', { params }),
  getAuditTrail: (id) => API.get(`/governance-complaints/${id}/audit`),
  exportPDF: (params) =>
    API.get('/governance-complaints/export/pdf', { params, responseType: 'blob' }),
  exportExcel: (params) =>
    API.get('/governance-complaints/export/excel', { params, responseType: 'blob' }),
};

// Governance Management — DB-driven Government Offices, per-office Complaint
// Categories and Governance Officers. Public read endpoints serve the dynamic
// public submission form; the rest are scoped to the Subcity Admin.
export const governanceManagementAPI = {
  // ── Public form dropdowns (spec'd alias routes) ──
  getPublicOffices: (params) => API.get('/government-offices', { params }),
  getPublicCategories: (params) => API.get('/complaint-categories', { params }),

  // ── Public form dropdowns (management-mounted aliases) ──
  getOffices: (params) => API.get('/governance-management/offices', { params }),
  getCategories: (params) => API.get('/governance-management/categories', { params }),

  // ── Simplified governance forms (spec'd endpoints) ──
  // All active subcities created by the System Admin (Admin Dashboard).
  getSubcities: () => API.get('/subcities'),
  // Active government offices belonging to one subcity (public read) — drives
  // the dynamic "Government Office" dropdown when the Subcity changes.
  getOfficesBySubcity: (subcityId) => API.get(`/government-offices/by-subcity/${subcityId}`),
  // POST /api/government-offices — { subcityId, officeName, status }
  createOffice: (data) => API.post('/government-offices', data),
  // POST /api/governance-users — { fullName, email, password, phoneNumber, subcityId, governmentOfficeId, role, status }
  createOfficer: (data) => API.post('/governance-users', data),

  // ── Subcity Admin — Government Office management ──
  // Primary routes use the subcity-scoped endpoints (/api/subcity/*) which are
  // restricted to subcity_* roles. The /api/governance-management/* equivalents
  // remain available for platform admins (read-only analytics use case).
  getManagedOffices: () => API.get('/subcity/government-offices'),
  getOffice: (id) => API.get(`/government-offices/${id}`),
  updateOffice: (id, data) => API.put(`/subcity/government-offices/${id}`, data),
  toggleOffice: (id) => API.patch(`/subcity/government-offices/${id}/toggle`),
  deleteOffice: (id) => API.delete(`/subcity/government-offices/${id}`),

  // ── Subcity Admin — Complaint Category management ──
  getManagedCategories: (officeId) =>
    API.get('/subcity/complaint-categories', { params: { officeId } }),
  createCategory: (data) => API.post('/subcity/complaint-categories', data),
  updateCategory: (id, data) => API.put(`/subcity/complaint-categories/${id}`, data),
  toggleCategory: (id) => API.patch(`/subcity/complaint-categories/${id}/toggle`),
  deleteCategory: (id) => API.delete(`/subcity/complaint-categories/${id}`),

  // ── Subcity Admin — Governance User management (officers + supervisors) ──
  getOfficers: (params) => API.get('/subcity/governance-users', { params }),
  getOfficer: (id) => API.get(`/governance-users/${id}`),
  updateOfficer: (id, data) => API.put(`/subcity/governance-users/${id}`, data),
  toggleOfficer: (id) => API.patch(`/subcity/governance-users/${id}/toggle`),
  deleteOfficer: (id) => API.delete(`/governance-users/${id}`),
  resetOfficerPassword: (id, data) =>
    API.put(`/subcity/governance-users/${id}/reset-password`, data),

  // ── Summary widget (subcity-scoped for subcity admins) ──
  getSummary: () => API.get('/subcity/summary'),

  // ── Platform Admin read-only aliases (cross-subcity analytics only) ──
  getAdminOffices: (params) => API.get('/governance-management/offices', { params }),
  getAdminCategories: (params) => API.get('/governance-management/categories', { params }),
  getAdminOfficers: (params) => API.get('/governance-management/officers', { params }),
  getAdminSummary: (params) => API.get('/governance-management/summary', { params }),

  // ── SLA rules (category-based response deadlines) ──
  // Subcity admins manage their own subcity's rules; platform admins manage the
  // global defaults (both sets are allowed on the same endpoints).
  getSlaRules: (params) => API.get('/subcity/sla-rules', { params }),
  getAdminSlaRules: (params) => API.get('/governance-management/sla-rules', { params }),
  upsertSlaRule: (data) => API.post('/subcity/sla-rules', data),
  upsertAdminSlaRule: (data) => API.post('/governance-management/sla-rules', data),
  deleteSlaRule: (id) => API.delete(`/subcity/sla-rules/${id}`),
  deleteAdminSlaRule: (id) => API.delete(`/governance-management/sla-rules/${id}`),
};

// ---- Government hierarchy (SUBCITY_ADMIN / WOREDA_ADMIN / OFFICER / TECHNICIAN) ----
export const hierarchyAPI = {
  // ── SUBCITY_ADMIN ──
  getSubcityMe: () => API.get('/hierarchy/subcity/me'),
  getSubcityStats: () => API.get('/hierarchy/subcity/stats'),
  getSubcityWoredas: (params) => API.get('/hierarchy/subcity/woredas', { params }),
  createSubcityWoreda: (data) => API.post('/hierarchy/subcity/woredas', data),
  updateSubcityWoreda: (id, data) => API.put(`/hierarchy/subcity/woredas/${id}`, data),
  deleteSubcityWoreda: (id) => API.delete(`/hierarchy/subcity/woredas/${id}`),
  createWoredaAdmin: (data) => API.post('/hierarchy/subcity/woreda-admins', data),
  resetWoredaAdminPassword: (id, data) => API.put(`/hierarchy/subcity/woreda-admins/${id}/reset-password`, data),
  getSubcityDepartments: (params) => API.get('/hierarchy/subcity/departments', { params }),
  createSubcityDepartment: (data) => API.post('/hierarchy/subcity/departments', data),
  updateSubcityDepartment: (id, data) => API.put(`/hierarchy/subcity/departments/${id}`, data),
  deleteSubcityDepartment: (id) => API.delete(`/hierarchy/subcity/departments/${id}`),
  getSubcityUsers: (params) => API.get('/hierarchy/subcity/users', { params }),
  createSubcityUser: (data) => API.post('/hierarchy/subcity/users', data),
  updateSubcityUser: (id, data) => API.put(`/hierarchy/subcity/users/${id}`, data),
  toggleSubcityUserActive: (id) => API.put(`/hierarchy/subcity/users/${id}/toggle-active`),
  deleteSubcityUser: (id) => API.delete(`/hierarchy/subcity/users/${id}`),
  getSubcityComplaints: (params) => API.get('/hierarchy/subcity/complaints', { params }),
  getSubcityAnalytics: () => API.get('/hierarchy/subcity/analytics'),

  // ── WOREDA_ADMIN ──
  getWoredaMe: () => API.get('/hierarchy/woreda/me'),
  getWoredaStats: () => API.get('/hierarchy/woreda/stats'),
  getWoredaDepartments: (params) => API.get('/hierarchy/woreda/departments', { params }),
  createWoredaDepartment: (data) => API.post('/hierarchy/woreda/departments', data),
  updateWoredaDepartment: (id, data) => API.put(`/hierarchy/woreda/departments/${id}`, data),
  deleteWoredaDepartment: (id) => API.delete(`/hierarchy/woreda/departments/${id}`),
  getWoredaStaff: (params) => API.get('/hierarchy/woreda/staff', { params }),
  createWoredaStaff: (data) => API.post('/hierarchy/woreda/staff', data),
  updateWoredaStaff: (id, data) => API.put(`/hierarchy/woreda/staff/${id}`, data),
  toggleWoredaStaffActive: (id) => API.put(`/hierarchy/woreda/staff/${id}/toggle-active`),
  deleteWoredaStaff: (id) => API.delete(`/hierarchy/woreda/staff/${id}`),
  getWoredaComplaints: (params) => API.get('/hierarchy/woreda/complaints', { params }),
  assignOfficer: (id, data) => API.put(`/hierarchy/woreda/complaints/${id}/assign-officer`, data),
  assignTechnician: (id, data) => API.put(`/hierarchy/woreda/complaints/${id}/assign-technician`, data),
  escalateComplaint: (id, data) => API.post(`/hierarchy/woreda/complaints/${id}/escalate`, data),
  closeComplaint: (id) => API.post(`/hierarchy/woreda/complaints/${id}/close`),
  getWoredaAnalytics: () => API.get('/hierarchy/woreda/analytics'),

  // ── OFFICER ──
  getOfficerMe: () => API.get('/hierarchy/officer/me'),
  getOfficerStats: () => API.get('/hierarchy/officer/stats'),
  getOfficerComplaints: (params) => API.get('/hierarchy/officer/complaints', { params }),
  verifyComplaint: (id, data) => API.put(`/hierarchy/officer/complaints/${id}/verify`, data),
  officerAssignTechnician: (id, data) => API.put(`/hierarchy/officer/complaints/${id}/assign-technician`, data),
  getOfficerTechnicians: (params) => API.get('/hierarchy/officer/technicians', { params }),

  // ── TECHNICIAN ──
  getTechnicianMe: () => API.get('/hierarchy/technician/me'),
  getTechnicianStats: () => API.get('/hierarchy/technician/stats'),
  getTechnicianWorkOrders: (params) => API.get('/hierarchy/technician/work-orders', { params }),
  startWork: (id) => API.put(`/hierarchy/technician/work-orders/${id}/start`),
  completeWork: (id, data) => API.put(`/hierarchy/technician/work-orders/${id}/complete`, data),
};

// ---- Donations (Donation Management System) ----
export const donationAPI = {
  // Public
  getOverview: () => API.get('/donations/overview'),
  getPaymentMethods: () => API.get('/donations/payment-methods'),
  create: (data) => API.post('/donations', data),
  track: (reference) => API.get(`/donations/track/${reference}`),
  uploadReceipt: (reference, formData) =>
    API.post(`/donations/${reference}/upload-receipt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  // Donor (authenticated)
  getMy: (params) => API.get('/donations/my', { params }),
  getMySummary: () => API.get('/donations/my/summary'),
  getCertificate: (id) => API.get(`/donations/${id}/certificate`, { responseType: 'blob' }),
  // Subcity / Woreda office dashboards
  getOffice: (params) => API.get('/donations/office', { params }),
  getOfficeStats: () => API.get('/donations/office/stats'),
  exportOffice: (format, params) => API.get('/donations/office/export', { params: { ...params, format }, responseType: 'blob' }),
  // Admin
  getAll: (params) => API.get('/donations', { params }),
  getOne: (id) => API.get(`/donations/${id}`),
  getStats: () => API.get('/donations/stats'),
  verify: (id) => API.post(`/donations/${id}/verify`),
  reject: (id, data) => API.post(`/donations/${id}/reject`, data),
  exportCsv: (params) => API.get('/donations/export/csv', { params, responseType: 'blob' }),
  exportExcel: (params) => API.get('/donations/export/excel', { params, responseType: 'blob' }),
  exportPdf: (params) => API.get('/donations/export/pdf', { params, responseType: 'blob' }),
  // Payment method management (admin)
  getAdminPaymentMethods: () => API.get('/donations/payment-methods/manage'),
  createPaymentMethod: (data) => API.post('/donations/payment-methods', data),
  updatePaymentMethod: (id, data) => API.put(`/donations/payment-methods/${id}`, data),
  deletePaymentMethod: (id) => API.delete(`/donations/payment-methods/${id}`),
};

export default API;

