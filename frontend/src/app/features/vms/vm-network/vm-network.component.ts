import { Component, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { VMService } from '../../../core/services/vm.service';
import { AddNetworkInterfaceDialogComponent } from './add-network-interface-dialog.component';
import { EditNetworkInterfaceDialogComponent } from './edit-network-interface-dialog.component';

@Component({
  selector: 'app-vm-network',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Network Interfaces</mat-card-title>
        <button mat-raised-button color="primary" (click)="openAddInterfaceDialog()" 
                [disabled]="loading()">
          <mat-icon>add</mat-icon>
          Add Interface
        </button>
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="50"></mat-spinner>
          </div>
        } @else if (interfaces().length === 0) {
          <p class="no-data">No network interfaces found</p>
        } @else {
          <table mat-table [dataSource]="interfaces()" class="interfaces-table">
            <!-- Interface Column -->
            <ng-container matColumnDef="interface">
              <th mat-header-cell *matHeaderCellDef>Interface</th>
              <td mat-cell *matCellDef="let iface">
                <strong>{{ iface.interface }}</strong>
              </td>
            </ng-container>

            <!-- Model Column -->
            <ng-container matColumnDef="model">
              <th mat-header-cell *matHeaderCellDef>Model</th>
              <td mat-cell *matCellDef="let iface">
                <mat-chip>{{ iface.model || 'N/A' }}</mat-chip>
              </td>
            </ng-container>

            <!-- MAC Address Column -->
            <ng-container matColumnDef="macaddr">
              <th mat-header-cell *matHeaderCellDef>MAC Address</th>
              <td mat-cell *matCellDef="let iface">
                <code>{{ iface.macaddr || 'Auto' }}</code>
              </td>
            </ng-container>

            <!-- Bridge Column -->
            <ng-container matColumnDef="bridge">
              <th mat-header-cell *matHeaderCellDef>Bridge</th>
              <td mat-cell *matCellDef="let iface">{{ iface.bridge || 'N/A' }}</td>
            </ng-container>

            <!-- VLAN Tag Column -->
            <ng-container matColumnDef="tag">
              <th mat-header-cell *matHeaderCellDef>VLAN Tag</th>
              <td mat-cell *matCellDef="let iface">
                @if (iface.tag) {
                  <mat-chip color="accent">{{ iface.tag }}</mat-chip>
                } @else {
                  <span>-</span>
                }
              </td>
            </ng-container>

            <!-- Rate Limit Column -->
            <ng-container matColumnDef="rate">
              <th mat-header-cell *matHeaderCellDef>Rate Limit</th>
              <td mat-cell *matCellDef="let iface">
                {{ iface.rate ? iface.rate + ' MB/s' : 'Unlimited' }}
              </td>
            </ng-container>

            <!-- Firewall Column -->
            <ng-container matColumnDef="firewall">
              <th mat-header-cell *matHeaderCellDef>Firewall</th>
              <td mat-cell *matCellDef="let iface">
                @if (iface.firewall === '1' || iface.firewall === 1) {
                  <mat-icon color="primary">check_circle</mat-icon>
                } @else {
                  <mat-icon color="warn">cancel</mat-icon>
                }
              </td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let iface">
                <button mat-icon-button color="primary" 
                        (click)="openEditInterfaceDialog(iface)"
                        matTooltip="Edit Interface">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" 
                        (click)="confirmDeleteInterface(iface)"
                        matTooltip="Delete Interface">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 200px;
    }

    .no-data {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    .interfaces-table {
      width: 100%;
    }

    mat-card-content {
      padding: 20px;
    }

    code {
      font-family: 'Courier New', monospace;
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }

    mat-chip {
      font-size: 0.9em;
    }
  `]
})
export class VMNetworkComponent implements OnInit {
  @Input() nodeId!: number;
  @Input() vmid!: number;
  interfaces = signal<any[]>([]);
  loading = signal<boolean>(true);
  
  displayedColumns: string[] = ['interface', 'model', 'macaddr', 'bridge', 'tag', 'rate', 'firewall', 'actions'];

  constructor(
    private vmService: VMService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadInterfaces();
  }

  loadInterfaces() {
    this.loading.set(true);
    this.vmService.listNetworkInterfaces(this.nodeId, this.vmid).subscribe({
      next: (response) => {
        this.interfaces.set(response.interfaces || []);
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error loading network interfaces:', error);
        this.snackBar.open('Failed to load network interfaces', 'Close', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  openAddInterfaceDialog() {
    const dialogRef = this.dialog.open(AddNetworkInterfaceDialogComponent, {
      width: '600px',
      data: { nodeId: this.nodeId, vmid: this.vmid }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addInterface(result);
      }
    });
  }

  addInterface(interfaceConfig: any) {
    this.vmService.addNetworkInterface(this.nodeId, this.vmid, interfaceConfig).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Interface added successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadInterfaces(), 2000);
      },
      error: (error) => {
        console.error('Error adding interface:', error);
        this.snackBar.open('Failed to add interface', 'Close', { duration: 3000 });
      }
    });
  }

  openEditInterfaceDialog(iface: any) {
    const dialogRef = this.dialog.open(EditNetworkInterfaceDialogComponent, {
      width: '600px',
      data: { 
        interface: iface,
        nodeId: this.nodeId,
        vmid: this.vmid
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateInterface(iface.interface, result);
      }
    });
  }

  updateInterface(interfaceName: string, interfaceConfig: any) {
    this.vmService.updateNetworkInterface(this.nodeId, this.vmid, interfaceName, interfaceConfig).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Interface updated successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadInterfaces(), 2000);
      },
      error: (error) => {
        console.error('Error updating interface:', error);
        this.snackBar.open('Failed to update interface', 'Close', { duration: 3000 });
      }
    });
  }

  confirmDeleteInterface(iface: any) {
    const confirmed = confirm(`Are you sure you want to delete network interface ${iface.interface}? This action cannot be undone.`);
    if (confirmed) {
      this.deleteInterface(iface.interface);
    }
  }

  deleteInterface(interfaceName: string) {
    this.vmService.deleteNetworkInterface(this.nodeId, this.vmid, interfaceName).subscribe({
      next: (response) => {
        this.snackBar.open(response.message || 'Interface deleted successfully', 'Close', { duration: 3000 });
        setTimeout(() => this.loadInterfaces(), 2000);
      },
      error: (error) => {
        console.error('Error deleting interface:', error);
        this.snackBar.open('Failed to delete interface', 'Close', { duration: 3000 });
      }
    });
  }
}
