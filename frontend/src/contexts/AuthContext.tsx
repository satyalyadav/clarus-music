import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from "react";

interface User {
  user_id: number;
  username: string;
}

interface AuthContextType {
  user: User;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// For local-first app, we use a simple local user
// No backend authentication needed
const LOCAL_USER: User = {
  user_id: 1,
  username: 'local_user',
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <AuthContext.Provider value={{ user: LOCAL_USER }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
