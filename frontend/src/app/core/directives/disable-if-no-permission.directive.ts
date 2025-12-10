import { Directive, Input, ElementRef, Renderer2, OnInit, OnDestroy, effect } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Attribute directive to disable elements based on user permissions.
 * 
 * Usage:
 * <button [disableIfNoPermission]="{ resource: 'vm', action: 'create' }">Create VM</button>
 */
@Directive({
  selector: '[disableIfNoPermission]',
  standalone: true
})
export class DisableIfNoPermissionDirective implements OnInit, OnDestroy {
  private permission?: { resource: string; action: string };

  @Input()
  set disableIfNoPermission(permission: { resource: string; action: string }) {
    this.permission = permission;
    this.updateDisabledState();
  }

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private authService: AuthService
  ) {
    // React to user changes
    effect(() => {
      this.authService.currentUser(); // Track signal
      this.updateDisabledState();
    });
  }

  ngOnInit(): void {
    this.updateDisabledState();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  private updateDisabledState(): void {
    if (!this.permission) {
      return;
    }

    const hasPermission = this.authService.hasPermission(
      this.permission.resource,
      this.permission.action
    );

    if (!hasPermission) {
      this.renderer.setAttribute(this.el.nativeElement, 'disabled', 'true');
      this.renderer.addClass(this.el.nativeElement, 'disabled');
      this.renderer.setStyle(this.el.nativeElement, 'opacity', '0.5');
      this.renderer.setStyle(this.el.nativeElement, 'cursor', 'not-allowed');
    } else {
      this.renderer.removeAttribute(this.el.nativeElement, 'disabled');
      this.renderer.removeClass(this.el.nativeElement, 'disabled');
      this.renderer.removeStyle(this.el.nativeElement, 'opacity');
      this.renderer.removeStyle(this.el.nativeElement, 'cursor');
    }
  }
}
