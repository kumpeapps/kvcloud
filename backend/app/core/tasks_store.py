from typing import Dict, Any, List

# Active in-memory tasks (shared across modules)
active_tasks: Dict[str, Dict[str, Any]] = {}

# History of completed/failed tasks
history_tasks: List[Dict[str, Any]] = []


def archive_task(task_id: str) -> None:
    """Archive a task from active into history without removing it from active.
    Adds an 'archived' flag to avoid duplicate entries.
    """
    task = active_tasks.get(task_id)
    if not task:
        return
    if task.get('archived'):
        return
    # Copy with archived flag
    copy = dict(task)
    copy['archived'] = True
    history_tasks.append(copy)
    # Mark active as archived too to prevent duplicate appends
    task['archived'] = True


def clear_history() -> int:
    """Clear history and return count of cleared items."""
    count = len(history_tasks)
    history_tasks.clear()
    return count
