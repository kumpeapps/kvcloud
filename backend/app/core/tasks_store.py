from typing import Dict, Any, List

# Active in-memory tasks (shared across modules)
active_tasks: Dict[str, Dict[str, Any]] = {}

# History of completed/failed tasks
history_tasks: List[Dict[str, Any]] = []


def archive_task(task_id: str) -> None:
    """Move a task from active to history when it completes."""
    task = active_tasks.get(task_id)
    if not task:
        print(f"[ARCHIVE] Task {task_id} not found in active_tasks")
        return
    
    # Copy task to history with archived flag
    copy = dict(task)
    copy['archived'] = True
    history_tasks.append(copy)
    print(f"[ARCHIVE] Task {task_id} archived to history (status={copy.get('status')})")
    
    # Remove from active tasks
    del active_tasks[task_id]


def clear_history() -> int:
    """Clear history and return count of cleared items."""
    count = len(history_tasks)
    history_tasks.clear()
    return count
