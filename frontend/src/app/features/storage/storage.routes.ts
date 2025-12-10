import { Routes } from '@angular/router';
import { StorageListComponent } from './storage-list.component';
import { roleGuard } from '../../core/guards/role.guard';

export const STORAGE_ROUTES: Routes = [
  {
    path: '',
    component: StorageListComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' } // Admin can manage storage
  }
];
