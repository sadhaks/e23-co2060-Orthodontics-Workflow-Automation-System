import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { apiService } from '../services/api';

export type UserRole = 'ADMIN' | 'ORTHODONTIST' | 'DENTAL_SURGEON' | 'NURSE' | 'STUDENT' | 'RECEPTION';

interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  must_change_password?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }>;
  loginWithGoogle: (idToken: string) => Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing tokens on mount
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
          setIsLoading(false);
          return;
        }

        const response = await apiService.auth.getProfile();
        if (response.success && response.data) {
          setUser({
            ...response.data,
            role: response.data.role as UserRole
          });
        }
      } catch (error) {
        // Token might be expired or invalid, clear it
        console.log('No valid session found');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> => {
    try {
      const response = await apiService.auth.login({ email, password });
      
      if (response.success && response.data) {
        // Store tokens are handled automatically by the API service
        setUser({
          ...response.data.user,
          role: response.data.user.role as UserRole
        });
        return {
          success: true,
          requiresPasswordChange: Boolean(response.data.user.must_change_password)
        };
      } else {
        return { success: false, error: response.message || 'Login failed' };
      }
    } catch (error: any) {
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  const loginWithGoogle = async (idToken: string): Promise<{ success: boolean; error?: string; requiresPasswordChange?: boolean }> => {
    try {
      const response = await apiService.auth.loginWithGoogle(idToken);

      if (response.success && response.data) {
        setUser({
          ...response.data.user,
          role: response.data.user.role as UserRole
        });
        return {
          success: true,
          requiresPasswordChange: Boolean(response.data.user.must_change_password)
        };
      }
      return { success: false, error: response.message || 'Google login failed' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Google login failed' };
    }
  };

  const logout = async () => {
    try {
      await apiService.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
    }
  };

  const refreshProfile = async () => {
    try {
      const response = await apiService.auth.getProfile();
      if (response.success && response.data) {
        setUser({
          ...response.data,
          role: response.data.role as UserRole
        });
      }
    } catch (error) {
      console.error('Profile refresh error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithGoogle, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
