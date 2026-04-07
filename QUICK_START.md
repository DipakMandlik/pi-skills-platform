# Quick Start - Pi-Skills Platform

## ✅ Configuration Status: READY

All required environment variables are configured in `.env.local`.

## 🧹 Clean Start (1 Command)

```bash
npm run clean:start
```

## 🚀 Start the System (3 Commands)

Open 3 terminals and run:

### Terminal 1: Backend API
```bash
npm run backend:dev
```
Wait for: `Backend startup complete` message

### Terminal 2: MCP Server
```bash
npm run mcp:dev
```
Wait for: Server running message

### Terminal 3: Frontend
```bash
npm run dev
```

## 🌐 Access Points

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **MCP Server:** http://localhost:5000

## 🔐 Login Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@platform.local | admin123 | Admin |
| user@platform.local | user123 | User |
| viewer@platform.local | viewer123 | Viewer |

## ⚡ One-Line Health Check

```bash
curl http://localhost:8000/health && curl http://localhost:5000/health
```

## 🛠️ Troubleshooting

**Backend won't start?**
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000
```

**MCP won't start?**
```bash
# Check if port 5000 is in use
netstat -ano | findstr :5000
```

**Need to reset database?**
```bash
npm run clean:start -- -ResetDb -NoStart
npm run backend:dev  # Recreates and seeds
```

## 📖 Full Documentation

See `STARTUP_GUIDE.md` for detailed information.
