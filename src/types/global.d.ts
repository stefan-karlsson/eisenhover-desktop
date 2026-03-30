import type { EisenhoverApi } from '../shared/types';

declare global {
  interface Window {
    eisenhover: EisenhoverApi;
  }
}

export {};
