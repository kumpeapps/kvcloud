import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES),
    canActivate: [authGuard]
  },
  {
    path: 'clusters',
    loadChildren: () => import('./features/clusters/clusters.routes').then(m => m.CLUSTERS_ROUTES),
    canActivate: [authGuard]
  },
  {
    path: 'vms',
    loadChildren: () => import('./features/vms/vms.routes').then(m => m.VMS_ROUTES),
    canActivate: [authGuard]
  }
];
