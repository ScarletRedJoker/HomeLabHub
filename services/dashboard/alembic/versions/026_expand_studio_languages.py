"""Expand studio project languages enum

Revision ID: 026_expand_studio_languages
Revises: 025_add_studio_workspace
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa

revision = '026_expand_studio_languages'
down_revision = '025_add_studio_workspace'
branch_labels = None
depends_on = None


def upgrade():
    # Add new values to the projectlanguage enum
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'gdscript'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'typescript'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'go'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'bash'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'electron'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'tauri'")
    op.execute("ALTER TYPE projectlanguage ADD VALUE IF NOT EXISTS 'unity'")


def downgrade():
    # Note: PostgreSQL doesn't support removing enum values easily
    # This is a no-op for downgrade
    pass
