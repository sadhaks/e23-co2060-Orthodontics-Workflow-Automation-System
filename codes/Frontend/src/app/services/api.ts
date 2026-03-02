// API Service for OrthoFlow Frontend
import { API_CONFIG, API_ENDPOINTS, HTTP_STATUS, ERROR_MESSAGES } from '../config/api';

// Types for API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    current_page: number;
    total_pages: number;
    total_records: number;
    limit: number;
  };
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    department: string;
    must_change_password?: boolean;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string;
  must_change_password?: boolean;
}

export interface CreateUserForm {
  name: string;
  email: string;
  password?: string;
  role: string;
  department: string;
}

// HTTP Client with interceptors
class ApiClient {
  private baseURL: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.baseURL = API_CONFIG.BASE_URL;
    this.loadTokensFromStorage();
  }

  // Token management
  private loadTokensFromStorage() {
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  private saveTokensToStorage(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  private clearTokensFromStorage() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  // Request helper
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    // Always fetch fresh API state for GET requests (important for explicit Refresh actions)
    if ((config.method || 'GET').toUpperCase() === 'GET') {
      config.cache = 'no-store';
    }

    // Add auth header if token exists
    if (this.accessToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.accessToken}`,
      };
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      // Handle 401 Unauthorized - try refresh token
      if (response.status === HTTP_STATUS.UNAUTHORIZED && this.refreshToken) {
        const refreshSuccess = await this.refreshAccessToken();
        if (refreshSuccess) {
          // Retry original request with new token
          config.headers = {
            ...config.headers,
            Authorization: `Bearer ${this.accessToken}`,
          };
          const retryResponse = await fetch(url, config);
          return await retryResponse.json();
        } else {
          // Refresh failed, clear tokens and redirect to login
          this.clearTokensFromStorage();
          window.location.href = '/login';
          throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
        }
      }

      // Handle other HTTP errors
      if (!response.ok) {
        throw new Error(data.message || ERROR_MESSAGES.SERVER_ERROR);
      }

      return data;
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  }

  // Refresh access token
  private async refreshAccessToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.AUTH.REFRESH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken: this.refreshToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.tokens) {
          this.saveTokensToStorage(
            data.data.tokens.accessToken,
            data.data.tokens.refreshToken
          );
          return true;
        }
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }
    return false;
  }

  // HTTP Methods
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : null,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : null,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // File upload
  async uploadFile(
    endpoint: string,
    file: File,
    additionalData?: Record<string, string>,
    onProgress?: (percent: number) => void
  ): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('document', file);
    
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    return await new Promise<ApiResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseURL}${endpoint}`);

      if (this.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!onProgress) return;
        if (!event.lengthComputable) return;
        const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
        onProgress(percent);
      };

      xhr.onload = () => {
        try {
          const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(data.message || ERROR_MESSAGES.SERVER_ERROR));
            return;
          }
          onProgress?.(100);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };

      xhr.onerror = () => reject(new Error(ERROR_MESSAGES.NETWORK_ERROR));
      xhr.send(formData);
    }).catch((error) => {
      console.error('File Upload Error:', error);
      throw error;
    });
  }

  // Public methods for token management
  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  setTokens(accessToken: string, refreshToken: string) {
    this.saveTokensToStorage(accessToken, refreshToken);
  }

  clearTokens() {
    this.clearTokensFromStorage();
  }

  async downloadFile(endpoint: string): Promise<{ blob: Blob; filename: string | null }> {
    const headers: HeadersInit = {};
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.message || ERROR_MESSAGES.SERVER_ERROR);
    }

    const contentDisposition = response.headers.get('content-disposition');
    const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
    return { blob: await response.blob(), filename: match?.[1] || null };
  }
}

// Create singleton instance
const apiClient = new ApiClient();

