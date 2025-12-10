#!/usr/bin/env python3
import asyncio
import sys
sys.path.insert(0, '/app')

from app.core.init_rbac import init_rbac_policies
from app.core.database import async_session_maker

async def main():
    async with async_session_maker() as db:
        await init_rbac_policies(db)
        print("RBAC policies reinitialized successfully")

if __name__ == "__main__":
    asyncio.run(main())
