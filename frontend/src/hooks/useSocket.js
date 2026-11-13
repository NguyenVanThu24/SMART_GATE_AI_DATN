import { useEffect, useRef } from 'react';
import socket from '../services/socket';
export default function useSocket(event, handler) {
  const ref = useRef(handler); ref.current = handler;
  useEffect(() => { const h = (d) => ref.current(d); socket.on(event, h); return () => socket.off(event, h); }, [event]);
}
