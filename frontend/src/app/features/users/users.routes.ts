import { Routes } from '@angular/router';
import { UsersComponent } from './users.component';
import { roleGuard } from '../../core/guards/role.guard';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    component: UsersComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' } // Admin can manage users
  }
];
