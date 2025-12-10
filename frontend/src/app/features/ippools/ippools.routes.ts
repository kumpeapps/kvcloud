import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const ippoolsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./ippools.component').then(m => m.IPPoolsComponent),
    canActivate: [authGuard]
  }
];
