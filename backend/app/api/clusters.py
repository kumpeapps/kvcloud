"""Cluster management endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User
from app.models.proxmox_cluster import ProxmoxCluster, ProxmoxNode
from app.core.dependencies import get_current_user
from app.core.rbac import require_permission
from app.services.proxmox import ProxmoxService

router = APIRouter(prefix="/clusters", tags=["clusters"])


class ClusterCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ClusterResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    
    class Config:
        from_attributes = True


class NodeCreate(BaseModel):
    cluster_id: int
    name: str
    host: str
    port: int = 8006
    username: str
    password: str
    ssh_username: str = "root"
    ssh_password: Optional[str] = None
    verify_ssl: bool = False


class NodeResponse(BaseModel):
    id: int
    cluster_id: int
    name: str
    host: str
    port: int
    username: str
    ssh_username: str
    verify_ssl: bool
    is_active: bool
    
    class Config:
        from_attributes = True


@router.get("/", response_model=List[ClusterResponse])
@require_permission("cluster", "read")
async def list_clusters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all Proxmox clusters."""
    service = ProxmoxService(db)
    clusters = await service.list_clusters()
    return clusters


@router.post("/", response_model=ClusterResponse)
@require_permission("cluster", "create")
async def create_cluster(
    cluster_data: ClusterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new Proxmox cluster."""
    cluster = ProxmoxCluster(
        name=cluster_data.name,
        description=cluster_data.description
    )
    db.add(cluster)
    await db.commit()
    await db.refresh(cluster)
    return cluster


# Node routes - must come BEFORE /{cluster_id} to avoid path conflicts
@router.get("/nodes", response_model=List[NodeResponse])
@require_permission("node", "read")
async def list_all_nodes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all nodes across all clusters."""
    service = ProxmoxService(db)
    nodes = await service.list_nodes()
    return nodes


@router.post("/nodes", response_model=NodeResponse)
@require_permission("node", "create")
async def create_node(
    node_data: NodeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a new node to a cluster."""
    node = ProxmoxNode(
        cluster_id=node_data.cluster_id,
        name=node_data.name,
        host=node_data.host,
        port=node_data.port,
        username=node_data.username,
        password=node_data.password,
        ssh_username=node_data.ssh_username,
        ssh_password=node_data.ssh_password,
        verify_ssl=node_data.verify_ssl
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node


@router.get("/nodes/{node_id}", response_model=NodeResponse)
@require_permission("node", "read")
async def get_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific node."""
    service = ProxmoxService(db)
    node = await service.get_node(node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    return node


@router.put("/nodes/{node_id}", response_model=NodeResponse)
@require_permission("node", "update")
async def update_node(
    node_id: int,
    node_data: NodeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update node configuration."""
    stmt = select(ProxmoxNode).where(ProxmoxNode.id == node_id)
    result = await db.execute(stmt)
    node = result.scalar_one_or_none()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    
    # Update fields
    node.name = node_data.name
    node.host = node_data.host
    node.port = node_data.port
    node.username = node_data.username
    node.password = node_data.password
    node.ssh_username = node_data.ssh_username
    node.ssh_password = node_data.ssh_password
    node.verify_ssl = node_data.verify_ssl
    
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node


@router.get("/nodes/{node_id}/status")
@require_permission("node", "read")
async def get_node_status(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get node status from Proxmox."""
    service = ProxmoxService(db)
    node_status = await service.get_node_status(node_id)
    if not node_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found or unreachable"
        )
    return node_status


@router.get("/nodes/{node_id}/stats")
@require_permission("node", "read")
async def get_node_stats(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed node statistics including CPU, memory, storage, and VM counts."""
    service = ProxmoxService(db)
    try:
        node_stats = await service.get_node_stats(node_id)
        return node_stats
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get node statistics: {str(e)}"
        )


@router.delete("/nodes/{node_id}")
@require_permission("node", "delete")
async def delete_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a node."""
    service = ProxmoxService(db)
    node = await service.get_node(node_id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found"
        )
    
    await db.delete(node)
    await db.commit()
    return {"message": "Node deleted successfully"}


# Stats route - must also come before /{cluster_id}
@router.get("/stats/dashboard")
@require_permission("cluster", "read")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get aggregated statistics for dashboard."""
    from sqlalchemy import select, func
    
    service = ProxmoxService(db)
    
    # Get counts
    clusters_count = await db.execute(
        select(func.count(ProxmoxCluster.id)).where(ProxmoxCluster.is_active == True)
    )
    nodes_count = await db.execute(
        select(func.count(ProxmoxNode.id)).where(ProxmoxNode.is_active == True)
    )
    
    # Get first active node status
    nodes_result = await db.execute(
        select(ProxmoxNode).where(ProxmoxNode.is_active == True)
    )
    first_node = nodes_result.scalars().first()
    node_status = None
    if first_node:
        node_status = await service.get_node_status(first_node.id)
    
    # Initialize response structure
    response = {
        "clusters": {
            "total": clusters_count.scalar() or 0,
            "online": 0,
            "offline": 0
        },
        "vms": {
            "total": 0,
            "running": 0,
            "stopped": 0
        },
        "resources": {
            "cpu": {
                "usage": 0,
                "total": 0
            },
            "memory": {
                "used": 0,
                "total": 0
            },
            "storage": {
                "used": 0,
                "total": 0
            }
        },
        "nodes": nodes_count.scalar() or 0
    }
    
    return response


# Cluster-specific routes - must come AFTER /nodes and /stats routes
@router.get("/{cluster_id}", response_model=ClusterResponse)
@require_permission("cluster", "read")
async def get_cluster(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific cluster."""
    service = ProxmoxService(db)
    cluster = await service.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    return cluster


@router.put("/{cluster_id}", response_model=ClusterResponse)
@require_permission("cluster", "update")
async def update_cluster(
    cluster_id: int,
    cluster_data: ClusterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a cluster."""
    service = ProxmoxService(db)
    cluster = await service.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
    cluster.name = cluster_data.name
    if cluster_data.description is not None:
        cluster.description = cluster_data.description
    
    await db.commit()
    await db.refresh(cluster)
    return cluster


@router.delete("/{cluster_id}")
@require_permission("cluster", "delete")
async def delete_cluster(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a cluster."""
    service = ProxmoxService(db)
    cluster = await service.get_cluster(cluster_id)
    if not cluster:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cluster not found"
        )
    
    await db.delete(cluster)
    await db.commit()
    return {"message": "Cluster deleted successfully"}


@router.get("/{cluster_id}/nodes", response_model=List[NodeResponse])
@require_permission("node", "read")
async def list_cluster_nodes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all nodes in a cluster."""
    service = ProxmoxService(db)
    nodes = await service.list_nodes(cluster_id)
    return nodes

