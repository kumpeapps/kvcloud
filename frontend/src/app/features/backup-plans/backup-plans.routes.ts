import { Routes } from '@angular/router';
import { BackupPlansComponent } from './backup-plans.component';
import { roleGuard } from '../../core/guards/role.guard';

export const BACKUP_PLAN_ROUTES: Routes = [
  {
    path: '',
    component: BackupPlansComponent,
    canActivate: [roleGuard],
    data: { role: 'user' }
  }
];
