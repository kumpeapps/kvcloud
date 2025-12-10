import { Routes } from '@angular/router';
import { VmsComponent } from './vms.component';
import { VmDetailComponent } from './vm-detail/vm-detail.component';
import { VmCreateComponent } from './vm-create/vm-create.component';

export const VMS_ROUTES: Routes = [
  {
    path: '',
    component: VmsComponent
  },
  {
    path: 'create',
    component: VmCreateComponent
  },
  {
    path: 'detail',
    component: VmDetailComponent
  }
];
