import { useQuery } from '@tanstack/react-query';
import { productionRequest } from './productionApi';

export interface ReasonCode {
  id: number;
  category: 'planned' | 'unplanned' | 'changeover';
  label: string;
  active: boolean;
}

/** The plant-wide reason catalog, shared by the picker and the admin panel. */
export const useReasonCodes = () =>
  useQuery({
    queryKey: ['reason-codes'],
    queryFn: () => productionRequest<ReasonCode[]>('/reason-codes'),
    staleTime: 60_000,
  });
