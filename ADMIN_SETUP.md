# Admin User Setup

## Initial Admin User

KVCloud automatically creates an initial admin user on first startup. The credentials can be configured via environment variables.

### Default Credentials

**Development (docker-compose.dev.yml):**
- Username: `admin`
- Password: `admin123`
- Email: `admin@kvcloud.local`

**Production (docker-compose.yml):**
- Username: `admin`
- Password: `changeme`
- Email: `admin@kvcloud.local`

⚠️ **IMPORTANT**: Change the default password immediately after first login!

## Environment Variables

Configure the initial admin user by setting these environment variables:

```bash
INITIAL_ADMIN_USERNAME=admin          # Admin username
INITIAL_ADMIN_EMAIL=admin@example.com # Admin email
INITIAL_ADMIN_PASSWORD=your-password  # Admin password
INITIAL_ADMIN_FULL_NAME=Administrator # Admin full name
```

## Changing Password

### Via API

Once logged in, you can change your password using the `/auth/change-password` endpoint:

```bash
curl -X POST "http://localhost:8000/auth/change-password" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "admin123",
    "new_password": "your-new-secure-password"
  }'
```

### Login Example

```bash
# Get access token
curl -X POST "http://localhost:8000/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"

# Returns: {"access_token": "...", "token_type": "bearer"}
```

## Security Notes

1. The admin user is only created if NO superuser exists in the database
2. On subsequent starts, the initialization is skipped
3. Admin credentials should be changed immediately in production
4. Use strong passwords and store them securely
5. Consider using environment files (.env) for credentials, never commit them to version control

## API Endpoints

- `POST /auth/token` - Login and get access token
- `GET /auth/me` - Get current user information
- `POST /auth/register` - Register a new user (regular user)
- `POST /auth/change-password` - Change current user's password
