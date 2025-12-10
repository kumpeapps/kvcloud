import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import { PlansService } from '../../core/services/plans.service';
import { VmRequestsService } from '../../core/services/vm-requests.service';

@Component({
  selector: 'app-request-cart',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  template: `
    <h1>Request Cart</h1>
    <div class="form">
      <mat-form-field class="full" appearance="outline">
        <mat-label>VPS Plan</mat-label>
        <mat-select [(value)]="selectedPlanId">
          <mat-option *ngFor="let p of vpsPlans()" [value]="p.id">{{ p.name }}</mat-option>
        </mat-select>
      </mat-form-field>
      <button mat-raised-button color="primary" (click)="addToCart()" [disabled]="!selectedPlanId">Add to Cart</button>
      <h3>Cart</h3>
      <mat-list>
        <mat-list-item *ngFor="let item of cart(); index as i">
          Plan #{{ item.plan_id }}
          <span class="spacer"></span>
          <button mat-icon-button color="warn" (click)="removeFromCart(i)" matTooltip="Remove">
            <mat-icon>delete</mat-icon>
          </button>
        </mat-list-item>
      </mat-list>
      <button mat-raised-button color="accent" (click)="checkout()" [disabled]="cart().length === 0">Checkout</button>
    </div>
    <div class="requests">
      <h3>My Requests</h3>
      <mat-list>
        <mat-list-item *ngFor="let r of myRequests()">#{{ r.id }} — {{ r.status }}</mat-list-item>
      </mat-list>
    </div>
  `,
  styles: [`
    .form { padding: 16px; display: grid; gap: 12px; }
    .full { width: 320px; }
  `]
})
export class RequestCartComponent implements OnInit {
  vpsPlans = signal<any[]>([]);
  selectedPlanId: number | null = null;
  cart = signal<{ plan_id: number }[]>([]);
  myRequests = signal<any[]>([]);

  constructor(private plans: PlansService, private requests: VmRequestsService) {}

  ngOnInit(): void {
    this.plans.listVpsPlans().subscribe(r => this.vpsPlans.set(r.plans || []));
    this.refreshRequests();
    // Restore cart from localStorage
    try {
      const saved = localStorage.getItem('request_cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) this.cart.set(parsed);
      }
    } catch {}
  }

  addToCart(): void {
    if (!this.selectedPlanId) return;
    const next = [...this.cart(), { plan_id: this.selectedPlanId }];
    this.cart.set(next);
    localStorage.setItem('request_cart', JSON.stringify(next));
  }

  checkout(): void {
    const items = this.cart();
    const next = items.shift();
    if (!next) return;
    this.requests.createRequest({ plan_id: next.plan_id }).subscribe(() => {
      this.cart.set(items);
      localStorage.setItem('request_cart', JSON.stringify(items));
      this.refreshRequests();
    });
  }

  removeFromCart(index: number): void {
    const items = [...this.cart()];
    items.splice(index, 1);
    this.cart.set(items);
    localStorage.setItem('request_cart', JSON.stringify(items));
  }

  refreshRequests(): void {
    this.requests.listMyRequests().subscribe(r => this.myRequests.set(r.requests || []));
  }
}
