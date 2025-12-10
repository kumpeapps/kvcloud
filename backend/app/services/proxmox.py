"""Proxmox service for cluster and VM management."""
from typing import List, Optional, Dict, Any
from proxmoxer import ProxmoxAPI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.proxmox_cluster import ProxmoxCluster, ProxmoxNode


class ProxmoxService:
    """Service for Proxmox cluster management."""
    
    def __init__(self, db: AsyncSession):
        """Initialize Proxmox service."""
        self.db = db
        self._connections: Dict[int, ProxmoxAPI] = {}
    
    async def get_cluster(self, cluster_id: int) -> Optional[ProxmoxCluster]:
        """Get cluster by ID."""
        result = await self.db.execute(
            select(ProxmoxCluster).where(ProxmoxCluster.id == cluster_id)
        )
        return result.scalar_one_or_none()
    
    async def list_clusters(self) -> List[ProxmoxCluster]:
        """List all clusters."""
        result = await self.db.execute(select(ProxmoxCluster))
        return list(result.scalars().all())
    
    async def get_node(self, node_id: int) -> Optional[ProxmoxNode]:
        """Get node by ID."""
        result = await self.db.execute(
            select(ProxmoxNode).where(ProxmoxNode.id == node_id)
        )
        return result.scalar_one_or_none()
    
    async def list_nodes(self, cluster_id: Optional[int] = None) -> List[ProxmoxNode]:
        """List all nodes or nodes for a specific cluster."""
        query = select(ProxmoxNode)
        if cluster_id:
            query = query.where(ProxmoxNode.cluster_id == cluster_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    def _get_proxmox_connection(self, node: ProxmoxNode) -> ProxmoxAPI:
        """Get or create Proxmox API connection for a node."""
        if node.id not in self._connections:
            self._connections[node.id] = ProxmoxAPI(
                node.host,
                user=node.username,
                password=node.password,
                port=node.port,
                verify_ssl=node.verify_ssl
            )
        return self._connections[node.id]
    
    async def get_node_status(self, node_id: int) -> Optional[Dict[str, Any]]:
        """Get status of a Proxmox node."""
        node = await self.get_node(node_id)
        if not node:
            return None
        
        try:
            proxmox = self._get_proxmox_connection(node)
            status = proxmox.nodes(node.name).status.get()
            return status
        except Exception as e:
            print(f"Error getting node status: {e}")
            return None
    
    async def list_vms(self, node_id: int) -> List[Dict[str, Any]]:
        """List all VMs on a node."""
        node = await self.get_node(node_id)
        if not node:
            return []
        
        try:
            proxmox = self._get_proxmox_connection(node)
            vms = proxmox.nodes(node.name).qemu.get()
            return vms
        except Exception as e:
            print(f"Error listing VMs: {e}")
            return []
    
    async def get_vm_status(self, node_id: int, vmid: int) -> Optional[Dict[str, Any]]:
        """Get status of a specific VM."""
        node = await self.get_node(node_id)
        if not node:
            return None
        
        try:
            proxmox = self._get_proxmox_connection(node)
            status = proxmox.nodes(node.name).qemu(vmid).status.current.get()
            return status
        except Exception as e:
            print(f"Error getting VM status: {e}")
            return None
    
    async def start_vm(self, node_id: int, vmid: int) -> bool:
        """Start a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            proxmox.nodes(node.name).qemu(vmid).status.start.post()
            return True
        except Exception as e:
            print(f"Error starting VM: {e}")
            return False
    
    async def stop_vm(self, node_id: int, vmid: int) -> bool:
        """Stop a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            proxmox.nodes(node.name).qemu(vmid).status.stop.post()
            return True
        except Exception as e:
            print(f"Error stopping VM: {e}")
            return False
    
    async def restart_vm(self, node_id: int, vmid: int) -> bool:
        """Restart a VM."""
        node = await self.get_node(node_id)
        if not node:
            return False
        
        try:
            proxmox = self._get_proxmox_connection(node)
            proxmox.nodes(node.name).qemu(vmid).status.reboot.post()
            return True
        except Exception as e:
            print(f"Error restarting VM: {e}")
            return False
