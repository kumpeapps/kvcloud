import { Routes } from '@angular/router';
import { SnapshotSchedulesComponent } from './snapshot-schedules.component';
import { roleGuard } from '../../core/guards/role.guard';

export const SNAPSHOT_SCHEDULE_ROUTES: Routes = [
  {
    path: '',
    component: SnapshotSchedulesComponent,
    canActivate: [roleGuard],
    data: { role: 'user' }
  }
];
