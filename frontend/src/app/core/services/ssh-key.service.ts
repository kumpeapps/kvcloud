import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SshKeyService {
  private apiUrl = environment.apiUrl;
  constructor(private http: HttpClient) {}

  listMyKeys(): Observable<{ keys: any[] }> {
    return this.http.get<{ keys: any[] }>(`${this.apiUrl}/ssh-keys/my-keys`);
  }

  createKey(name: string, publicKey: string, fingerprint?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/ssh-keys/my-keys`, {
      name,
      public_key: publicKey,
      fingerprint
    });
  }

  updateKey(id: number, name: string, publicKey: string, fingerprint?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/ssh-keys/my-keys/${id}`, {
      name,
      public_key: publicKey,
      fingerprint
    });
  }

  deleteKey(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/ssh-keys/my-keys/${id}`);
  }

  toggleKey(id: number): Observable<any> {
    return this.http.patch(`${this.apiUrl}/ssh-keys/my-keys/${id}/toggle`, {});
  }
}
