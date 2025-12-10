import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'auth',
    component: AuthLayoutComponent,
    children: [
      {
        path: '',
        loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
      }
    ]
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
      },
      {
        path: 'vms',
        loadChildren: () => import('./features/vms/vms.routes').then(m => m.VMS_ROUTES)
      },
      {
        path: 'clusters',
        loadChildren: () => import('./features/clusters/clusters.routes').then(m => m.CLUSTERS_ROUTES)
      },
      {
        path: 'ippools',
        loadChildren: () => import('./features/ippools/ippools.routes').then(m => m.ippoolsRoutes)
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then(m => m.USERS_ROUTES)
      },
      {
        path: 'roles',
        loadChildren: () => import('./features/roles/roles.routes').then(m => m.ROLES_ROUTES)
      },
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes').then(m => m.SETTINGS_ROUTES)
      },
      {
        path: 'monitoring',
        loadChildren: () => import('./features/monitoring/monitoring.routes').then(m => m.MONITORING_ROUTES)
      },
      {
        path: 'isos',
        loadChildren: () => import('./features/isos/isos.routes').then(m => m.ISOS_ROUTES)
      },
      {
        path: 'snapshots',
        loadChildren: () => import('./features/snapshots/snapshots.routes').then(m => m.SNAPSHOTS_ROUTES)
      },
      {
        path: 'snapshot-schedules',
        loadChildren: () => import('./features/snapshot-schedules/snapshot-schedules.routes').then(m => m.SNAPSHOT_SCHEDULE_ROUTES)
      },
      {
        path: 'storage',
        loadChildren: () => import('./features/storage/storage.routes').then(m => m.STORAGE_ROUTES)
      },
      {
        path: 'backup-plans',
        loadChildren: () => import('./features/backup-plans/backup-plans.routes').then(m => m.BACKUP_PLAN_ROUTES)
      },
      {
        path: 'audit-logs',
        loadChildren: () => import('./features/audit-logs/audit-logs.routes').then(m => m.AUDIT_LOG_ROUTES)
      },
      {
        path: 'templates',
        loadChildren: () => import('./features/templates/templates.routes').then(m => m.TEMPLATES_ROUTES)
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/tasks-queue.component').then(m => m.TasksQueueComponent)
      },
      {
        path: 'plans',
        loadComponent: () => import('./features/plans/plans-manager.component').then(m => m.PlansManagerComponent)
      },
      {
        path: 'cloud-init/profiles',
        loadComponent: () => import('./features/cloud-init/cloud-init-profiles.component').then(m => m.CloudInitProfilesComponent)
      },
      {
        path: 'cloud-init/builder',
        loadComponent: () => import('./features/cloud-init/cloud-init-profile-builder.component').then(m => m.CloudInitProfileBuilderComponent)
      },
      {
        path: 'ssh-keys',
        loadComponent: () => import('./features/settings/ssh-keys.component').then(m => m.SshKeysComponent)
      },
      {
        path: 'requests/cart',
        loadComponent: () => import('./features/requests/request-cart.component').then(m => m.RequestCartComponent)
      },
      {
        path: 'admin/approvals',
        loadComponent: () => import('./features/admin/approvals/vm-requests-approvals.component').then(m => m.VmRequestsApprovalsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
