# Dark Mode Text Visibility Fixes

## Summary
Fixed text visibility issues across all frontend components by replacing hard-coded dark text colors with Material Design theme-aware opacity values.

## Changes Applied

### Pattern Replacements
1. **Dark text colors** (`color: rgba(0,0,0,0.87)`) → **Opacity** (`opacity: 0.87`)
2. **Medium text colors** (`color: rgba(0,0,0,0.6)`) → **Opacity** (`opacity: 0.6`)
3. **Light text colors** (`color: rgba(0,0,0,0.54)`) → **Opacity** (`opacity: 0.54`)
4. **Very light text** (`color: #333, #555, #666`) → **Opacity** (`opacity: 0.87, 0.7, 0.6`)

### Background Adjustments
- Light backgrounds (`background: #f5f5f5`) → Theme-aware (`background: rgba(255,255,255,0.05)`)
- Dark borders (`border: 1px solid rgba(0,0,0,0.12)`) → Theme-aware borders

## Fixed Components

### Core Features
- `compose-templates/compose-template-dialog.component.ts`
- `compose-templates/provisioning-profiles.component.ts`
- `vms/vm-cloud-init-display.component.ts`

### Admin & Management
- `admin-approvals/vm-requests-approvals.component.ts`
- `settings/plans-manager.component.ts`

### Backup & Snapshots
- `backup-plans/backup-plans.component.ts`
- `snapshot-schedules/snapshot-schedules.component.ts`
- `snapshot-schedules/snapshot-schedule-form-dialog.component.ts`
- `backups/vm-backups/vm-backups.component.ts`

### Templates & Storage
- `templates/templates-list/templates-list.component.ts`
- `templates/clone-vm-dialog/clone-vm-dialog.component.ts`
- `templates/cloud-image-download-dialog.component.ts`
- `storage/storage-list.component.ts`

### VM Operations
- `vms/vm-mount-iso-dialog/vm-mount-iso-dialog.component.ts`

## Benefits
1. **Theme Compatibility**: Text automatically adapts to light/dark themes
2. **Material Design Compliance**: Uses standard opacity levels (0.87, 0.6, 0.54)
3. **Improved Accessibility**: All text is now visible in dark mode
4. **Consistent UX**: Uniform text styling across all pages

## Verification
Build successful with no compilation errors. All dark text patterns removed from codebase.

Date: 2026-01-08
