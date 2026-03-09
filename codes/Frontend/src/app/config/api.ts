// API Configuration for OrthoFlow Frontend
export const API_CONFIG = {
  BASE_URL: 'http://localhost:3000', // Update this for production
  TIMEOUT: 10000, // 10 seconds
  RETRY_ATTEMPTS: 3,
};

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/api/auth/login',
    GOOGLE: '/api/auth/google',
    REFRESH: '/api/auth/refresh',
    LOGOUT: '/api/auth/logout',
    PROFILE: '/api/auth/profile',
    CHANGE_PASSWORD: '/api/auth/change-password',
  },
  
  // Users
  USERS: {
    LIST: '/api/users',
    DETAIL: (id: string) => `/api/users/${id}`,
    CREATE: '/api/users',
    UPDATE: (id: string) => `/api/users/${id}`,
    DELETE: (id: string) => `/api/users/${id}`,
    RESET_PASSWORD: (id: string) => `/api/users/${id}/reset-password`,
    STATS: '/api/users/stats',
    STAFF: '/api/users/staff'
  },

  // Patients
  PATIENTS: {
    LIST: '/api/patients',
    ORTHODONTISTS: '/api/patients/orthodontists',
    ASSIGNABLE_STAFF: '/api/patients/assignable-staff',
    ASSIGNMENT_REQUESTS_PENDING: '/api/patients/assignment-requests/pending',
    ASSIGNMENT_REQUEST_RESPOND: (requestId: string) => `/api/patients/assignment-requests/${requestId}/respond`,
    DETAIL: (id: string) => `/api/patients/${id}`,
    CREATE: '/api/patients',
    UPDATE: (id: string) => `/api/patients/${id}`,
    DELETE: (id: string) => `/api/patients/${id}`,
    REACTIVATE: (id: string) => `/api/patients/${id}/reactivate`,
    STATS: '/api/patients/stats',
    ASSIGNMENTS: (id: string) => `/api/patients/${id}/assignments`,
    VISITS: (id: string) => `/api/visits/patients/${id}`,
    DOCUMENTS: (id: string) => `/api/documents/patients/${id}`,
    CLINICAL_NOTES: (id: string) => `/api/clinical-notes/patients/${id}`,
    PAYMENT_RECORDS: (id: string) => `/api/payment-records/patients/${id}`,
    MATERIAL_USAGES: (id: string) => `/api/patient-materials/patients/${id}`,
    HISTORY: (id: string) => `/api/patients/${id}/history`,
    DENTAL_CHART: (id: string) => `/api/patients/${id}/dental-chart`,
    DENTAL_CHART_TOOTH: (id: string, toothNumber: number) => `/api/patients/${id}/dental-chart/${toothNumber}`,
    DENTAL_CHART_CUSTOM: (id: string) => `/api/patients/${id}/dental-chart/custom`,
    DENTAL_CHART_CUSTOM_TOOTH: (id: string, toothCode: string) => `/api/patients/${id}/dental-chart/custom/${encodeURIComponent(toothCode)}`,
    DENTAL_CHART_VERSIONS: (id: string) => `/api/patients/${id}/dental-chart/versions`,
    DENTAL_CHART_VERSION_DOWNLOAD: (id: string, versionId: string) => `/api/patients/${id}/dental-chart/versions/${versionId}/download`,
    DENTAL_CHART_VERSION_DELETE: (id: string, versionId: string) => `/api/patients/${id}/dental-chart/versions/${versionId}`,
    DENTAL_CHART_VERSION_RESTORE: (id: string, versionId: string) => `/api/patients/${id}/dental-chart/versions/${versionId}/restore`,
  },
  
  // Visits
  VISITS: {
    TODAY: '/api/visits/today',
    LIST: '/api/visits',
    DETAIL: (id: string) => `/api/visits/${id}`,
    UPDATE: (id: string) => `/api/visits/${id}`,
    SEND_REMINDER: (id: string) => `/api/visits/${id}/send-reminder`,
    DELETE: (id: string) => `/api/visits/${id}`,
    STATS: '/api/visits/stats',
  },
  
  // Documents
  DOCUMENTS: {
    LIST: '/api/documents',
    DETAIL: (id: string) => `/api/documents/${id}`,
    DOWNLOAD: (id: string) => `/api/documents/${id}/download`,
    RESTORE: (id: string) => `/api/documents/${id}/restore`,
    UPDATE: (id: string) => `/api/documents/${id}`,
    DELETE: (id: string) => `/api/documents/${id}`,
    STATS: '/api/documents/stats',
    PATIENT_DOCS: (patientId: string) => `/api/documents/patients/${patientId}`,
  },
  
  // Clinical Notes
  CLINICAL_NOTES: {
    LIST: '/api/clinical-notes',
    DETAIL: (id: string) => `/api/clinical-notes/${id}`,
    UPDATE: (id: string) => `/api/clinical-notes/${id}`,
    DELETE: (id: string) => `/api/clinical-notes/${id}`,
    VERIFY: (id: string) => `/api/clinical-notes/${id}/verify`,
    STATS: '/api/clinical-notes/stats',
    PATIENT_NOTES: (patientId: string) => `/api/clinical-notes/patients/${patientId}`,
    CREATE: (patientId: string) => `/api/clinical-notes/patients/${patientId}`,
  },

  PAYMENT_RECORDS: {
    DETAIL: (id: string) => `/api/payment-records/${id}`,
    UPDATE: (id: string) => `/api/payment-records/${id}`,
    DELETE: (id: string) => `/api/payment-records/${id}`,
    RESTORE: (id: string) => `/api/payment-records/${id}/restore`,
    PATIENT_RECORDS: (patientId: string) => `/api/payment-records/patients/${patientId}`,
    CREATE: (patientId: string) => `/api/payment-records/patients/${patientId}`,
  },

  PATIENT_MATERIALS: {
    DETAIL: (id: string) => `/api/patient-materials/${id}`,
    UPDATE: (id: string) => `/api/patient-materials/${id}`,
    DELETE: (id: string) => `/api/patient-materials/${id}`,
    RESTORE: (id: string) => `/api/patient-materials/${id}/restore`,
    PATIENT_RECORDS: (patientId: string) => `/api/patient-materials/patients/${patientId}`,
    CREATE: (patientId: string) => `/api/patient-materials/patients/${patientId}`,
  },
  
  // Queue
  QUEUE: {
    LIST: '/api/queue',
    DETAIL: (id: string) => `/api/queue/${id}`,
    UPDATE: (id: string) => `/api/queue/${id}/status`,
    DELETE: (id: string) => `/api/queue/${id}`,
    STATS: '/api/queue/stats',
    ADD: '/api/queue',
    REMOVE: (id: string) => `/api/queue/${id}`
  },
  
  // Cases
  CASES: {
    LIST: '/api/cases',
    DETAIL: (id: string) => `/api/cases/${id}`,
    CREATE: '/api/cases',
    UPDATE: (id: string) => `/api/cases/${id}`,
    DELETE: (id: string) => `/api/cases/${id}`,
    STATS: '/api/cases/stats',
    STUDENT_CASES: (studentId: string) => `/api/cases/students/${studentId}`,
  },
  
  // Inventory
  INVENTORY: {
    LIST: '/api/inventory',
    DETAIL: (id: string) => `/api/inventory/${id}`,
    CREATE: '/api/inventory',
    UPDATE: (id: string) => `/api/inventory/${id}`,
    DELETE: (id: string) => `/api/inventory/${id}`,
    RESTORE: (id: string) => `/api/inventory/${id}/restore`,
    STATS: '/api/inventory/stats',
    UPDATE_STOCK: (id: string) => `/api/inventory/${id}/stock`,
  },
  
  // Users (Admin only)
  USERS_ADMIN: {
    LIST: '/api/users',
    DETAIL: (id: string) => `/api/users/${id}`,
    CREATE: '/api/users',
    UPDATE: (id: string) => `/api/users/${id}`,
    DELETE: (id: string) => `/api/users/${id}`,
    STATS: '/api/users/stats',
    STAFF: '/api/users/staff',
  },
  
  // Reports (Admin only)
  REPORTS: {
    PATIENT_STATUS: '/api/reports/patient-status',
    VISIT_SUMMARY: '/api/reports/visit-summary',
    INVENTORY_ALERTS: '/api/reports/inventory-alerts',
    DASHBOARD: '/api/reports/dashboard',
    AUDIT_LOGS: '/api/reports/audit-logs',
  },
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'Session expired. Please login again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'Resource not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
} as const;
