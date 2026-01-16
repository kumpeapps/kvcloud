import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MaterialModule } from '../../shared/material.module';
import { PlansService } from '../../core/services/plans.service';
import { VmRequestsService } from '../../core/services/vm-requests.service';
import { MatSnackBar } from '@angular/material/snack-bar';

interface CartItem {
  plan_id: number;
  plan_name: string;
}

interface VMRequest {
  id: number;
  status: string;
  plan_id: number;
  created_at: string;
  approved_at?: string;
  fulfilled_at?: string;
}

@Component({
  selector: 'app-request-cart',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <div class="cart-container">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1>
            <mat-icon>shopping_cart</mat-icon>
            Request Cart
          </h1>
          <p class="subtitle">Review and submit your VM requests</p>
        </div>
        <button mat-stroked-button routerLink="/plans">
          <mat-icon>arrow_back</mat-icon>
          Back to Plans
        </button>
      </div>

      <div class="content-grid">
        <!-- Cart Section -->
        <mat-card class="cart-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>shopping_basket</mat-icon>
              Cart Items ({{ cart().length }})
            </mat-card-title>
          </mat-card-header>

          <mat-card-content>
            <div *ngIf="cart().length === 0" class="empty-cart">
              <mat-icon>shopping_cart</mat-icon>
              <p>Your cart is empty</p>
              <button mat-raised-button color="primary" routerLink="/plans">
                <mat-icon>storefront</mat-icon>
                Browse Plans
              </button>
            </div>

            <div *ngIf="cart().length > 0" class="cart-items">
              <div *ngFor="let item of cart(); index as i" class="cart-item">
                <div class="item-info">
                  <mat-icon color="primary">dns</mat-icon>
                  <div class="item-details">
                    <div class="item-name">{{ item.plan_name }}</div>
                    <div class="item-id">Plan ID: {{ item.plan_id }}</div>
                  </div>
                </div>
                <button mat-icon-button color="warn" (click)="removeFromCart(i)" matTooltip="Remove from cart">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>

              <mat-divider></mat-divider>

              <div class="cart-actions">
                <button mat-stroked-button color="warn" (click)="clearCart()" [disabled]="submitting()">
                  <mat-icon>delete_sweep</mat-icon>
                  Clear Cart
                </button>
                <button mat-raised-button color="primary" (click)="checkoutAll()" [disabled]="submitting()">
                  <mat-icon>send</mat-icon>
                  {{ submitting() ? 'Submitting...' : 'Submit All Requests' }}
                </button>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- My Requests Section -->
        <mat-card class="requests-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>assignment</mat-icon>
              My Requests
            </mat-card-title>
            <button mat-icon-button (click)="refreshRequests()" [disabled]="loading()">
              <mat-icon>refresh</mat-icon>
            </button>
          </mat-card-header>

          <mat-card-content>
            <div *ngIf="loading()" class="loading-state">
              <mat-spinner diameter="40"></mat-spinner>
            </div>

            <div *ngIf="!loading() && myRequests().length === 0" class="empty-requests">
              <mat-icon>inbox</mat-icon>
              <p>No requests yet</p>
            </div>

            <div *ngIf="!loading() && myRequests().length > 0" class="requests-list">
              <div *ngFor="let req of myRequests()" class="request-item">
                <div class="request-header">
                  <div class="request-id">
                    <mat-icon>tag</mat-icon>
                    #{{ req.id }}
                  </div>
                  <mat-chip [color]="getStatusColor(req.status)" selected>
                    {{ req.status }}
                  </mat-chip>
                </div>
                <div class="request-details">
                  <div class="detail-row">
                    <span class="detail-label">Plan ID:</span>
                    <span class="detail-value">{{ req.plan_id }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Created:</span>
                    <span class="detail-value">{{ formatDate(req.created_at) }}</span>
                  </div>
                  <div class="detail-row" *ngIf="req.status === 'approved' || req.status === 'fulfilled'">
                    <span class="detail-label">{{ req.status === 'fulfilled' ? 'Completed:' : 'Approved:' }}</span>
                    <span class="detail-value">{{ formatDate(req.fulfilled_at || req.approved_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .cart-container {
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

      button mat-icon {
        margin-right: 8px;
      }
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      mat-card-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 20px;
        font-weight: 500;

        mat-icon {
          font-size: 24px;
          width: 24px;
          height: 24px;
        }
      }
    }

    .empty-cart, .empty-requests {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      text-align: center;

      mat-icon {
        font-size: 64px;
        width: 64px;
        height: 64px;
        opacity: 0.3;
        margin-bottom: 16px;
      }

      p {
        color: var(--text-secondary);
        margin-bottom: 16px;
      }
    }

    .loading-state {
      display: flex;
      justify-content: center;
      padding: 40px;
    }

    .cart-items {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      background: var(--surface-variant);
      border-radius: 8px;
      transition: background-color 0.2s;

      &:hover {
        background: var(--surface-hover);
      }

      .item-info {
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;

        mat-icon {
          font-size: 28px;
          width: 28px;
          height: 28px;
        }

        .item-details {
          .item-name {
            font-size: 16px;
            font-weight: 500;
            color: var(--text-primary);
          }

          .item-id {
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 4px;
          }
        }
      }
    }

    mat-divider {
      margin: 16px 0;
    }

    .cart-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;

      button mat-icon {
        margin-right: 8px;
      }
    }

    .requests-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .request-item {
      padding: 16px;
      background: var(--surface-variant);
      border-radius: 8px;
      border-left: 4px solid var(--primary-color);
    }

    .request-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .request-id {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        font-weight: 600;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }

    .request-details {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .detail-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;

        .detail-label {
          color: var(--text-secondary);
        }

        .detail-value {
          font-weight: 500;
        }
      }
    }

    @media (max-width: 968px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .cart-container {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
        align-items: stretch;

        button {
          width: 100%;
        }
      }

      .cart-actions {
        flex-direction: column;

        button {
          width: 100%;
        }
      }
    }
  `]
})
export class RequestCartComponent implements OnInit {
  private plansService = inject(PlansService);
  private requestsService = inject(VmRequestsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  cart = signal<CartItem[]>([]);
  myRequests = signal<VMRequest[]>([]);
  loading = signal(false);
  submitting = signal(false);

  ngOnInit(): void {
    this.loadCart();
    this.refreshRequests();
  }

  loadCart(): void {
    try {
      const saved = localStorage.getItem('request_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.cart.set(parsed);
        }
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  }

  saveCart(): void {
    localStorage.setItem('request_cart', JSON.stringify(this.cart()));
  }

  removeFromCart(index: number): void {
    const items = [...this.cart()];
    items.splice(index, 1);
    this.cart.set(items);
    this.saveCart();
    this.snackBar.open('Item removed from cart', 'Close', { duration: 2000 });
  }

  clearCart(): void {
    this.cart.set([]);
    localStorage.removeItem('request_cart');
    this.snackBar.open('Cart cleared', 'Close', { duration: 2000 });
  }

  checkoutAll(): void {
    const items = this.cart();
    if (items.length === 0) return;

    this.submitting.set(true);
    this.submitNextRequest(0, items.length);
  }

  private submitNextRequest(index: number, total: number): void {
    const items = this.cart();
    if (index >= items.length) {
      this.submitting.set(false);
      this.cart.set([]);
      this.saveCart();
      this.refreshRequests();
      this.snackBar.open(
        `${total} request(s) submitted successfully!`,
        'View',
        { duration: 5000 }
      ).onAction().subscribe(() => {
        this.refreshRequests();
      });
      return;
    }

    const item = items[index];
    this.requestsService.createRequest({ plan_id: item.plan_id }).subscribe({
      next: () => {
        this.submitNextRequest(index + 1, total);
      },
      error: (error) => {
        console.error('Error submitting request:', error);
        this.snackBar.open(`Failed to submit request ${index + 1}`, 'Close', { duration: 3000 });
        this.submitting.set(false);
      }
    });
  }

  refreshRequests(): void {
    this.loading.set(true);
    this.requestsService.listMyRequests().subscribe({
      next: (response) => {
        this.myRequests.set(response.requests || []);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading requests:', error);
        this.snackBar.open('Failed to load requests', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  getStatusColor(status: string): 'primary' | 'accent' | 'warn' | undefined {
    switch (status) {
      case 'fulfilled': return 'primary';
      case 'approved': return 'accent';
      case 'pending': return 'warn';
      default: return undefined;
    }
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleString();
  }
}
