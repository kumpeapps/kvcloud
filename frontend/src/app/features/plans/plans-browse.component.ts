import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { PlansService } from '../../core/services/plans.service';
import { VmRequestsService } from '../../core/services/vm-requests.service';
import { MatSnackBar } from '@angular/material/snack-bar';

interface VPSPlan {
  id: number;
  name: string;
  description?: string;
  cpu_cores: number;
  cpu_sockets: number;
  cpu_type: string;
  ram_mb: number;
  disk_gb: number;
  disk_type: string;
  number_of_ips: number;
  virtio?: boolean;
  scsi?: boolean;
  enable_vnc?: boolean;
  enable_serial?: boolean;
  os_template?: string;
  ip_group_id?: number;
  iso_group_id?: number;
  price_per_month?: number;
  max_instances_per_user?: number;
}

@Component({
  selector: 'app-plans-browse',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="plans-container">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1>
            <mat-icon>storefront</mat-icon>
            Available Plans
          </h1>
          <p class="subtitle">Choose a plan and request a new virtual machine</p>
        </div>
        <button mat-raised-button color="primary" routerLink="/requests/cart">
          <mat-icon>shopping_cart</mat-icon>
          View Cart ({{ cartCount() }})
        </button>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading()" class="loading-state">
        <mat-spinner diameter="50"></mat-spinner>
        <p>Loading plans...</p>
      </div>

      <!-- Plans Grid -->
      <div *ngIf="!loading() && plans().length > 0" class="plans-grid">
        <mat-card *ngFor="let plan of plans()" class="plan-card" [class.popular]="isPopular(plan)">
          <div class="plan-header" [class.popular]="isPopular(plan)">
            <mat-card-header>
              <mat-icon mat-card-avatar>dns</mat-icon>
              <mat-card-title>{{ plan.name }}</mat-card-title>
              <mat-card-subtitle *ngIf="plan.description">{{ plan.description }}</mat-card-subtitle>
            </mat-card-header>
            <mat-chip *ngIf="isPopular(plan)" color="accent" selected>
              <mat-icon>star</mat-icon>
              Popular
            </mat-chip>
          </div>

          <mat-card-content>
            <div class="plan-specs">
              <!-- CPU Configuration -->
              <div class="spec-item">
                <mat-icon color="primary">memory</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ plan.cpu_cores }} × {{ plan.cpu_sockets }}</div>
                  <div class="spec-label">CPU (Cores × Sockets)</div>
                </div>
              </div>

              <!-- RAM -->
              <div class="spec-item">
                <mat-icon color="primary">storage</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ formatMemory(plan.ram_mb) }}</div>
                  <div class="spec-label">RAM</div>
                </div>
              </div>

              <!-- Disk -->
              <div class="spec-item">
                <mat-icon color="primary">hard_drive</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ plan.disk_gb }} GB</div>
                  <div class="spec-label">Disk ({{ plan.disk_type }})</div>
                </div>
              </div>

              <!-- Network -->
              <div class="spec-item">
                <mat-icon color="primary">cloud_network</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ plan.number_of_ips }}</div>
                  <div class="spec-label">IP Address(es)</div>
                </div>
              </div>

              <!-- OS Template -->
              <div *ngIf="plan.os_template" class="spec-item">
                <mat-icon color="primary">computer</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ plan.os_template }}</div>
                  <div class="spec-label">OS Template</div>
                </div>
              </div>

              <!-- Price -->
              <div *ngIf="plan.price_per_month" class="spec-item">
                <mat-icon color="accent">attach_money</mat-icon>
                <div class="spec-details">
                  <div class="spec-value">{{ '$' }}{{ (plan.price_per_month / 100).toFixed(2) }}</div>
                  <div class="spec-label">Monthly Price</div>
                </div>
              </div>

              <mat-divider></mat-divider>

              <!-- Features & Options -->
              <div class="features">
                <div class="feature-item">
                  <mat-icon [color]="plan.enable_vnc ? 'primary' : ''">
                    {{ plan.enable_vnc ? 'check_circle' : 'cancel' }}
                  </mat-icon>
                  <span>VNC Console</span>
                </div>
                <div class="feature-item">
                  <mat-icon [color]="plan.enable_serial ? 'primary' : ''">
                    {{ plan.enable_serial ? 'check_circle' : 'cancel' }}
                  </mat-icon>
                  <span>Serial Console</span>
                </div>
                <div class="feature-item">
                  <mat-icon [color]="plan.virtio ? 'primary' : ''">
                    {{ plan.virtio ? 'check_circle' : 'cancel' }}
                  </mat-icon>
                  <span>VirtIO Support</span>
                </div>
                <div class="feature-item">
                  <mat-icon [color]="plan.scsi ? 'primary' : ''">
                    {{ plan.scsi ? 'check_circle' : 'cancel' }}
                  </mat-icon>
                  <span>SCSI Support</span>
                </div>
              </div>
            </div>
          </mat-card-content>

          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="requestNow(plan)" [disabled]="requesting()">
              <mat-icon>add_circle</mat-icon>
              Request Now
            </button>
            <button mat-stroked-button (click)="addToCart(plan)" [disabled]="requesting()">
              <mat-icon>add_shopping_cart</mat-icon>
              Add to Cart
            </button>
          </mat-card-actions>
        </mat-card>
      </div>

      <!-- Empty State -->
      <mat-card *ngIf="!loading() && plans().length === 0" class="empty-state">
        <mat-icon>info</mat-icon>
        <h3>No Plans Available</h3>
        <p>There are currently no VPS plans available. Please check back later or contact your administrator.</p>
      </mat-card>
    </div>
  `,
  styles: [`
    .plans-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      gap: 24px;
      flex-wrap: wrap;

      h1 {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 32px;
        font-weight: 500;
        margin: 0;

        mat-icon {
          font-size: 36px;
          width: 36px;
          height: 36px;
        }
      }

      .subtitle {
        margin: 8px 0 0 48px;
        color: var(--text-secondary);
        font-size: 16px;
      }

      button {
        mat-icon {
          margin-right: 8px;
        }
      }
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      gap: 16px;

      p {
        color: var(--text-secondary);
      }
    }

    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 24px;
    }

    .plan-card {
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, box-shadow 0.2s;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      }

      &.popular {
        border: 2px solid var(--accent-color);
      }
    }

    .plan-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;

      &.popular {
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.1) 0%, transparent 100%);
        padding: 12px;
        margin: -16px -16px 16px -16px;
        border-radius: 4px 4px 0 0;
      }

      mat-card-header {
        flex: 1;

        mat-icon {
          font-size: 40px;
          width: 40px;
          height: 40px;
        }
      }

      mat-chip {
        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          margin-right: 4px;
        }
      }
    }

    .plan-specs {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .spec-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px;
      background: var(--surface-variant);
      border-radius: 8px;

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }

      .spec-details {
        flex: 1;

        .spec-value {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .spec-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      }
    }

    mat-divider {
      margin: 16px 0;
    }

    .features {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .feature-item {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }

    mat-card-actions {
      display: flex;
      gap: 8px;
      padding: 16px;
      margin-top: auto;

      button {
        flex: 1;

        mat-icon {
          margin-right: 8px;
        }
      }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px 20px;
      text-align: center;

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        opacity: 0.3;
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 500;
      }

      p {
        margin: 0;
        color: var(--text-secondary);
        max-width: 500px;
      }
    }

    @media (max-width: 768px) {
      .plans-container {
        padding: 16px;
      }

      .plans-grid {
        grid-template-columns: 1fr;
      }

      .page-header {
        flex-direction: column;
        align-items: stretch;

        button {
          width: 100%;
        }
      }
    }
  `]
})
export class PlansBrowseComponent implements OnInit {
  private plansService = inject(PlansService);
  private requestsService = inject(VmRequestsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  plans = signal<VPSPlan[]>([]);
  loading = signal(true);
  requesting = signal(false);
  cartCount = signal(0);

  ngOnInit(): void {
    this.loadPlans();
    this.loadCartCount();
  }

  loadPlans(): void {
    this.loading.set(true);
    this.plansService.listVpsPlans().subscribe({
      next: (response) => {
        this.plans.set(response.plans || []);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading plans:', error);
        this.snackBar.open('Failed to load plans', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  loadCartCount(): void {
    try {
      const saved = localStorage.getItem('request_cart');
      if (saved) {
        const cart = JSON.parse(saved);
        this.cartCount.set(Array.isArray(cart) ? cart.length : 0);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  }

  requestNow(plan: VPSPlan): void {
    this.requesting.set(true);
    this.requestsService.createRequest({ plan_id: plan.id }).subscribe({
      next: (response) => {
        this.requesting.set(false);
        this.snackBar.open(
          `VM request submitted successfully! ${response.request?.status === 'approved' ? 'Auto-approved.' : 'Pending admin approval.'}`,
          'View',
          { duration: 5000 }
        ).onAction().subscribe(() => {
          this.router.navigate(['/requests/cart']);
        });
      },
      error: (error) => {
        console.error('Error creating request:', error);
        this.snackBar.open('Failed to create VM request', 'Close', { duration: 3000 });
        this.requesting.set(false);
      }
    });
  }

  addToCart(plan: VPSPlan): void {
    try {
      const saved = localStorage.getItem('request_cart');
      let cart: any[] = [];
      if (saved) {
        cart = JSON.parse(saved);
      }
      cart.push({ plan_id: plan.id, plan_name: plan.name });
      localStorage.setItem('request_cart', JSON.stringify(cart));
      this.cartCount.set(cart.length);
      this.snackBar.open(`${plan.name} added to cart`, 'View Cart', { duration: 3000 })
        .onAction().subscribe(() => {
          this.router.navigate(['/requests/cart']);
        });
    } catch (error) {
      console.error('Error adding to cart:', error);
      this.snackBar.open('Failed to add to cart', 'Close', { duration: 3000 });
    }
  }

  isPopular(plan: VPSPlan): boolean {
    // Mark plans with 4+ CPU cores or 8GB+ RAM as popular
    return plan.cpu_cores >= 4 || plan.ram_mb >= 8192;
  }

  formatMemory(mb: number): string {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(0)} GB`;
    }
    return `${mb} MB`;
  }
}
