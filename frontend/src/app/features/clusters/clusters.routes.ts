import { Routes } from '@angular/router';
import { ClustersComponent } from './clusters.component';
import { ClusterDetailComponent } from './cluster-detail/cluster-detail.component';
import { roleGuard } from '../../core/guards/role.guard';

export const CLUSTERS_ROUTES: Routes = [
  {
    path: '',
    component: ClustersComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' }
  },
  {
    path: ':id',
    component: ClusterDetailComponent,
    canActivate: [roleGuard],
    data: { role: 'admin' }
  }
];
