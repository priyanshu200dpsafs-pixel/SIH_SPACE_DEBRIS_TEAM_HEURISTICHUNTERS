"""Add multi-model consensus fields to conjunctions

Revision ID: c1f9d45e89a1
Revises: ae247366c5c0
Create Date: 2026-08-26 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1f9d45e89a1'
down_revision: Union[str, Sequence[str], None] = 'ae247366c5c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add consensus columns to conjunctions table
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_cols = [c['name'] for c in inspector.get_columns('conjunctions')]

    if 'consensus_status' not in existing_cols:
        op.add_column('conjunctions', sa.Column('consensus_status', sa.String(), nullable=True))
    if 'model_agreement_score' not in existing_cols:
        op.add_column('conjunctions', sa.Column('model_agreement_score', sa.Float(), nullable=True))
    if 'consensus_metrics' not in existing_cols:
        op.add_column('conjunctions', sa.Column('consensus_metrics', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('conjunctions', 'consensus_metrics')
    op.drop_column('conjunctions', 'model_agreement_score')
    op.drop_column('conjunctions', 'consensus_status')
