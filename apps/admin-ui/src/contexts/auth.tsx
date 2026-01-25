// Auth context for managing user session state

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface Org {
  id: string;
  name: string;
}

interface AuthState {
  user: User | null;
  org: Org | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectOrg: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    org: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Check for existing session on mount
  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/get-session", {
          credentials: "include",
        });
        if (response.ok) {
          const data = (await response.json()) as {
            user?: User;
            session?: unknown;
          };
          if (data.user) {
            setState((prev) => ({
              ...prev,
              user: data.user ?? null,
              isAuthenticated: true,
              isLoading: false,
            }));
            return;
          }
        }
      } catch {
        // Session check failed, user is not authenticated
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    }
    void checkSession();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(error.message ?? "Login failed");
    }

    const data = (await response.json()) as { user: User };
    setState((prev) => ({
      ...prev,
      user: data.user,
      isAuthenticated: true,
    }));
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
    setState({
      user: null,
      org: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }, []);

  const selectOrg = useCallback((orgId: string) => {
    // In a real app, this would fetch org details and validate membership
    // For now, we just store the org ID
    setState((prev) => ({
      ...prev,
      org: { id: orgId, name: "Selected Organization" },
    }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, selectOrg }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
