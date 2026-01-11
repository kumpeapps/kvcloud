from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from starlette.datastructures import Headers
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import time
import json
import logging
from typing import Callable
from datetime import datetime, timezone
from app.core.database import async_session_maker
from app.models.audit_log import AuditLog
from app.models.user import User
from app.core.security import decode_access_token

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests for audit purposes."""
    
    # Paths to exclude from audit logging
    EXCLUDED_PATHS = [
        "/docs",
        "/redoc",
        "/openapi.json",
        "/health",
        # "/api/auth/token",  # Don't log login attempts
    ]
    
    def __init__(self, app: ASGIApp, log_read_operations: bool = False):
        super().__init__(app)
        self.log_read_operations = log_read_operations
        # Methods to log (typically exclude GET for read operations to reduce logs)
        self.logged_methods = ["POST", "PUT", "PATCH", "DELETE"]
        if log_read_operations:
            self.logged_methods.append("GET")
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request and log to audit table."""
        start_time = time.time()
        
        # Skip excluded paths
        if any(request.url.path.startswith(path) for path in self.EXCLUDED_PATHS):
            return await call_next(request)
        
        # Skip if method not logged
        if request.method not in self.logged_methods:
            logger.debug(f"[AUDIT] Skipped (method {request.method} not in {self.logged_methods}): {request.url.path}")
            return await call_next(request)
        
        logger.warning(f"[AUDIT] Processing {request.method} {request.url.path}")
        
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
        
        # Get request body and query params
        request_data = None
        
        # For POST/PUT/PATCH, try to read and cache body
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                # Read body (this caches it in the request object)
                body = await request.body()
                if body:
                    try:
                        data = json.loads(body.decode())
                        # Remove sensitive fields
                        if isinstance(data, dict):
                            data_copy = data.copy()
                            data_copy.pop("password", None)
                            data_copy.pop("hashed_password", None)
                        else:
                            data_copy = data
                        request_data = data_copy
                    except:
                        # If not JSON, just note that body exists
                        request_data = {"_note": "Non-JSON body", "size": len(body)}
            except Exception as e:
                logger.debug(f"[AUDIT] Could not capture request body: {e}")
        
        # For GET/DELETE, capture significant query params (skip pagination)
        elif request.method in ["GET", "DELETE"]:
            query_params = dict(request.query_params)
            # Remove pagination params to reduce noise
            query_params.pop("skip", None)
            query_params.pop("limit", None)
            query_params.pop("offset", None)
            if query_params:
                request_data = {"query": query_params}
        
        # Process request
        # Note: request.body() is cached by FastAPI, so reading it above doesn't prevent reading here
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
                    request_data=request_data if request_data else None,
                    response_status=response.status_code,
                    status=status,
                    duration_ms=duration_ms,
                    created_at=datetime.now(timezone.utc)
                )
                
                db.add(audit_log)
                await db.commit()
        except Exception as e:
            # Don't fail the request if audit logging fails
            logger.warning(f"[AUDIT] Failed to log: {type(e).__name__}: {str(e)}")
        
        return response
    
    def _parse_resource_from_path(self, path: str) -> tuple[str, str | None]:
        """Extract resource type and ID from URL path."""
        parts = path.strip("/").split("/")
        
        # Map of endpoints to resource types
        resource_map = {
            "vms": "vm",
            "vm": "vm",
            "clusters": "cluster",
            "cluster": "cluster",
            "users": "user",
            "user": "user",
            "roles": "role",
            "role": "role",
            "backups": "backup",
            "backup": "backup",
            "snapshots": "snapshot",
            "snapshot": "snapshot",
            "isos": "iso",
            "iso": "iso",
            "ippools": "ippool",
            "ippool": "ippool",
            "nodes": "node",
            "node": "node",
            "templates": "template",
            "template": "template",
            "disks": "disk",
            "disk": "disk",
            "networks": "network",
            "network": "network",
            "tasks": "task",
            "task": "task",
            "audit-logs": "audit-log",
            "firewall": "firewall",
            "metrics": "metric",
            "console": "console",
            "snapshots": "snapshot",
            "cloud-init": "cloud-init",
            "ssh-keys": "ssh-key",
            "quotas": "quota",
            "auth": "auth",
        }
        
        # Try to find resource type from path parts
        resource_type = None
        resource_id = None
        
        for i, part in enumerate(parts):
            if part in resource_map:
                resource_type = resource_map[part]
                # Try to get resource ID from next part if it's not an action
                if i + 1 < len(parts):
                    next_part = parts[i + 1]
                    # Skip action keywords, look for numeric IDs
                    if not next_part in ['create', 'read', 'update', 'delete', 'start', 'stop', 'restart', 
                                        'snapshot', 'backup', 'restore', 'clone', 'stats', 'summary',
                                        'permissions', 'me', 'token', 'login', 'logout']:
                        # Check if it looks like an ID (numeric, UUID, or valid identifier)
                        if next_part and (next_part.isdigit() or '-' in next_part or '_' in next_part):
                            resource_id = next_part
                break
        
        # If no resource type found, try to extract from common patterns
        if not resource_type:
            if len(parts) > 0:
                first_part = parts[0]
                if first_part in resource_map:
                    resource_type = resource_map[first_part]
                    if len(parts) > 1 and parts[1].isdigit():
                        resource_id = parts[1]
                else:
                    resource_type = "unknown"
            else:
                resource_type = "unknown"
        
        return resource_type or "unknown", resource_id
    
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
