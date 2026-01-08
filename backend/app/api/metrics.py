from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.dependencies import get_current_user
from app.core.database import get_db
from app.core.rbac import require_permission
from app.models.user import User
from app.services.proxmox import ProxmoxService
from datetime import datetime, timedelta
import time

router = APIRouter(prefix="/metrics", tags=["metrics"])


class MetricPoint(BaseModel):
    """Single metric data point."""
    timestamp: int = Field(..., description="Unix timestamp")
    value: float = Field(..., description="Metric value")


class NodeMetrics(BaseModel):
    """Node performance metrics."""
    node_id: int
    node_name: str
    cpu: List[MetricPoint]
    memory: List[MetricPoint]
    network_in: List[MetricPoint]
    network_out: List[MetricPoint]
    uptime: Optional[int] = None
    load_average: Optional[List[float]] = None


class VMMetrics(BaseModel):
    """VM performance metrics."""
    vmid: int
    vm_name: str
    cpu: List[MetricPoint]
    memory: List[MetricPoint]
    disk_read: List[MetricPoint]
    disk_write: List[MetricPoint]


class ClusterMetrics(BaseModel):
    """Cluster-wide metrics aggregation."""
    total_cpu_cores: int
    total_memory_gb: int
    total_storage_gb: int
    cpu_usage_percent: float
    memory_usage_percent: float
    storage_usage_percent: float
    nodes_online: int
    nodes_offline: int
    vms_running: int
    vms_stopped: int
    timestamp: int


# In-memory metrics storage (in production, use a time-series database like InfluxDB)
metrics_cache: Dict[str, Any] = {
    'node_metrics': {},
    'vm_metrics': {},
    'last_update': 0
}


