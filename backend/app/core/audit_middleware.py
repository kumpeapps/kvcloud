from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import time
import json
from typing import Callable
from app.core.database import async_session_maker
from app.models.audit_log import AuditLog
from app.models.user import User
from app.core.security import decode_access_token


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests for audit purposes."""
    
    # Paths to exclude from audit logging
    EXCLUDED_PATHS = [
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",
        "/",
        "/api/auth/token",  # Don't log login attempts
    ]
    
    # Methods to log (typically exclude GET for read operations to reduce logs)
    LOGGED_METHODS = ["POST", "PUT", "PATCH", "DELETE"]
    
    def __init__(self, app: ASGIApp, log_read_operations: bool = False):
        super().__init__(app)
        self.log_read_operations = log_read_operations
        if log_read_operations:
            self.LOGGED_METHODS.append("GET")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log to audit table."""
        start_time = time.time()
        
        # Skip excluded paths
        if any(request.url.path.startswith(path) for path in self.EXCLUDED_PATHS):
            return await call_next(request)
        
        # Skip if method not logged
        if request.method not in self.LOGGED_METHODS:
            return await call_next(request)
        
        # Extract user from token
        user_id = None
        username = "anonymous"
        token = None
        
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            payload = decode_access_token(token)
            if payload:
                username = payload.get("sub", "unknown")
                # We'll get the user_id from DB below
        
        # Get request body if present
        request_data = None
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if body:
                    request_data = json.loads(body.decode())
                    # Remove sensitive fields
                    if isinstance(request_data, dict):
                        request_data.pop("password", None)
                        request_data.pop("hashed_password", None)
            except:
                pass
        
        # Process request
        response = await call_next(request)
        
        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Determine status
        status = "success" if response.status_code < 400 else "failed"
        
        # Parse resource info from path
        resource_type, resource_id = self._parse_resource_from_path(request.url.path)
        
        # Create audit log entry asynchronously
        try:
            async with async_session_maker() as db:
                # Get user_id if we have username
                if username != "anonymous":
                    result = await db.execute(
                        select(User.id).where(User.username == username)
                    )
                    user_row = result.first()
                    if user_row:
                        user_id = user_row[0]
                
                audit_log = AuditLog(
                    user_id=user_id,
                    username=username,
                    action=self._determine_action(request.method, request.url.path),
                    resource_type=resource_type,
                    resource_id=resource_id,
                    endpoint=request.url.path,
                    method=request.method,
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                    description=self._generate_description(request.method, resource_type, resource_id),
                    request_data=request_data,
                    response_status=response.status_code,
                    status=status,
                    duration_ms=duration_ms
                )
                
                db.add(audit_log)
                await db.commit()
        except Exception as e:
            # Don't fail the request if audit logging fails
            print(f"Audit logging failed: {e}")
        
        return response
    
    def _parse_resource_from_path(self, path: str) -> tuple[str, str | None]:
        """Extract resource type and ID from URL path."""
        parts = path.strip("/").split("/")
        
        # Common patterns
        if "vms" in parts or "vm" in parts:
            resource_type = "vm"
            # Look for vmid
            for i, part in enumerate(parts):
                if part == "vm" and i + 1 < len(parts):
                    return resource_type, parts[i + 1]
        elif "clusters" in parts or "cluster" in parts:
            resource_type = "cluster"
            if len(parts) > 1:
                return resource_type, parts[-1]
        elif "users" in parts or "user" in parts:
            resource_type = "user"
            if len(parts) > 1 and parts[-1].isdigit():
                return resource_type, parts[-1]
        elif "backups" in parts or "backup" in parts:
            resource_type = "backup"
        elif "snapshots" in parts or "snapshot" in parts:
            resource_type = "snapshot"
        elif "isos" in parts or "iso" in parts:
            resource_type = "iso"
        elif "ippools" in parts:
            resource_type = "ippool"
        elif "nodes" in parts or "node" in parts:
            resource_type = "node"
            for i, part in enumerate(parts):
                if part == "node" and i + 1 < len(parts):
                    return resource_type, parts[i + 1]
        else:
            resource_type = "unknown"
        
        return resource_type, None
    
    def _determine_action(self, method: str, path: str) -> str:
        """Determine action from HTTP method and path."""
        if method == "GET":
            return "read"
        elif method == "POST":
            if "start" in path:
                return "start"
            elif "stop" in path:
                return "stop"
            elif "restart" in path:
                return "restart"
            elif "clone" in path:
                return "clone"
            elif "snapshot" in path:
                return "snapshot"
            elif "backup" in path:
                return "backup"
            elif "restore" in path:
                return "restore"
            else:
                return "create"
        elif method in ["PUT", "PATCH"]:
            return "update"
        elif method == "DELETE":
            return "delete"
        return "unknown"
    
    def _generate_description(self, method: str, resource_type: str, resource_id: str | None) -> str:
        """Generate human-readable description."""
        action = self._determine_action(method, "")
        
        if resource_id:
            return f"{action.capitalize()} {resource_type} {resource_id}"
        else:
            return f"{action.capitalize()} {resource_type}"
