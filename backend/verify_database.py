"""
Database verification script for docintel.
Run this to confirm PostgreSQL connection and schema are working.

Usage:
    cd backend
    python verify_database.py
"""

import asyncio
import os
import sys

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.services.database import init_pool, close_pool, get_pool


async def verify_database():
    """Verify database connection and schema."""
    print("=" * 60)
    print("docintel Database Verification")
    print("=" * 60)

    try:
        # Initialize connection pool
        print("\n[1] Connecting to PostgreSQL...")
        await init_pool()
        pool = await get_pool()
        print("    ✓ Connection pool created successfully")

        # Check if tables exist
        print("\n[2] Checking tables exist...")
        async with pool.acquire() as conn:
            tables = await conn.fetch("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """)
            table_names = [row["table_name"] for row in tables]
            
            expected_tables = [
                "documents",
                "extracted_text", 
                "structured_results",
                "validation_errors",
                "document_embeddings",
                "processing_history"
            ]
            
            for table in expected_tables:
                if table in table_names:
                    print(f"    ✓ Table '{table}' exists")
                else:
                    print(f"    ✗ Table '{table}' MISSING")

        # Check pgvector extension
        print("\n[3] Checking pgvector extension...")
        async with pool.acquire() as conn:
            ext = await conn.fetchrow(
                "SELECT * FROM pg_extension WHERE extname = 'vector'"
            )
            if ext:
                print("    ✓ pgvector extension is installed")
            else:
                print("    ✗ pgvector extension NOT found (semantic search won't work)")

        # Check document count
        print("\n[4] Checking document count...")
        async with pool.acquire() as conn:
            count = await conn.fetchval("SELECT count(*) FROM documents")
            print(f"    ✓ Documents table has {count} records")

        print("\n" + "=" * 60)
        print("Database verification complete!")
        print("=" * 60)

    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        print("\nTroubleshooting:")
        print("  1. Make sure PostgreSQL is running")
        print("  2. Check your DATABASE_URL environment variable")
        print("  3. Run docs/database_schema.sql in pgAdmin to create tables")
        print("  4. Ensure pgvector extension is enabled")
        return False

    finally:
        await close_pool()

    return True


if __name__ == "__main__":
    success = asyncio.run(verify_database())
    sys.exit(0 if success else 1)