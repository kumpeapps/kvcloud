import { Component, signal, effect } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { AuthService } from '../../core/services/auth.service';import { BreadcrumbComponent } from '../../shared/components/breadcrumb/breadcrumb.component';import { Router } from '@angular/router';
import { TasksService, TaskStatus } from '../../core/services/tasks.service';
import { timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

interface MenuItem {
  icon: string;
  label: string;
  route: string;
  badge?: number;
  requiredRole?: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, MaterialModule, BreadcrumbComponent],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent {
  sidenavOpened = signal(true);
  isDarkTheme = signal(false);
  tasksBadge = signal(0);
  
  menuItems: MenuItem[] = [
    { icon: 'dashboard', label: 'Dashboard', route: '/dashboard' },
    { icon: 'computer', label: 'Virtual Machines', route: '/vms' },
    { icon: 'inventory_2', label: 'Templates', route: '/templates' },
    { icon: 'list', label: 'Tasks', route: '/tasks', badge: 0 },
    { icon: 'photo_library', label: 'Snapshots', route: '/snapshots' },
    { icon: 'schedule', label: 'Snapshot Schedules', route: '/snapshot-schedules' },
    { icon: 'backup', label: 'Backup Plans', route: '/backup-plans' },
    { icon: 'settings_suggest', label: 'Provisioning Profiles', route: '/provisioning/profiles' },
    { icon: 'view_module', label: 'Docker Compose Templates', route: '/compose-templates' },
    { icon: 'vpn_key', label: 'SSH Keys', route: '/ssh-keys' },
    { icon: 'storage', label: 'Clusters', route: '/clusters', requiredRole: 'admin' },
    { icon: 'hard_drive', label: 'Storage', route: '/storage', requiredRole: 'admin' },
    { icon: 'network_check', label: 'IP Pools', route: '/ippools' },
    { icon: 'album', label: 'ISO Images', route: '/isos' },
    { icon: 'people', label: 'Users', route: '/users', requiredRole: 'admin' },
    { icon: 'security', label: 'Roles & Permissions', route: '/roles', requiredRole: 'admin' },
    { icon: 'history', label: 'Audit Logs', route: '/audit-logs', requiredRole: 'admin' },
    { icon: 'bar_chart', label: 'Monitoring', route: '/monitoring' },
    { icon: 'settings', label: 'Settings', route: '/settings' },
  ];

  constructor(
    public authService: AuthService,
    public router: Router,
    private tasksService: TasksService,
    private snackBar: MatSnackBar
  ) {
    // Load theme preference from localStorage, default to dark
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = savedTheme === 'dark' || (!savedTheme && true); // Default to dark if not set
    this.isDarkTheme.set(prefersDark);
    
    // Apply theme on initialization
    if (this.isDarkTheme()) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    // Poll tasks and update badge + completion toasts
    const lastActiveIds = new Set<string>();
    timer(0, 15000).pipe(
      switchMap(() => this.tasksService.listTasks())
    ).subscribe((tasks: TaskStatus[]) => {
      const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
      const active = activeTasks.length;
      this.tasksBadge.set(active);
      const item = this.menuItems.find(mi => mi.route === '/tasks');
      if (item) {
        item.badge = active;
      }

      // Show toast for tasks that completed since last poll
      const currentIds = new Set(activeTasks.map(t => t.id));
      for (const id of Array.from(lastActiveIds)) {
        if (!currentIds.has(id)) {
          const ref = this.snackBar.open('Task completed', 'View', { duration: 4000 });
          ref.onAction().subscribe(() => this.router.navigate(['/tasks']));
          lastActiveIds.delete(id);
        }
      }
      // Track newly active IDs
      for (const id of Array.from(currentIds)) {
        if (!lastActiveIds.has(id)) lastActiveIds.add(id);
      }
    });
  }

  get filteredMenuItems(): MenuItem[] {
    const user = this.authService.currentUser();
    if (!user) return [];
    
    return this.menuItems.filter(item => {
      // No role requirement - show to everyone
      if (!item.requiredRole) return true;
      
      // Superuser/admin can see everything
      if (user.is_superuser || user.role === 'admin') return true;
      
      // Check if user has required role
      return user.role === item.requiredRole;
    });
  }

  toggleSidenav() {
    this.sidenavOpened.update(val => !val);
  }

  toggleTheme() {
    this.isDarkTheme.update(val => !val);
    const newTheme = this.isDarkTheme() ? 'dark' : 'light';
    
    // Save preference to localStorage
    localStorage.setItem('theme', newTheme);
    
    // Apply theme class
    if (this.isDarkTheme()) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  hasPermission(item: MenuItem): boolean {
    if (!item.requiredRole) return true;
    const user = this.authService.currentUser();
    return user?.is_superuser || false;
  }
}
