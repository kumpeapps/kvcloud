from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, Field

from ..core.database import get_db
from ..core.dependencies import get_current_user, require_permission
from ..models.metric_history import MetricHistory
from ..models.user import User
from ..services.proxmox import ProxmoxService

router = APIRouter(prefix="/metrics/history", tags=["metrics-history"])


# Pydantic models
class MetricHistoryResponse(BaseModel):
    id: int
    resource_type: str
    resource_id: str
    node_id: Optional[int]
    timeframe: str
    timestamp: str
    cpu_usage: Optional[float]
    cpu_iowait: Optional[float]
    memory_used: Optional[float]
    memory_total: Optional[float]
    memory_usage_percent: Optional[float]
    disk_read_bytes: Optional[float]
    disk_write_bytes: Optional[float]
    disk_used: Optional[float]
    disk_total: Optional[float]
    network_in_bytes: Optional[float]
    network_out_bytes: Optional[float]
    storage_used: Optional[float]
    storage_total: Optional[float]
    storage_usage_percent: Optional[float]
    additional_metrics: Optional[dict]
    created_at: str

    class Config:
        from_attributes = True


class MetricAggregateResponse(BaseModel):
    resource_type: str
    resource_id: str
    timeframe: str
    start_time: str
    end_time: str
    avg_cpu_usage: Optional[float]
    max_cpu_usage: Optional[float]
    avg_memory_usage_percent: Optional[float]
    max_memory_usage_percent: Optional[float]
    total_disk_read_bytes: Optional[float]
    total_disk_write_bytes: Optional[float]
    total_network_in_bytes: Optional[float]
    total_network_out_bytes: Optional[float]
    data_points: int


