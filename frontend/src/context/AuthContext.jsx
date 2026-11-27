import {
  createContext,
  useContext,
  useEffect,
  useState
} from 'react';

import api from '../services/api';
import socket from '../services/socket';

const Ctx = createContext(null);

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      if (!localStorage.getItem('token')) return null;
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user && localStorage.getItem('token')) {
      socket.connect();
    } else {
      socket.disconnect();
    }

    return () => socket.disconnect();
  }, [user]);

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', {
      username,
      password
    });

    socket.disconnect();

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    setUser(data.user);
  };

  const logout = () => {
    socket.disconnect();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
