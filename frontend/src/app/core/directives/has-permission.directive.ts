import { Directive, Input, TemplateRef, ViewContainerRef, OnInit, OnDestroy, effect } from '@angular/core';
import { AuthService } from '../services/auth.service';

/**
 * Structural directive to conditionally show/hide elements based on user permissions.
 * 
 * Usage:
 * <button *hasPermission="{ resource: 'vm', action: 'create' }">Create VM</button>
 * <button *hasPermission="{ resource: 'vm', action: 'delete' }">Delete VM</button>
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  private permission?: { resource: string; action: string };
  private hasView = false;

  @Input()
  set hasPermission(permission: { resource: string; action: string }) {
    this.permission = permission;
    this.updateView();
  }

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {
    // React to user changes
    effect(() => {
      this.authService.currentUser(); // Track signal
      this.updateView();
    });
  }

  ngOnInit(): void {
    this.updateView();
  }

  ngOnDestroy(): void {
    this.viewContainer.clear();
  }

  private updateView(): void {
    if (!this.permission) {
      return;
    }

    const hasPermission = this.authService.hasPermission(
      this.permission.resource,
      this.permission.action
    );

    if (hasPermission && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasPermission && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
