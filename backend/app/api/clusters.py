"""Cluster management endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.core.database import get_db
from app.models.user import User
from app.models.proxmox_cluster import ProxmoxCluster, ProxmoxNode
from app.api.auth import get_current_user
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
    verify_ssl: bool = False


class NodeResponse(BaseModel):
    id: int
    cluster_id: int
    name: str
    host: str
    port: int
    username: str
    verify_ssl: bool
    is_active: bool
    
    class Config:
        from_attributes = True


@router.get("/", response_model=List[ClusterResponse])
async def list_clusters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all Proxmox clusters."""
    service = ProxmoxService(db)
    clusters = await service.list_clusters()
    return clusters


@router.post("/", response_model=ClusterResponse)
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


@router.get("/{cluster_id}", response_model=ClusterResponse)
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


@router.get("/{cluster_id}/nodes", response_model=List[NodeResponse])
async def list_cluster_nodes(
    cluster_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all nodes in a cluster."""
    service = ProxmoxService(db)
    nodes = await service.list_nodes(cluster_id)
    return nodes


@router.post("/nodes", response_model=NodeResponse)
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
        verify_ssl=node_data.verify_ssl
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return node


@router.get("/nodes/{node_id}", response_model=NodeResponse)
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


@router.get("/nodes/{node_id}/status")
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
