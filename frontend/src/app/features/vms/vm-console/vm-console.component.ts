import { Component, OnInit, OnDestroy, AfterViewInit, signal, Input, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { VMService } from '../../../core/services/vm.service';

// noVNC RFB class loaded via angular.json scripts
declare const RFB: any;

@Component({
  selector: 'app-vm-console',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>VM Console</mat-card-title>
        <div class="console-actions">
          @if (connected()) {
            <button mat-raised-button color="warn" (click)="disconnect()">
              <mat-icon>power_off</mat-icon>
              Disconnect
            </button>
            <button mat-raised-button (click)="sendCtrlAltDel()">
              <mat-icon>keyboard</mat-icon>
              Ctrl+Alt+Del
            </button>
            <button mat-raised-button (click)="toggleFullscreen()">
              <mat-icon>{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              {{ isFullscreen() ? 'Exit Fullscreen' : 'Fullscreen' }}
            </button>
          } @else if (!loading()) {
            <button mat-raised-button color="primary" (click)="connect()">
              <mat-icon>power</mat-icon>
              Connect
            </button>
          }
        </div>
      </mat-card-header>
      <mat-card-content>
        <!-- Always render VNC container for ViewChild reference -->
        <div #consoleContainer class="console-container" 
             [class.fullscreen]="isFullscreen()"
             [class.hidden]="!connected()">
          <div #vncScreen class="vnc-screen"></div>
        </div>
        
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="50"></mat-spinner>
            <p>Connecting to console...</p>
          </div>
        } @else if (error()) {
          <div class="error-container">
            <mat-icon color="warn">error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="connect()">
              <mat-icon>refresh</mat-icon>
              Retry
            </button>
          </div>
        } @else if (!connected()) {
          <div class="info-message">
            <mat-icon>info</mat-icon>
            <p>Click "Connect" to access the VM console</p>
          </div>
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

    .console-actions {
      display: flex;
      gap: 10px;
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 400px;
      gap: 20px;
    }

    .error-container mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .info-message {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 40px;
      opacity: 0.6;
    }

    .console-container {
      background-color: #000;
      min-height: 600px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      overflow: hidden;
    }

    .console-container.hidden {
      visibility: hidden;
      height: 0;
      min-height: 0;
      overflow: hidden;
    }

    .console-container.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 9999;
      min-height: 100vh;
    }

    .vnc-screen {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    :host ::ng-deep canvas {
      max-width: 100%;
      max-height: 100%;
    }

    mat-card-content {
      padding: 20px;
    }
  `]
})
export class VMConsoleComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() nodeId!: number;
  @Input() vmid!: number;
  @ViewChild('vncScreen', { static: false }) vncScreen?: ElementRef;
  @ViewChild('consoleContainer', { static: false }) consoleContainer?: ElementRef;

  loading = signal<boolean>(false);
  connected = signal<boolean>(false);
  error = signal<string | null>(null);
  isFullscreen = signal<boolean>(false);

  private rfb: any = null;
  private vncData: any = null;
  private viewInitialized = false;

  constructor(
    private vmService: VMService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    // Auto-connect can be enabled here if desired
    // this.connect();
  }

  ngAfterViewInit() {
    // Mark that view is initialized and ready for VNC
    this.viewInitialized = true;
  }

  ngOnDestroy() {
    this.disconnect();
  }

  async connect() {
    if (!this.viewInitialized) {
      this.error.set('View not ready yet. Please wait and try again.');
      return;
    }

    // Check if RFB is loaded
    console.log('Checking RFB availability:', {
      windowRFB: typeof (window as any).RFB,
      windowKeys: Object.keys(window).filter(k => k.toLowerCase().includes('rfb'))
    });
    
    if (typeof (window as any).RFB === 'undefined') {
      console.error('RFB library not loaded yet');
      this.error.set('VNC library is still loading. Please wait a moment and try again.');
      this.snackBar.open('VNC library loading...', 'Close', { duration: 3000 });
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      // Get VNC connection details from backend
      const response: any = await this.vmService.getVNCConnection(this.nodeId, this.vmid).toPromise();
      console.log('VNC connection details:', { ...response, ticket: '[REDACTED]' });
      this.vncData = response;

      // Give Angular time to update the view if loading state changed visibility
      setTimeout(() => {
        if (!this.vncScreen?.nativeElement) {
          console.error('VNC screen element still not found after timeout');
          console.log('ViewChild state:', {
            vncScreen: !!this.vncScreen,
            nativeElement: !!this.vncScreen?.nativeElement,
            viewInitialized: this.viewInitialized
          });
          this.error.set('Console initialization failed - screen element not ready');
          this.loading.set(false);
          return;
        }
        console.log('VNC screen element found, initializing...');
        this.initializeVNC();
      }, 200);
    } catch (err: any) {
      console.error('Error getting VNC connection:', err);
      this.error.set('Failed to get console connection details');
      this.loading.set(false);
      this.snackBar.open('Failed to connect to console', 'Close', { duration: 3000 });
    }
  }

  private initializeVNC() {
    if (!this.vncScreen?.nativeElement) {
      console.error('VNC screen element not found');
      this.error.set('Console initialization failed');
      this.loading.set(false);
      return;
    }

    try {
      // Construct WebSocket URL for Proxmox VNC
      // Connect through backend WebSocket proxy instead of directly to Proxmox
      const host = this.vncData.host;
      const port = this.vncData.port;
      const ticket = this.vncData.ticket;
      const node = this.vncData.node;
      
      // Connect through backend WebSocket proxy
      // Use ws:// or wss:// based on current page protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const backendHost = window.location.hostname;
      const backendPort = '8000'; // Backend API port
      
      const wsUrl = `${protocol}//${backendHost}:${backendPort}/vnc/proxy/${this.nodeId}/${this.vmid}?port=${port}&ticket=${encodeURIComponent(ticket)}`;

      console.log('Connecting to VNC via backend proxy:', `${protocol}//${backendHost}:${backendPort}/vnc/proxy/...`);
      console.log('Full WebSocket URL:', wsUrl);
      console.log('RFB available:', typeof (window as any).RFB !== 'undefined');
      console.log('RFB type:', typeof (window as any).RFB);

      // Get RFB from window
      const RFBClass = (window as any).RFB;
      if (!RFBClass) {
        console.error('RFB class not found. Window object:', Object.keys(window).filter(k => k.includes('RFB') || k.includes('rfb')));
        throw new Error('RFB class not found on window object');
      }

      console.log('Creating RFB instance...');
      // Initialize noVNC - connecting through our backend proxy
      this.rfb = new RFBClass(this.vncScreen.nativeElement, wsUrl, {
        credentials: {
          password: ticket
        },
        wsProtocols: ['binary']
      });

      // Set up event handlers
      this.rfb.addEventListener('connect', () => {
        console.log('VNC connected successfully');
        this.connected.set(true);
        this.loading.set(false);
        this.snackBar.open('Console connected', 'Close', { duration: 2000 });
      });

      this.rfb.addEventListener('disconnect', (e: any) => {
        console.log('VNC disconnected:', e.detail);
        this.connected.set(false);
        const reason = e.detail.reason;
        if (!e.detail.clean) {
          let errorMsg = 'Connection lost';
          if (reason) {
            if (reason.includes('timeout')) {
              errorMsg = 'Connection timed out. The VNC ticket may have expired.';
            } else if (reason.includes('certificate') || reason.includes('SSL')) {
              errorMsg = 'SSL certificate error. Check Proxmox SSL configuration.';
            } else {
              errorMsg = `Connection error: ${reason}`;
            }
          }
          this.error.set(errorMsg);
          this.snackBar.open(errorMsg, 'Close', { duration: 5000 });
        }
        this.loading.set(false);
      });

      this.rfb.addEventListener('credentialsrequired', () => {
        console.log('VNC credentials required');
        this.error.set('Authentication failed - VNC ticket invalid or expired');
        this.loading.set(false);
        this.snackBar.open('Authentication failed', 'Close', { duration: 3000 });
      });

      this.rfb.addEventListener('securityfailure', (e: any) => {
        console.error('VNC security failure:', e.detail);
        this.error.set('Security handshake failed');
        this.loading.set(false);
        this.snackBar.open('Security error connecting to console', 'Close', { duration: 3000 });
      });

      // Scale viewport
      this.rfb.scaleViewport = true;
      this.rfb.resizeSession = false;

      // Add timeout for connection attempt
      setTimeout(() => {
        if (this.loading() && !this.connected()) {
          console.error('VNC connection timeout after 30 seconds');
          this.error.set('Connection timeout - VNC ticket may have expired or Proxmox is unreachable');
          this.loading.set(false);
          this.disconnect();
        }
      }, 30000);

    } catch (err) {
      console.error('Error initializing VNC:', err);
      this.error.set('Failed to initialize console');
      this.loading.set(false);
    }
  }

  disconnect() {
    if (this.rfb) {
      this.rfb.disconnect();
      this.rfb = null;
    }
    this.connected.set(false);
    if (this.isFullscreen()) {
      this.exitFullscreen();
    }
  }

  sendCtrlAltDel() {
    if (this.rfb && this.connected()) {
      this.rfb.sendCtrlAltDel();
      this.snackBar.open('Ctrl+Alt+Del sent', 'Close', { duration: 1000 });
    }
  }

  toggleFullscreen() {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  private enterFullscreen() {
    if (this.consoleContainer?.nativeElement) {
      const elem = this.consoleContainer.nativeElement;
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        elem.mozRequestFullScreen();
      } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
      }
      this.isFullscreen.set(true);
    }
  }

  private exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
    this.isFullscreen.set(false);
  }
}
