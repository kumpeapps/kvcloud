import { Routes } from '@angular/router';
import { AuditLogsComponent } from './audit-logs.component';
import { roleGuard } from '../../core/guards/role.guard';

export const AUDIT_LOG_ROUTES: Routes = [
  {
    path: '',
    component: AuditLogsComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' }
  }
];
