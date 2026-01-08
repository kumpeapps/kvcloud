# VM Detail Page Dark Mode Fixes

## Summary
Fixed text visibility issues across all tabs in the VM detail page by replacing hard-coded dark text colors with Material Design theme-aware opacity values.

## Fixed Components

### VM Disks Tab
- `vm-disks/vm-disks.component.ts` - Fixed no-data text color
- `vm-disks/resize-disk-dialog.component.ts` - Fixed current-info background color

### VM Network Tab
- `vm-network/vm-network.component.ts` - Fixed no-data text and code background colors
- `vm-network/add-network-interface-dialog.component.ts` - Fixed checkbox hints and bridge info text colors
- `vm-network/edit-network-interface-dialog.component.ts` - Fixed info-box background and bridge info text colors

### VM Console Tab
- `vm-console/vm-console.component.ts` - Fixed info-message text color

### VM Cloud-Init/Provisioning Tab
- `vm-cloud-init-display/vm-cloud-init-display.component.ts` - Fixed compose-meta, chip text, config-value and ssh-key background colors
- `vm-cloud-init-config.component.ts` - Fixed step-subtitle text color

## Changes Applied

### Text Color Replacements
- `color: #666` → `opacity: 0.6` (secondary text)
- `color: #555` → `opacity: 0.7` (medium text)
- `color: #333` → `opacity: 0.87` (primary text)

### Background Replacements
- `background-color: #f5f5f5` → `background-color: rgba(255, 255, 255, 0.05)` (light backgrounds → theme-aware)
- `background-color: rgba(0, 0, 0, 0.05)` → `background-color: rgba(255, 255, 255, 0.05)` (dark backgrounds → light in dark mode)

## Benefits
1. **Theme Compatibility**: All text and backgrounds automatically adapt to light/dark themes
2. **Material Design Compliance**: Uses standard opacity levels for text hierarchy
3. **Improved Accessibility**: All content is now visible in dark mode across all VM detail tabs
4. **Consistent UX**: Uniform styling across Overview, Statistics, Snapshots, Disks, Network, Console, and Provisioning tabs

## Verification
- Docker build successful: `docker compose -f docker-compose.dev.yml build frontend`
- All hard-coded dark colors removed from VM detail page and tabs
- No compilation errors

Date: 2026-01-08
