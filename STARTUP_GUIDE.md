# System Startup Guide

## ✅ Configuration Fixed

Your `.env.local` has been updated with all required environment variables:
- ✅ JWT_SECRET configured
- ✅ POSTGRES_DSN set to SQLite for local development
- ✅ Snowflake credentials configured
- ✅ Google API key configured
- ✅ MCP server settings configured
- ✅ Bootstrap seed enabled

## 🚀 Startup Sequence

### Option 1: Start All Services Individually (Recommended for Development)

**Step 1: Install Dependencies**
```bash
# One-command clean start (optional)
npm run clean:start -- -NoStart

# Install Python dependencies for backend
npm run backend:install

# Install Python dependencies for MCP
npm run mcp:install

# Install Node.js dependencies (if not done)
npm install
```

**Step 2: Start Backend API**
```bash
npm run backend:dev
```
- Runs on port 8000
- Creates SQLite database automatically
- Runs migrations
- Seeds initial data (admin/user/viewer accounts)
- Health check: http://localhost:8000/health

**Step 3: Start MCP Server** (in a new terminal)
```bash
npm run mcp:dev
```
- Runs on port 5000
- Connects to Snowflake
- Health check: http://localhost:5000/health

**Step 4: Start Frontend** (in a new terminal)
```bash
npm run dev
```
- Runs on port 3000
- Access at: http://localhost:3000

### Option 2: Start Frontend + MCP Together
```bash
# Terminal 1: Start backend
npm run backend:dev

# Terminal 2: Start frontend + MCP
npm run dev:full
```

### Option 3: Docker Compose (Full Stack)
```bash
npm run docker:up
```
This starts all services with proper health checks and dependencies.

## 🔍 Verification Steps

### 1. Check Backend Health
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "in-memory"
}
```

### 2. Check MCP Health
```bash
curl http://localhost:5000/health
```
Expected response:
```json
{
  "status": "ok",
  "missing_env": [],
  "sql_safety_mode": "dev",
  "snowflake_connector_ready": true
}
```

### 3. Check Frontend
Open browser: http://localhost:3000

## 🔐 Default Accounts (Bootstrap Seed Enabled)

When `ENABLE_BOOTSTRAP_SEED=true`, the system creates three accounts:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@platform.local | admin123 |
| User | user@platform.local | user123 |
| Viewer | viewer@platform.local | viewer123 |

## ⚠️ Common Issues & Solutions

### Issue: Backend won't start
**Symptoms:** Error about database connection or migrations
**Solution:**
1. Check `.env.local` has `POSTGRES_DSN` set
2. For SQLite: Ensure write permissions in project directory
3. Delete `ai_governance.db` and restart to recreate

### Issue: MCP won't start
**Symptoms:** JWT_SECRET validation error or Snowflake connection error
**Solution:**
1. Verify JWT_SECRET is 32+ characters in `.env.local`
2. Verify all Snowflake credentials are correct
3. Check Snowflake account is accessible

### Issue: Frontend can't connect
**Symptoms:** Login page shows connection error
**Solution:**
1. Ensure backend is running on port 8000
2. Check CORS settings in `.env.local`
3. Verify `MCP_BASE_URL=http://localhost:5000` matches MCP port

### Issue: Port already in use
**Symptoms:** "Address already in use" error
**Solution:**
```bash
# Windows: Find and kill process on port
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

## 📝 Environment Variables Summary

### Critical (Must be set)
- `JWT_SECRET` - Authentication secret (64-char hex)
- `POSTGRES_DSN` - Database connection (SQLite OK for dev)
- `SNOWFLAKE_*` - All 7 Snowflake credentials

### Important (Recommended)
- `GOOGLE_API_KEY` - For Gemini model access
- `MCP_BASE_URL` - Backend → MCP communication
- `ENABLE_BOOTSTRAP_SEED` - Auto-create test accounts

### Optional (Has defaults)
- `REDIS_URL` - Uses in-memory fallback if empty
- `APP_ENV` - Defaults to "development"
- `CORS_ORIGINS` - Defaults include localhost:3000

## 🎯 Next Steps

1. **Start the backend:** `npm run backend:dev`
2. **Start the MCP server:** `npm run mcp:dev`
3. **Start the frontend:** `npm run dev`
4. **Login:** Use admin@platform.local / admin123
5. **Test Snowflake:** Navigate to SQL Explorer or MCP tools

## 🐛 Debugging

### Enable Debug Logging
Add to `.env.local`:
```bash
APP_LOG_LEVEL=DEBUG
MCP_LOG_LEVEL=DEBUG
DEBUG=true
```

### Check Logs
- Backend logs: Console output from `npm run backend:dev`
- MCP logs: Console output from `npm run mcp:dev`
- Frontend logs: Browser console (F12)

### Database Issues
```bash
# Reset database (SQLite)
npm run clean:start -- -ResetDb -NoStart
npm run backend:dev  # Recreates and seeds
```

### Migration Issues
```bash
# Run migrations manually
npm run db:migrate
```

## 📚 Additional Resources

- API Documentation: http://localhost:8000/docs (when running)
- Health Endpoints:
  - Backend: http://localhost:8000/health
  - MCP: http://localhost:5000/health
- Test Scripts: See `package.json` for test:* commands
