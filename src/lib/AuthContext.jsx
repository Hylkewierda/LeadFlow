import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

// Server-side session (api/session.js): the server checks the password and
// sets an HttpOnly cookie; the browser only learns who is logged in.
const LEGACY_STORAGE_KEY = 'leadflow_auth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // The old client-only login kept a session in localStorage; it means nothing now.
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }

    let cancelled = false;
    fetch('/api/session')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (cancelled || !body?.user) return;
        setUser(body.user);
        setIsAuthenticated(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email, password) => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { success: false, error: res.status === 401 ? 'Ongeldige inloggegevens' : body.error || 'Inloggen mislukt' };
      }
      const body = await res.json();
      setUser(body.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch {
      return { success: false, error: 'Geen verbinding met de server' };
    }
  };

  const logout = async () => {
    await fetch('/api/session', { method: 'DELETE' }).catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
