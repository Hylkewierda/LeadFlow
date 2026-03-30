import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const AUTH_STORAGE_KEY = 'leadflow_auth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    // Check if user has an existing session
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
    setIsLoadingAuth(false);
  }, []);

  const login = (email, password) => {
    let validUsers = [];
    try {
      validUsers = JSON.parse(import.meta.env.VITE_AUTH_USERS || '[]');
    } catch {
      validUsers = [];
    }

    const matchedUser = validUsers.find(
      (u) => u.email === email && u.password === password
    );

    if (matchedUser) {
      const userData = { email: matchedUser.email };
      setUser(userData);
      setIsAuthenticated(true);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
      return { success: true };
    }

    return { success: false, error: 'Ongeldige inloggegevens' };
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem(AUTH_STORAGE_KEY);
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
