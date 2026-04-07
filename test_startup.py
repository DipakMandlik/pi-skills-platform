import sys
import os

# Test imports
try:
    print("Testing imports...")
    from apps.api.core.config import load_settings
    print("✓ Config module loaded")
    
    settings = load_settings()
    print(f"✓ Settings loaded: JWT_SECRET={'set' if settings.jwt_secret else 'missing'}")
    print(f"✓ POSTGRES_DSN: {settings.postgres_dsn[:50]}...")
    print(f"✓ SNOWFLAKE_ACCOUNT: {settings.snowflake_account}")
    
    from apps.api.core.database import init_engine
    print("✓ Database module loaded")
    
    init_engine(settings)
    print("✓ Database engine initialized")
    
    print("\n✅ All startup checks passed!")
    print("\nYou can now start the services:")
    print("  Backend: py -m uvicorn apps.api.main:app --host 0.0.0.0 --port 8000")
    print("  MCP: py -m uvicorn apps.mcp.main:app --host 0.0.0.0 --port 5000")
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
