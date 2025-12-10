# Contributing to KVCloud

Thank you for considering contributing to KVCloud! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs actual behavior
- Screenshots if applicable
- Environment details (OS, Python version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use a clear and descriptive title
- Provide a detailed description of the suggested enhancement
- Explain why this enhancement would be useful
- List any similar features in other applications

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write or update tests as needed
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Development Setup

### Backend Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Development

```bash
cd frontend
npm install
npm start
```

### Running Tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

## Coding Standards

### Python (Backend)

- Follow PEP 8 style guide
- Use type hints where appropriate
- Write docstrings for functions and classes
- Keep functions small and focused
- Use meaningful variable names

Example:
```python
async def get_vm_status(node_id: int, vmid: int) -> Optional[Dict[str, Any]]:
    """Get status of a specific VM.
    
    Args:
        node_id: ID of the Proxmox node
        vmid: ID of the virtual machine
        
    Returns:
        Dict containing VM status or None if not found
    """
    pass
```

### TypeScript (Frontend)

- Follow Angular style guide
- Use strong typing
- Prefer signals over traditional observables where appropriate
- Write JSDoc comments for complex logic
- Use meaningful component and service names

Example:
```typescript
/**
 * Service for managing virtual machines
 */
@Injectable({
  providedIn: 'root'
})
export class VmService {
  /**
   * Get list of VMs for a node
   * @param nodeId - The node ID
   * @returns Observable of VM list
   */
  getVMs(nodeId: number): Observable<VM[]> {
    // implementation
  }
}
```

## Plugin Development Guidelines

When creating plugins:

1. Extend `BasePlugin` class
2. Implement all required methods
3. Include proper error handling
4. Add tests for your plugin
5. Document usage and configuration

## Module Development Guidelines

When creating modules:

1. Extend `BaseModule` class
2. Organize code in services, models, and API files
3. Register routes properly
4. Include proper RBAC checks
5. Add comprehensive tests

## Commit Message Guidelines

Format: `<type>(<scope>): <subject>`

**Types:**
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes (formatting, etc.)
- refactor: Code refactoring
- test: Adding or updating tests
- chore: Maintenance tasks

**Examples:**
```
feat(vm): add VM snapshot functionality
fix(auth): resolve token expiration issue
docs(readme): update installation instructions
```

## Testing Guidelines

- Write tests for new features
- Maintain test coverage above 80%
- Include unit tests and integration tests
- Test edge cases and error conditions
- Mock external dependencies

### Backend Tests

```python
import pytest
from app.services.proxmox import ProxmoxService

@pytest.mark.asyncio
async def test_get_vm_status(db_session):
    service = ProxmoxService(db_session)
    status = await service.get_vm_status(1, 100)
    assert status is not None
```

### Frontend Tests

```typescript
describe('VmService', () => {
  it('should fetch VMs', (done) => {
    service.getVMs(1).subscribe(vms => {
      expect(vms.length).toBeGreaterThan(0);
      done();
    });
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for architectural changes
- Add inline comments for complex logic
- Update API documentation
- Include examples where appropriate

## Review Process

1. All PRs require at least one review
2. Address review comments promptly
3. Keep PRs focused on a single feature/fix
4. Ensure CI/CD passes before requesting review
5. Squash commits if requested

## Release Process

1. Version bumping follows semantic versioning
2. Update CHANGELOG.md
3. Tag releases in git
4. Create GitHub release with notes
5. Build and publish Docker images

## Questions?

Feel free to open an issue for:
- Questions about contributing
- Clarification on guidelines
- Feature discussions
- Technical help

Thank you for contributing to KVCloud!
