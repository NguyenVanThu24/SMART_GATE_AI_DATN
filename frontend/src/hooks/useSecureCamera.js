import { useEffect, useState } from 'react';
import api from '../services/api';

export default function useSecureCamera(enabled, streamKey) {
  const [streamUrl, setStreamUrl] = useState(null);
  const [ticketError, setTicketError] = useState(false);

  useEffect(() => {
    setStreamUrl(null);
    setTicketError(false);

    if (!enabled) return;

    const controller = new AbortController();

    let active = true;
    let timer;

    const issueTicket = async () => {
      try {
        const { data } = await api.post(
          '/camera/ticket',
          {},
          {
            signal: controller.signal,
            timeout: 7000
          }
        );

        if (!active) return;

        if (!/^[a-f0-9]{64}$/.test(data.ticket || '')) {
          throw new Error('Invalid camera ticket');
        }

        const base = api.defaults.baseURL.replace(/\/$/, '');

        setTicketError(false);

        setStreamUrl(
          `${base}/camera/stream?ticket=${encodeURIComponent(data.ticket)}`
        );

        // Renew before the backend's five-minute stream limit.
        timer = setTimeout(issueTicket, 270000);
      } catch {
        if (!active) return;

        setStreamUrl(null);
        setTicketError(true);

        timer = setTimeout(issueTicket, 5000);
      }
    };

    issueTicket();

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [enabled, streamKey]);

  return { streamUrl, ticketError };
}
