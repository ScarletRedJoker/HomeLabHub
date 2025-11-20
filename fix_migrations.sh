#!/bin/bash

# Fix agent tables migration issue
# This script drops problematic agent tables and re-runs migrations

echo "🔧 Fixing agent tables migration issue..."
echo ""

# Step 1: Drop the problematic tables
echo "📝 Step 1: Dropping old agent tables..."
docker exec homelab-dashboard python -c "
from sqlalchemy import create_engine, text
import os

db_url = os.environ.get('DATABASE_URL')
engine = create_engine(db_url)

with engine.connect() as conn:
    conn.execute(text('DROP TABLE IF EXISTS agent_messages CASCADE'))
    conn.execute(text('DROP TABLE IF EXISTS chat_history CASCADE'))
    conn.execute(text('DROP TABLE IF EXISTS agent_conversations CASCADE'))
    conn.execute(text('DROP TABLE IF EXISTS agent_tasks CASCADE'))
    conn.execute(text('DROP TABLE IF EXISTS agents CASCADE'))
    conn.commit()
    print('✓ All agent tables dropped successfully')
"

if [ $? -ne 0 ]; then
    echo "❌ Failed to drop tables"
    exit 1
fi

echo ""
echo "📝 Step 2: Running migrations..."
docker exec homelab-dashboard python -m alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📝 Step 3: Restarting services..."
    docker compose restart
    echo ""
    echo "🎉 All done! Your agent tables are now properly configured with UUID types."
else
    echo ""
    echo "❌ Migration failed. Please check the error messages above."
    exit 1
fi
