import { useEffect, useState } from 'react';
type TUser = {
  type: 'client' | 'agent';
  username: string;
};

export function useUser() {
  const [user, setUser] = useState<TUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (window) {
      const userData = JSON.parse(localStorage.getItem('user') || 'null');
      setIsLoggedIn(Boolean(userData));
      setUser(userData);
    }
  }, []);

  return { user, isLoggedIn };
}