// API Service functions
export const apiService = {
  // Authentication
  auth: {
    login: async (credentials: LoginRequest) => {
      const response = await apiClient.post<LoginResponse>(API_ENDPOINTS.AUTH.LOGIN, credentials);
      if (response.success && response.data?.tokens) {
        apiClient.setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
      }
      return response;
    },

    loginWithGoogle: async (idToken: string) => {
      const response = await apiClient.post<LoginResponse>(API_ENDPOINTS.AUTH.GOOGLE, { idToken });
      if (response.success && response.data?.tokens) {
        apiClient.setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
      }
      return response;
    },
    
    logout: async () => {
      const refreshToken = apiClient.getRefreshToken();
      try {
        if (refreshToken) {
          await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT, { refreshToken });
        } else {
          await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT);
        }
      } finally {
        apiClient.clearTokens();
      }
    },
    
    getProfile: () => 
      apiClient.get<User>(API_ENDPOINTS.AUTH.PROFILE),
    
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      apiClient.put(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, data),
  },

  // Users
  users: {
    getAll: (params?: { page?: number; limit?: number; role?: string; status?: string; department?: string; search?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.role) query.append('role', params.role);
      if (params?.status) query.append('status', params.status);
      if (params?.department) query.append('department', params.department);
      if (params?.search) query.append('search', params.search);
      
      const queryString = query.toString();
      const url = queryString ? `${API_ENDPOINTS.USERS.LIST}?${queryString}` : API_ENDPOINTS.USERS.LIST;
      return apiClient.get<any>(url);
    },

    getById: (id: string) => 
      apiClient.get<User>(API_ENDPOINTS.USERS.DETAIL(id)),

    create: (userData: CreateUserForm) =>
      apiClient.post<any>(API_ENDPOINTS.USERS.CREATE, userData),

    update: (id: string, userData: Partial<{ name: string; email: string; role: string; department: string; status: string; password: string }>) =>
      apiClient.put<any>(API_ENDPOINTS.USERS.UPDATE(id), userData),

    resetPassword: (id: string) =>
      apiClient.post<any>(API_ENDPOINTS.USERS.RESET_PASSWORD(id)),

    delete: (id: string, permanent = false) =>
      apiClient.delete<any>(`${API_ENDPOINTS.USERS.DELETE(id)}${permanent ? '?permanent=true' : ''}`),

    getStats: () => 
      apiClient.get<any>(API_ENDPOINTS.USERS.STATS),

    getStaff: () => 
      apiClient.get<any>(API_ENDPOINTS.USERS.STAFF)
  },

  // Patients
  patients: {
    getList: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      deleted?: 'active' | 'inactive' | 'all';
      sort?: string;
      order?: 'ASC' | 'DESC';
      assigned_orthodontist?: string | number;
      registered_from?: string;
      registered_to?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.search) query.append('search', params.search);
      if (params?.status) query.append('status', params.status);
      if (params?.deleted) query.append('deleted', params.deleted);
      if (params?.sort) query.append('sort', params.sort);
      if (params?.order) query.append('order', params.order);
      if (params?.assigned_orthodontist !== undefined && params?.assigned_orthodontist !== '') {
        query.append('assigned_orthodontist', String(params.assigned_orthodontist));
      }
      if (params?.registered_from) query.append('registered_from', params.registered_from);
      if (params?.registered_to) query.append('registered_to', params.registered_to);
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.PATIENTS.LIST}${queryString ? `?${queryString}` : ''}`);
    },
    
    getById: (id: string) => 
      apiClient.get(API_ENDPOINTS.PATIENTS.DETAIL(id)),
    
    create: (data: any) => 
      apiClient.post(API_ENDPOINTS.PATIENTS.CREATE, data),
    
    update: (id: string, data: any) => 
      apiClient.put(API_ENDPOINTS.PATIENTS.UPDATE(id), data),
    
    delete: (id: string, permanent = false) => 
      apiClient.delete(`${API_ENDPOINTS.PATIENTS.DELETE(id)}${permanent ? '?permanent=true' : ''}`),

    reactivate: (id: string) =>
      apiClient.put(API_ENDPOINTS.PATIENTS.REACTIVATE(id)),
    
    getStats: () => 
      apiClient.get(API_ENDPOINTS.PATIENTS.STATS),

    getOrthodontists: () =>
      apiClient.get<any[]>(API_ENDPOINTS.PATIENTS.ORTHODONTISTS),

    getAssignableStaff: (roles?: string[]) => {
      const query = new URLSearchParams();
      if (roles?.length) {
        query.append('roles', roles.join(','));
      }
      const queryString = query.toString();
      return apiClient.get<any[]>(`${API_ENDPOINTS.PATIENTS.ASSIGNABLE_STAFF}${queryString ? `?${queryString}` : ''}`);
    },

    getAssignments: (id: string) =>
      apiClient.get<any[]>(API_ENDPOINTS.PATIENTS.ASSIGNMENTS(id)),

    assign: (id: string, data: { user_id: number; assignment_role: 'ORTHODONTIST' | 'DENTAL_SURGEON' | 'NURSE' | 'STUDENT' }) =>
      apiClient.post(API_ENDPOINTS.PATIENTS.ASSIGNMENTS(id), data),

    bulkAssign: (
      id: string,
      assignments: Array<{ user_id: number; assignment_role: 'ORTHODONTIST' | 'DENTAL_SURGEON' | 'NURSE' | 'STUDENT' }>
    ) =>
      apiClient.post(API_ENDPOINTS.PATIENTS.ASSIGNMENTS(id), { assignments }),

    getHistory: (id: string) =>
      apiClient.get<any>(API_ENDPOINTS.PATIENTS.HISTORY(id)),

    updateHistory: (id: string, history: Record<string, any>) =>
      apiClient.put<any>(API_ENDPOINTS.PATIENTS.HISTORY(id), { history }),

    getDentalChart: (id: string) =>
      apiClient.get<any[]>(API_ENDPOINTS.PATIENTS.DENTAL_CHART(id)),

    upsertDentalChartTooth: (
      id: string,
      toothNumber: number,
      data: {
        status?: string;
        is_pathology?: boolean;
        is_planned?: boolean;
        is_treated?: boolean;
        is_missing?: boolean;
        pathology?: string;
        treatment?: string;
        event_date?: string;
      }
    ) =>
      apiClient.put(API_ENDPOINTS.PATIENTS.DENTAL_CHART_TOOTH(id, toothNumber), data),

    deleteDentalChartTooth: (id: string, toothNumber: number) =>
      apiClient.delete(API_ENDPOINTS.PATIENTS.DENTAL_CHART_TOOTH(id, toothNumber)),

    getCustomDentalChart: (id: string) =>
      apiClient.get<any[]>(API_ENDPOINTS.PATIENTS.DENTAL_CHART_CUSTOM(id)),

    upsertCustomDentalChartTooth: (
      id: string,
      toothCode: string,
      data: {
        dentition: 'ADULT' | 'MILK';
        notation_x: string;
        notation_y: string;
        status?: string;
        is_pathology?: boolean;
        is_planned?: boolean;
        is_treated?: boolean;
        is_missing?: boolean;
        pathology?: string;
        treatment?: string;
        event_date?: string;
      }
    ) =>
      apiClient.put(API_ENDPOINTS.PATIENTS.DENTAL_CHART_CUSTOM_TOOTH(id, toothCode), data),

    deleteCustomDentalChartTooth: (id: string, toothCode: string) =>
      apiClient.delete(API_ENDPOINTS.PATIENTS.DENTAL_CHART_CUSTOM_TOOTH(id, toothCode)),

    getDentalChartVersions: (id: string, params?: { page?: number; limit?: number; deleted?: 'active' | 'trashed' | 'all' }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));
      if (params?.deleted) query.append('deleted', params.deleted);
      const queryString = query.toString();
      return apiClient.get<any>(`${API_ENDPOINTS.PATIENTS.DENTAL_CHART_VERSIONS(id)}${queryString ? `?${queryString}` : ''}`);
    },

    createDentalChartVersion: (id: string, data?: { version_label?: string }) =>
      apiClient.post<any>(API_ENDPOINTS.PATIENTS.DENTAL_CHART_VERSIONS(id), data || {}),

    downloadDentalChartVersion: async (id: string, versionId: string) => {
      const { blob, filename } = await apiClient.downloadFile(API_ENDPOINTS.PATIENTS.DENTAL_CHART_VERSION_DOWNLOAD(id, versionId));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `dental-chart-version-${versionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    deleteDentalChartVersion: (id: string, versionId: string, permanent = false) =>
      apiClient.delete<any>(`${API_ENDPOINTS.PATIENTS.DENTAL_CHART_VERSION_DELETE(id, versionId)}${permanent ? '?permanent=true' : ''}`),

    restoreDentalChartVersion: (id: string, versionId: string) =>
      apiClient.put<any>(API_ENDPOINTS.PATIENTS.DENTAL_CHART_VERSION_RESTORE(id, versionId)),
  },

  // Visits
  visits: {
    getPatientVisits: (patientId: string, params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.PATIENTS.VISITS(patientId)}${queryString ? `?${queryString}` : ''}`);
    },
    
    create: (patientId: string, data: any) => 
      apiClient.post(API_ENDPOINTS.PATIENTS.VISITS(patientId), data),

    update: (visitId: string, data: any) =>
      apiClient.put(API_ENDPOINTS.VISITS.UPDATE(visitId), data),

    sendReminder: (visitId: string) =>
      apiClient.post(API_ENDPOINTS.VISITS.SEND_REMINDER(visitId)),
    
    getToday: () => 
      apiClient.get<any[]>(API_ENDPOINTS.VISITS.TODAY),
    
    getStats: () => 
      apiClient.get(API_ENDPOINTS.VISITS.STATS),
  },

  // Documents
  documents: {
    getPatientDocuments: (patientId: string, params?: { page?: number; limit?: number; deleted?: 'active' | 'trashed' | 'all' }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.deleted) query.append('deleted', params.deleted);
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.PATIENTS.DOCUMENTS(patientId)}${queryString ? `?${queryString}` : ''}`);
    },
    
    upload: (
      patientId: string,
      file: File,
      data: { type: string; description?: string },
      onProgress?: (percent: number) => void
    ) =>
      apiClient.uploadFile(API_ENDPOINTS.PATIENTS.DOCUMENTS(patientId), file, data, onProgress),
    
    download: async (id: string) => {
      const { blob, filename } = await apiClient.downloadFile(API_ENDPOINTS.DOCUMENTS.DOWNLOAD(id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `document-${id}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    delete: (id: string, permanent = false) =>
      apiClient.delete(`${API_ENDPOINTS.DOCUMENTS.DELETE(id)}${permanent ? '?permanent=true' : ''}`),

    restore: (id: string) =>
      apiClient.put(API_ENDPOINTS.DOCUMENTS.RESTORE(id)),
  },

  // Clinical Notes
  clinicalNotes: {
    getPatientNotes: (patientId: string, params?: { page?: number; limit?: number; deleted?: 'active' | 'trashed' | 'all' }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.deleted) query.append('deleted', params.deleted);
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.PATIENTS.CLINICAL_NOTES(patientId)}${queryString ? `?${queryString}` : ''}`);
    },
    
    create: (
      patientId: string,
      data: {
        content: string;
        note_type?: string;
        plan_procedure?: string;
        planned_for?: string;
        executed_at?: string;
        execution_status?: string;
        outcome_notes?: string;
      }
    ) =>
      apiClient.post(API_ENDPOINTS.PATIENTS.CLINICAL_NOTES(patientId), data),
    
    verify: (id: string, data: { verification_notes?: string }) =>
      apiClient.post(API_ENDPOINTS.CLINICAL_NOTES.VERIFY(id), data),

    delete: (id: string, permanent = false) =>
      apiClient.delete(`${API_ENDPOINTS.CLINICAL_NOTES.DELETE(id)}${permanent ? '?permanent=true' : ''}`),

    restore: (id: string) =>
      apiClient.put(`/api/clinical-notes/${id}/restore`),
  },

  // Queue
  queue: {
    getList: () => 
      apiClient.get<any>(API_ENDPOINTS.QUEUE.LIST),

    getStats: () =>
      apiClient.get<any>(API_ENDPOINTS.QUEUE.STATS),
    
    addToQueue: (data: any) => 
      apiClient.post(API_ENDPOINTS.QUEUE.ADD, data),
    
    updateStatus: (id: string, data: { status: string; notes?: string }) =>
      apiClient.put(API_ENDPOINTS.QUEUE.UPDATE(id), data),

    remove: (id: string) =>
      apiClient.delete(API_ENDPOINTS.QUEUE.REMOVE(id)),
  },

  // Cases
  cases: {
    getList: (params?: { page?: number; limit?: number; status?: string }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.status) query.append('status', params.status);
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.CASES.LIST}${queryString ? `?${queryString}` : ''}`);
    },
    
    getStudentCases: (studentId: string, params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.CASES.STUDENT_CASES(studentId)}${queryString ? `?${queryString}` : ''}`);
    },

    getStats: () =>
      apiClient.get<any>(API_ENDPOINTS.CASES.STATS),
  },

  // Inventory
  inventory: {
    getList: (params?: { page?: number; limit?: number; category?: string; search?: string; deleted?: 'active' | 'trashed' | 'all' }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      if (params?.category) query.append('category', params.category);
      if (params?.search) query.append('search', params.search);
      if (params?.deleted) query.append('deleted', params.deleted);
      
      const queryString = query.toString();
      return apiClient.get<PaginatedResponse<any>>(`${API_ENDPOINTS.INVENTORY.LIST}${queryString ? `?${queryString}` : ''}`);
    },

    create: (data: { name: string; category: string; quantity: number; minimum_threshold: number; unit: string }) =>
      apiClient.post(API_ENDPOINTS.INVENTORY.CREATE, data),

    update: (id: string, data: Partial<{ name: string; category: string; quantity: number; minimum_threshold: number; unit: string }>) =>
      apiClient.put(API_ENDPOINTS.INVENTORY.UPDATE(id), data),

    delete: (id: string, permanent = false) =>
      apiClient.delete(`${API_ENDPOINTS.INVENTORY.DELETE(id)}${permanent ? '?permanent=true' : ''}`),

    restore: (id: string) =>
      apiClient.put(API_ENDPOINTS.INVENTORY.RESTORE(id)),
    
    updateStock: (id: string, data: { transaction_type: string; quantity: number; reference_type: string; notes?: string }) =>
      apiClient.put(API_ENDPOINTS.INVENTORY.UPDATE_STOCK(id), data),

    getStats: () =>
      apiClient.get<any>(API_ENDPOINTS.INVENTORY.STATS),

    getTransactions: (params?: { page?: number; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', params.page.toString());
      if (params?.limit) query.append('limit', params.limit.toString());
      const queryString = query.toString();
      return apiClient.get<any>(`/api/inventory/transactions${queryString ? `?${queryString}` : ''}`);
    },
  },

  reports: {
    dashboard: (period?: 'week' | 'month' | 'quarter' | 'year') =>
      apiClient.get<any>(`${API_ENDPOINTS.REPORTS.DASHBOARD}${period ? `?period=${period}` : ''}`),
    patientStatus: (params?: { start_date?: string; end_date?: string; group_by?: string }) => {
      const query = new URLSearchParams();
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      if (params?.group_by) query.append('group_by', params.group_by);
      const queryString = query.toString();
      return apiClient.get<any>(`${API_ENDPOINTS.REPORTS.PATIENT_STATUS}${queryString ? `?${queryString}` : ''}`);
    },
    visitSummary: (params?: { start_date?: string; end_date?: string; group_by?: string }) => {
      const query = new URLSearchParams();
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      if (params?.group_by) query.append('group_by', params.group_by);
      const queryString = query.toString();
      return apiClient.get<any>(`${API_ENDPOINTS.REPORTS.VISIT_SUMMARY}${queryString ? `?${queryString}` : ''}`);
    },
    inventoryAlerts: (alert_type?: string) =>
      apiClient.get<any>(`${API_ENDPOINTS.REPORTS.INVENTORY_ALERTS}${alert_type ? `?alert_type=${alert_type}` : ''}`),
    auditLogs: (params?: {
      page?: number;
      limit?: number;
      action?: string;
      role?: string;
      entity_type?: string;
      user_id?: string | number;
      search?: string;
      start_date?: string;
      end_date?: string;
    }) => {
      const query = new URLSearchParams();
      if (params?.page) query.append('page', String(params.page));
      if (params?.limit) query.append('limit', String(params.limit));
      if (params?.action) query.append('action', params.action);
      if (params?.role) query.append('role', params.role);
      if (params?.entity_type) query.append('entity_type', params.entity_type);
      if (params?.user_id !== undefined && params?.user_id !== null && params?.user_id !== '') {
        query.append('user_id', String(params.user_id));
      }
      if (params?.search) query.append('search', params.search);
      if (params?.start_date) query.append('start_date', params.start_date);
      if (params?.end_date) query.append('end_date', params.end_date);
      const queryString = query.toString();
      return apiClient.get<any>(`${API_ENDPOINTS.REPORTS.AUDIT_LOGS}${queryString ? `?${queryString}` : ''}`);
    },
  },
};

export default apiService;
