import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Match CI's bounded test budget while waiting for React updates.
configure({ asyncUtilTimeout: 5000 });

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => cleanup());