@router.get(
    "/node/{node_id}",
    response_model=List[MetricHistoryResponse],
    summary="Get node historical metrics"
)
@require_permission("node", "read")
async def get_node_history(
    node_id: int,
    timeframe: str = Query("day", description="Timeframe: hour, day, week, month, year"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO format)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO format)"),
    limit: int = Query(100, le=1000, description="Maximum records to return"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get historical metrics for a node."""
    # Default time range if not specified
    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        # Default: last 24 hours
        start_time = end_time - timedelta(days=1)
    
    # Build query
    query = select(MetricHistory).where(
        and_(
            MetricHistory.resource_type == "node",
            MetricHistory.node_id == node_id,
            MetricHistory.timeframe == timeframe,
            MetricHistory.timestamp >= start_time,
            MetricHistory.timestamp <= end_time
        )
    ).order_by(MetricHistory.timestamp.desc()).limit(limit)
    
    result = await db.execute(query)
    metrics = result.scalars().all()
    
    return [
        MetricHistoryResponse(
            id=m.id,
            resource_type=m.resource_type,
            resource_id=m.resource_id,
            node_id=m.node_id,
            timeframe=m.timeframe,
            timestamp=m.timestamp.isoformat(),
            cpu_usage=m.cpu_usage,
            cpu_iowait=m.cpu_iowait,
            memory_used=m.memory_used,
            memory_total=m.memory_total,
            memory_usage_percent=m.memory_usage_percent,
            disk_read_bytes=m.disk_read_bytes,
            disk_write_bytes=m.disk_write_bytes,
            disk_used=m.disk_used,
            disk_total=m.disk_total,
            network_in_bytes=m.network_in_bytes,
            network_out_bytes=m.network_out_bytes,
            storage_used=m.storage_used,
            storage_total=m.storage_total,
            storage_usage_percent=m.storage_usage_percent,
            additional_metrics=m.additional_metrics,
            created_at=m.created_at.isoformat()
        )
        for m in metrics
    ]


@router.get(
    "/vm/{vmid}",
    response_model=List[MetricHistoryResponse],
    summary="Get VM historical metrics"
)
@require_permission("vm", "read")
async def get_vm_history(
    vmid: int,
    node_id: Optional[int] = Query(None, description="Filter by node"),
    timeframe: str = Query("day", description="Timeframe: hour, day, week, month, year"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO format)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO format)"),
    limit: int = Query(100, le=1000, description="Maximum records to return"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get historical metrics for a VM."""
    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        start_time = end_time - timedelta(days=1)
    
    # Build query conditions
    conditions = [
        MetricHistory.resource_type == "vm",
        MetricHistory.resource_id == str(vmid),
        MetricHistory.timeframe == timeframe,
        MetricHistory.timestamp >= start_time,
        MetricHistory.timestamp <= end_time
    ]
    
    if node_id:
        conditions.append(MetricHistory.node_id == node_id)
    
    query = select(MetricHistory).where(
        and_(*conditions)
    ).order_by(MetricHistory.timestamp.desc()).limit(limit)
    
    result = await db.execute(query)
    metrics = result.scalars().all()
    
    return [
        MetricHistoryResponse(
            id=m.id,
            resource_type=m.resource_type,
            resource_id=m.resource_id,
            node_id=m.node_id,
            timeframe=m.timeframe,
            timestamp=m.timestamp.isoformat(),
            cpu_usage=m.cpu_usage,
            cpu_iowait=m.cpu_iowait,
            memory_used=m.memory_used,
            memory_total=m.memory_total,
            memory_usage_percent=m.memory_usage_percent,
            disk_read_bytes=m.disk_read_bytes,
            disk_write_bytes=m.disk_write_bytes,
            disk_used=m.disk_used,
            disk_total=m.disk_total,
            network_in_bytes=m.network_in_bytes,
            network_out_bytes=m.network_out_bytes,
            storage_used=m.storage_used,
            storage_total=m.storage_total,
            storage_usage_percent=m.storage_usage_percent,
            additional_metrics=m.additional_metrics,
            created_at=m.created_at.isoformat()
        )
        for m in metrics
    ]


@router.get(
    "/node/{node_id}/aggregate",
    response_model=MetricAggregateResponse,
    summary="Get aggregated node metrics"
)
@require_permission("node", "read")
async def get_node_aggregate(
    node_id: int,
    timeframe: str = Query("day", description="Timeframe: hour, day, week, month, year"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO format)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get aggregated statistics for node metrics over a time period."""
    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        start_time = end_time - timedelta(days=7)
    
    # Get aggregated data
    query = select(
        func.avg(MetricHistory.cpu_usage).label("avg_cpu"),
        func.max(MetricHistory.cpu_usage).label("max_cpu"),
        func.avg(MetricHistory.memory_usage_percent).label("avg_mem"),
        func.max(MetricHistory.memory_usage_percent).label("max_mem"),
        func.sum(MetricHistory.disk_read_bytes).label("total_read"),
        func.sum(MetricHistory.disk_write_bytes).label("total_write"),
        func.sum(MetricHistory.network_in_bytes).label("total_net_in"),
        func.sum(MetricHistory.network_out_bytes).label("total_net_out"),
        func.count(MetricHistory.id).label("count")
    ).where(
        and_(
            MetricHistory.resource_type == "node",
            MetricHistory.node_id == node_id,
            MetricHistory.timeframe == timeframe,
            MetricHistory.timestamp >= start_time,
            MetricHistory.timestamp <= end_time
        )
    )
    
    result = await db.execute(query)
    row = result.first()
    
    if not row or row.count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No metrics found for the specified time range"
        )
    
    return MetricAggregateResponse(
        resource_type="node",
        resource_id=str(node_id),
        timeframe=timeframe,
        start_time=start_time.isoformat(),
        end_time=end_time.isoformat(),
        avg_cpu_usage=row.avg_cpu,
        max_cpu_usage=row.max_cpu,
        avg_memory_usage_percent=row.avg_mem,
        max_memory_usage_percent=row.max_mem,
        total_disk_read_bytes=row.total_read,
        total_disk_write_bytes=row.total_write,
        total_network_in_bytes=row.total_net_in,
        total_network_out_bytes=row.total_net_out,
        data_points=row.count
    )


@router.get(
    "/vm/{vmid}/aggregate",
    response_model=MetricAggregateResponse,
    summary="Get aggregated VM metrics"
)
@require_permission("vm", "read")
async def get_vm_aggregate(
    vmid: int,
    node_id: Optional[int] = Query(None, description="Filter by node"),
    timeframe: str = Query("day", description="Timeframe: hour, day, week, month, year"),
    start_time: Optional[datetime] = Query(None, description="Start time (ISO format)"),
    end_time: Optional[datetime] = Query(None, description="End time (ISO format)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get aggregated statistics for VM metrics over a time period."""
    if not end_time:
        end_time = datetime.utcnow()
    if not start_time:
        start_time = end_time - timedelta(days=7)
    
    conditions = [
        MetricHistory.resource_type == "vm",
        MetricHistory.resource_id == str(vmid),
        MetricHistory.timeframe == timeframe,
        MetricHistory.timestamp >= start_time,
        MetricHistory.timestamp <= end_time
    ]
    
    if node_id:
        conditions.append(MetricHistory.node_id == node_id)
    
    query = select(
        func.avg(MetricHistory.cpu_usage).label("avg_cpu"),
        func.max(MetricHistory.cpu_usage).label("max_cpu"),
        func.avg(MetricHistory.memory_usage_percent).label("avg_mem"),
        func.max(MetricHistory.memory_usage_percent).label("max_mem"),
        func.sum(MetricHistory.disk_read_bytes).label("total_read"),
        func.sum(MetricHistory.disk_write_bytes).label("total_write"),
        func.sum(MetricHistory.network_in_bytes).label("total_net_in"),
        func.sum(MetricHistory.network_out_bytes).label("total_net_out"),
        func.count(MetricHistory.id).label("count")
    ).where(and_(*conditions))
    
    result = await db.execute(query)
    row = result.first()
    
    if not row or row.count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No metrics found for the specified time range"
        )
    
    return MetricAggregateResponse(
        resource_type="vm",
        resource_id=str(vmid),
        timeframe=timeframe,
        start_time=start_time.isoformat(),
        end_time=end_time.isoformat(),
        avg_cpu_usage=row.avg_cpu,
        max_cpu_usage=row.max_cpu,
        avg_memory_usage_percent=row.avg_mem,
        max_memory_usage_percent=row.max_mem,
        total_disk_read_bytes=row.total_read,
        total_disk_write_bytes=row.total_write,
        total_network_in_bytes=row.total_net_in,
        total_network_out_bytes=row.total_net_out,
        data_points=row.count
    )


@router.post(
    "/collect/node/{node_id}",
    response_model=dict,
    summary="Collect and store node RRD data"
)
@require_permission("node", "update")
async def collect_node_metrics(
    node_id: int,
    timeframe: str = Query("hour", description="Timeframe: hour, day, week, month, year"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger collection of node RRD data from Proxmox."""
    try:
        proxmox = ProxmoxService()
        node_name = proxmox.get_node_name_by_id(node_id)
        
        # Get RRD data from Proxmox
        # Proxmox RRD timeframes: hour, day, week, month, year
        rrd_data = proxmox.proxmox.nodes(node_name).rrddata.get(timeframe=timeframe)
        
        stored_count = 0
        for data_point in rrd_data:
            # Convert Proxmox timestamp to datetime
            timestamp = datetime.fromtimestamp(data_point.get('time', 0))
            
            # Calculate memory usage percentage
            mem_total = data_point.get('memtotal')
            mem_used = data_point.get('memused')
            mem_percent = (mem_used / mem_total * 100) if mem_total else None
            
            # Create metric record
            metric = MetricHistory(
                resource_type="node",
                resource_id=node_name,
                node_id=node_id,
                timeframe=timeframe,
                timestamp=timestamp,
                cpu_usage=data_point.get('cpu'),
                cpu_iowait=data_point.get('iowait'),
                memory_used=mem_used,
                memory_total=mem_total,
                memory_usage_percent=mem_percent,
                disk_read_bytes=data_point.get('diskread'),
                disk_write_bytes=data_point.get('diskwrite'),
                network_in_bytes=data_point.get('netin'),
                network_out_bytes=data_point.get('netout'),
                additional_metrics={
                    k: v for k, v in data_point.items()
                    if k not in ['time', 'cpu', 'iowait', 'memtotal', 'memused', 'diskread', 'diskwrite', 'netin', 'netout']
                }
            )
            
            db.add(metric)
            stored_count += 1
        
        await db.commit()
        
        return {
            "message": "Node metrics collected successfully",
            "node_id": node_id,
            "node_name": node_name,
            "timeframe": timeframe,
            "stored_count": stored_count
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect node metrics: {str(e)}"
        )


@router.post(
    "/collect/vm/{vmid}",
    response_model=dict,
    summary="Collect and store VM RRD data"
)
@require_permission("vm", "update")
async def collect_vm_metrics(
    vmid: int,
    node_id: int = Query(..., description="Node ID where VM is located"),
    timeframe: str = Query("hour", description="Timeframe: hour, day, week, month, year"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger collection of VM RRD data from Proxmox."""
    try:
        proxmox = ProxmoxService()
        node_name = proxmox.get_node_name_by_id(node_id)
        
        # Get VM RRD data from Proxmox
        rrd_data = proxmox.proxmox.nodes(node_name).qemu(vmid).rrddata.get(timeframe=timeframe)
        
        stored_count = 0
        for data_point in rrd_data:
            timestamp = datetime.fromtimestamp(data_point.get('time', 0))
            
            # Calculate memory usage percentage
            mem_total = data_point.get('maxmem')
            mem_used = data_point.get('mem')
            mem_percent = (mem_used / mem_total * 100) if mem_total else None
            
            metric = MetricHistory(
                resource_type="vm",
                resource_id=str(vmid),
                node_id=node_id,
                timeframe=timeframe,
                timestamp=timestamp,
                cpu_usage=data_point.get('cpu'),
                memory_used=mem_used,
                memory_total=mem_total,
                memory_usage_percent=mem_percent,
                disk_read_bytes=data_point.get('diskread'),
                disk_write_bytes=data_point.get('diskwrite'),
                network_in_bytes=data_point.get('netin'),
                network_out_bytes=data_point.get('netout'),
                additional_metrics={
                    k: v for k, v in data_point.items()
                    if k not in ['time', 'cpu', 'mem', 'maxmem', 'diskread', 'diskwrite', 'netin', 'netout']
                }
            )
            
            db.add(metric)
            stored_count += 1
        
        await db.commit()
        
        return {
            "message": "VM metrics collected successfully",
            "vmid": vmid,
            "node_id": node_id,
            "node_name": node_name,
            "timeframe": timeframe,
            "stored_count": stored_count
        }
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect VM metrics: {str(e)}"
        )


@router.delete(
    "/cleanup",
    response_model=dict,
    summary="Clean up old metric history"
)
@require_permission("node", "delete")
async def cleanup_metric_history(
    days: int = Query(90, ge=1, le=730, description="Delete metrics older than N days"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete metric history older than specified days."""
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(func.count(MetricHistory.id)).where(
            MetricHistory.timestamp < cutoff_date
        )
    )
    count = result.scalar()
    
    # Delete old metrics
    from sqlalchemy import delete
    await db.execute(
        delete(MetricHistory).where(
            MetricHistory.timestamp < cutoff_date
        )
    )
    
    await db.commit()
    
    return {
        "message": "Old metric history deleted successfully",
        "deleted_count": count,
        "cutoff_date": cutoff_date.isoformat(),
        "days": days
    }
