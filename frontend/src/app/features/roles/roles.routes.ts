import { Routes } from '@angular/router';
import { RolesComponent } from './roles.component';
import { roleGuard } from '../../core/guards/role.guard';

export const ROLES_ROUTES: Routes = [
  {
    path: '',
    component: RolesComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' }
  }
];
