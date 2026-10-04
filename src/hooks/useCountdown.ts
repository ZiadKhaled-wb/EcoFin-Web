import { useEffect, useState } from 'react';

/** Drives the rate-limit state: call start(retryAfterSeconds) on a 429. */
export function useCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return { seconds, start: setSeconds };
}
