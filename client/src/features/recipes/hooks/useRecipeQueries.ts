import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { API_ENDPOINTS } from '@/config/config';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RecipeParameter {
  name: string;
  unit: string;
  setpoint: number;
  min: number;
  max: number;
}

export interface Recipe {
  id: number;
  name: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  machineId: number;
  machineName?: string;
  description: string;
  parameters: RecipeParameter[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipeRequest {
  name: string;
  machineId: number;
  description?: string;
  parameters: RecipeParameter[];
}

export interface UpdateRecipeRequest {
  name?: string;
  description?: string;
  status?: 'draft' | 'active' | 'archived';
  parameters?: RecipeParameter[];
}

export interface RecipeFilters {
  machineId?: number;
  status?: string;
  search?: string;
}

// ── Query Keys ─────────────────────────────────────────────────────────────

const recipeKeys = {
  all: ['recipes'] as const,
  list: (filters: RecipeFilters) => [...recipeKeys.all, 'list', filters] as const,
  detail: (id: number) => [...recipeKeys.all, 'detail', id] as const,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 *
 * @param filters
 */
function buildRecipeParams(filters: RecipeFilters): string {
  const params = new URLSearchParams();
  if (filters.machineId) params.set('machineId', String(filters.machineId));
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 *
 * @param filters
 */
export function useRecipes(filters: RecipeFilters = {}) {
  return useQuery({
    queryKey: recipeKeys.list(filters),
    queryFn: () =>
      api.get(`${API_ENDPOINTS.recipes.base}${buildRecipeParams(filters)}`) as Promise<Recipe[]>,
  });
}

/**
 *
 * @param id
 */
export function useRecipe(id: number) {
  return useQuery({
    queryKey: recipeKeys.detail(id),
    queryFn: () => api.get(API_ENDPOINTS.recipes.byId(id)) as Promise<Recipe>,
    enabled: id > 0,
  });
}

/**
 *
 */
export function useCreateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRecipeRequest) =>
      api.post(API_ENDPOINTS.recipes.base, data) as Promise<Recipe>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

/**
 *
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateRecipeRequest & { id: number }) =>
      api.put(API_ENDPOINTS.recipes.byId(id), data) as Promise<Recipe>,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(variables.id) });
    },
  });
}

/**
 *
 */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete(API_ENDPOINTS.recipes.byId(id)) as Promise<{ message: string }>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}

/**
 *
 */
export function useCreateNewVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(API_ENDPOINTS.recipes.newVersion(id)) as Promise<Recipe>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
    },
  });
}
