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
  createDepartment: (data) => API.post('/admin/departments', data),
  updateDepartment: (id, data) => API.put(`/admin/departments/${id}`, data),
  deleteDepartment: (id) => API.delete(`/admin/departments/${id}`),
  // Subcity-scoped department management (Admin)
  getSubcityDepartments: (subcityId) => API.get(`/admin/subcities/${subcityId}/departments`),
  createSubcityDepartment: (subcityId, data) => API.post(`/admin/subcities/${subcityId}/departments`, data),
  updateSubcityDepartment: (subcityId, deptId, data) => API.put(`/admin/subcities/${subcityId}/departments/${deptId}`, data),
  deleteSubcityDepartment: (subcityId, deptId) => API.delete(`/admin/subcities/${subcityId}/departments/${deptId}`),
  getWoredas: (params) => API.get('/admin/woredas', { params }),
  createWoreda: (data) => API.post('/admin/woredas', data),
  updateWoreda: (id, data) => API.put(`/admin/woredas/${id}`, data),
  deleteWoreda: (id) => API.delete(`/admin/woredas/${id}`),
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
  track: (trackingNumber) => API.get(`/public-complaints/track/${trackingNumber}`),
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
};

// ---- Alert Broadcasts ----
export const alertAPI = {
  create: (data) => API.post('/alerts', data),
  getActive: (params) => API.get('/alerts', { params }),
  getOne: (id) => API.get(`/alerts/${id}`),
  updateStatus: (id, data) => API.patch(`/alerts/${id}/status`, data),
  delete: (id) => API.delete(`/alerts/${id}`),
  getStats: () => API.get('/alerts/stats'),
  getAll: (params) => API.get('/alerts', { params: { ...params, status: undefined } }),
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

export default API;

