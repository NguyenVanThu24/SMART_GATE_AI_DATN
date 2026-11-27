import { io } from 'socket.io-client';

const socket = io(
  import.meta.env.VITE_API_URL || 'http://localhost:3000',
  {
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: callback => {
      callback({
        token: localStorage.getItem('token')
      });
    }
  }
);

function expireSession() {
  socket.disconnect();
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

socket.on('auth:expired', expireSession);

socket.on('connect_error', error => {
  if (error.message === 'UNAUTHORIZED') {
    expireSession();
  }
});

export default socket;
