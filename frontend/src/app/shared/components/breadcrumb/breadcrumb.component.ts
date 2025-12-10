import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';

interface Breadcrumb {
  label: string;
  url: string;
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <nav class="breadcrumb-nav" aria-label="Breadcrumb">
      <mat-icon>home</mat-icon>
      @for (crumb of breadcrumbs(); track crumb.url; let isLast = $last) {
        @if (!isLast) {
          <a [routerLink]="crumb.url" class="breadcrumb-link">{{ crumb.label }}</a>
          <mat-icon class="separator">chevron_right</mat-icon>
        } @else {
          <span class="breadcrumb-current">{{ crumb.label }}</span>
        }
      }
    </nav>
  `,
  styles: [`
    .breadcrumb-nav {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background-color: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 14px;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #666;
      }

      .separator {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .breadcrumb-link {
        color: #1976d2;
        text-decoration: none;
        
        &:hover {
          text-decoration: underline;
        }
      }

      .breadcrumb-current {
        color: #333;
        font-weight: 500;
      }
    }

    :host-context(.dark-theme) .breadcrumb-nav {
      background-color: #2a2a2a;
      border-bottom-color: #424242;

      mat-icon {
        color: #aaa;
      }

      .breadcrumb-current {
        color: #eee;
      }
    }
  `]
})
export class BreadcrumbComponent implements OnInit {
  breadcrumbs = signal<Breadcrumb[]>([]);

  private routeLabels: { [key: string]: string } = {
    'dashboard': 'Dashboard',
    'vms': 'Virtual Machines',
    'create': 'Create VM',
    'detail': 'VM Details',
    'users': 'Users',
    'roles': 'Roles',
    'clusters': 'Clusters'
  };

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.breadcrumbs.set(this.createBreadcrumbs());
      });

    // Initial breadcrumbs
    this.breadcrumbs.set(this.createBreadcrumbs());
  }

  private createBreadcrumbs(): Breadcrumb[] {
    const url = this.router.url.split('?')[0]; // Remove query params
    const segments = url.split('/').filter(s => s);

    if (segments.length === 0) {
      return [{ label: 'Dashboard', url: '/dashboard' }];
    }

    const breadcrumbs: Breadcrumb[] = [];
    let currentUrl = '';

    for (const segment of segments) {
      currentUrl += `/${segment}`;
      const label = this.routeLabels[segment] || this.capitalize(segment);
      breadcrumbs.push({ label, url: currentUrl });
    }

    return breadcrumbs;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