@router.get("/nodes/{node_id}", response_model=NodeMetrics)
@require_permission("node", "read")
async def get_node_metrics(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    duration_minutes: int = 60
) -> NodeMetrics:
    """
    Get node performance metrics for the specified duration.
    
    Args:
        node_id: Node ID to retrieve metrics for
        duration_minutes: Duration to retrieve metrics for (default: 60 minutes)
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        node = await proxmox_service.get_node(node_id)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Node not found"
            )
        
        # Get real metrics from Proxmox RRD data
        rrd_data = await proxmox_service.get_node_rrd_data(node_id, timeframe='hour')
        
        # Get current node status for real-time data
        node_status = await proxmox_service.get_node_status(node_id)
        
        metrics_data = {
            'cpu': [],
            'memory': [],
            'network_in': [],
            'network_out': []
        }
        
        if rrd_data:
            for point in rrd_data:
                timestamp = int(point.get('time', 0))
                
                # Proxmox returns CPU as decimal (0.011 = 1.1%), convert to percentage
                cpu_val = point.get('cpu', 0)
                if cpu_val is not None:
                    cpu_percent = cpu_val * 100
                    metrics_data['cpu'].append(MetricPoint(timestamp=timestamp, value=cpu_percent))
                
                # Memory: calculate percentage from used/total
                mem_used = point.get('memused', 0)
                mem_total = point.get('memtotal', 1)
                if mem_used is not None and mem_total and mem_total > 0:
                    mem_percent = (mem_used / mem_total) * 100
                    metrics_data['memory'].append(MetricPoint(timestamp=timestamp, value=mem_percent))
                
                # Network: convert bytes/sec to Mbps
                netin = point.get('netin', 0)
                netout = point.get('netout', 0)
                if netin is not None:
                    metrics_data['network_in'].append(MetricPoint(timestamp=timestamp, value=(netin * 8) / 1_000_000))
                if netout is not None:
                    metrics_data['network_out'].append(MetricPoint(timestamp=timestamp, value=(netout * 8) / 1_000_000))
            
            # Debug: log first CPU value
            if metrics_data['cpu']:
                print(f"[DEBUG] First CPU metric being returned: {metrics_data['cpu'][0].value}%")
        
        return NodeMetrics(
            node_id=node_id,
            node_name=node.name,
            cpu=metrics_data['cpu'],
            memory=metrics_data['memory'],
            network_in=metrics_data['network_in'],
            network_out=metrics_data['network_out'],
            uptime=node_status.get('uptime') if node_status else None,
            load_average=node_status.get('loadavg') if node_status else None
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve node metrics: {str(e)}"
        )


@router.get("/vms/{node_id}/{vmid}", response_model=VMMetrics)
@require_permission("vm", "read")
async def get_vm_metrics(
    node_id: int,
    vmid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    duration_minutes: int = 60
) -> VMMetrics:
    """
    Get VM performance metrics for the specified duration.
    
    Args:
        node_id: Node ID where VM is located
        vmid: VM ID to retrieve metrics for
        duration_minutes: Duration to retrieve metrics for (default: 60 minutes)
    """
    proxmox_service = ProxmoxService(db)
    
    try:
        # Verify VM exists
        vms = await proxmox_service.list_vms(node_id)
        vm = next((v for v in vms if v.get('vmid') == vmid), None)
        if not vm:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="VM not found"
            )
        
        # Get real metrics from Proxmox RRD data
        rrd_data = await proxmox_service.get_vm_rrd_data(node_id, vmid, timeframe='hour')
        
        metrics_data = {
            'cpu': [],
            'memory': [],
            'disk_read': [],
            'disk_write': []
        }
        
        if rrd_data:
            for point in rrd_data:
                timestamp = int(point.get('time', 0))
                
                # Proxmox returns CPU as decimal, convert to percentage
                cpu_val = point.get('cpu', 0)
                if cpu_val is not None:
                    metrics_data['cpu'].append(MetricPoint(timestamp=timestamp, value=cpu_val * 100))
                
                # Memory: calculate percentage from used/max
                mem_used = point.get('mem', 0)
                mem_max = point.get('maxmem', 1)
                if mem_used is not None and mem_max and mem_max > 0:
                    mem_percent = (mem_used / mem_max) * 100
                    metrics_data['memory'].append(MetricPoint(timestamp=timestamp, value=mem_percent))
                
                # Disk I/O: bytes/sec
                disk_read = point.get('diskread', 0)
                disk_write = point.get('diskwrite', 0)
                if disk_read is not None:
                    # Convert to MB/s
                    metrics_data['disk_read'].append(MetricPoint(timestamp=timestamp, value=disk_read / 1_000_000))
                if disk_write is not None:
                    metrics_data['disk_write'].append(MetricPoint(timestamp=timestamp, value=disk_write / 1_000_000))
        
        return VMMetrics(
            vmid=vmid,
            vm_name=vm.get('name', f'VM-{vmid}'),
            cpu=metrics_data['cpu'],
            memory=metrics_data['memory'],
            disk_read=metrics_data['disk_read'],
            disk_write=metrics_data['disk_write']
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve VM metrics: {str(e)}"
        )


@router.get("/cluster", response_model=ClusterMetrics)
@require_permission("cluster", "read")
async def get_cluster_metrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> ClusterMetrics:
    """Get aggregated cluster-wide metrics."""
    proxmox_service = ProxmoxService(db)
    
    try:
        from app.models.proxmox_cluster import ProxmoxCluster, ProxmoxNode
        from sqlalchemy import select, func
        
        # Get cluster stats
        result = await db.execute(
            select(ProxmoxCluster).where(ProxmoxCluster.is_active == True)
        )
        clusters = result.scalars().all()
        
        if not clusters:
            return ClusterMetrics(
                total_cpu_cores=0,
                total_memory_gb=0,
                total_storage_gb=0,
                cpu_usage_percent=0,
                memory_usage_percent=0,
                storage_usage_percent=0,
                nodes_online=0,
                nodes_offline=0,
                vms_running=0,
                vms_stopped=0,
                timestamp=int(time.time())
            )
        
        # Aggregate metrics
        total_cpu = 0
        total_memory = 0
        total_storage = 0
        cpu_usage = 0
        memory_usage = 0
        storage_usage = 0
        nodes_online = 0
        nodes_offline = 0
        vms_running = 0
        vms_stopped = 0
        
        for cluster in clusters:
            nodes_result = await db.execute(
                select(ProxmoxNode).where(
                    ProxmoxNode.cluster_id == cluster.id,
                    ProxmoxNode.is_active == True
                )
            )
            nodes = nodes_result.scalars().all()
            
            for node in nodes:
                try:
                    status = await proxmox_service.get_node_status(node.id)
                    if status:
                        nodes_online += 1
                        # Accumulate node metrics
                        total_cpu += status.get('cpuinfo', {}).get('cores', 0)
                        total_memory += status.get('memory', {}).get('total', 0) / (1024**3)  # Convert to GB
                        total_storage += status.get('rootfs', {}).get('total', 0) / (1024**3)  # Convert to GB
                        cpu_usage += status.get('cpu', 0)  # Keep as decimal for averaging
                        memory_usage += status.get('memory', {}).get('used', 0) / (1024**3)
                        storage_usage += status.get('rootfs', {}).get('used', 0) / (1024**3)
                        
                        # Count VMs on this node (skip templates)
                        vms = await proxmox_service.list_vms(node.id)
                        for vm in vms:
                            if vm.get('template') in (1, True, '1', 'true'):
                                continue

                            vm_status = vm.get('status', 'stopped')
                            if vm_status == 'running':
                                vms_running += 1
                            else:
                                vms_stopped += 1
                except:
                    nodes_offline += 1
        
        # Calculate percentages
        cpu_percent = (cpu_usage / nodes_online * 100) if nodes_online > 0 else 0
        memory_percent = (memory_usage / total_memory * 100) if total_memory > 0 else 0
        storage_percent = (storage_usage / total_storage * 100) if total_storage > 0 else 0
        
        return ClusterMetrics(
            total_cpu_cores=total_cpu,
            total_memory_gb=int(total_memory),
            total_storage_gb=int(total_storage),
            cpu_usage_percent=min(cpu_percent, 100),
            memory_usage_percent=min(memory_percent, 100),
            storage_usage_percent=min(storage_percent, 100),
            nodes_online=nodes_online,
            nodes_offline=nodes_offline,
            vms_running=vms_running,
            vms_stopped=vms_stopped,
            timestamp=int(time.time())
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve cluster metrics: {str(e)}"
        )
