import { createContext, useContext, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', user._id);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const on = (event, handler) => {
    const socket = socketRef.current;
    if (socket) socket.on(event, handler);
    return () => { if (socket) socket.off(event, handler); };
  };

  const emit = (event, data) => {
    if (socketRef.current) socketRef.current.emit(event, data);
  };

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, on, emit }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
