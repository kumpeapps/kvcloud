"""Simple in-memory task queue API for long-running operations."""
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException

# Use shared tasks store
from app.core.tasks_store import active_tasks as download_status, history_tasks, clear_history

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/")
async def list_tasks() -> List[Dict[str, Any]]:
    """List all active in-memory tasks (cloud image downloads, etc.)."""
    return [
        {
            "id": task_id,
            **status,
        }
        for task_id, status in download_status.items()
    ]


@router.get("/history")
async def list_history() -> List[Dict[str, Any]]:
    """List archived tasks (completed or failed)."""
    return history_tasks


@router.post("/clear")
async def clear_tasks_history() -> Dict[str, Any]:
    """Clear tasks history."""
    count = clear_history()
    return {"cleared": count}


@router.get("/{task_id}")
async def get_task(task_id: str) -> Dict[str, Any]:
    """Get a specific task status by ID."""
    if task_id not in download_status:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"id": task_id, **download_status[task_id]}
