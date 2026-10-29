import { api } from '@/utils/api';
import { API_BASE_URL } from '@/config/config';

export interface RuntimeRegistration {
  id: number;
  isActive: boolean;
  manifest: {
    id: string;
    name: string;
    version: string;
    entryUrl: string;
    permissions: string[];
    description?: string;
  };
}
/** Registered widgets as any signed-in account may read them for rendering. */
export const registrationsQuery = {
  queryKey: ['widget-runtime'],
  queryFn: () =>
    api.get(`${API_BASE_URL}/widget-runtime/registrations`) as Promise<RuntimeRegistration[]>,
};
