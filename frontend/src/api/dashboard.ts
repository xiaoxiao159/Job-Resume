/** Dashboard（04 §5.1） */
import { apiGet, withMock } from './client';
import { mockGetDashboard } from './mock/handlers';
import type { DashboardData } from './types';

export const dashboardKeys = {
  all: ['dashboard'] as const,
};

export const getDashboard = withMock(mockGetDashboard, () => apiGet<DashboardData>('/dashboard'));