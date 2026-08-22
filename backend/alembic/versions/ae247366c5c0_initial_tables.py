"""Initial tables

Revision ID: ae247366c5c0
Revises: 
Create Date: 2026-08-21 19:54:23.042656

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ae247366c5c0'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # space_objects table
    op.create_table('space_objects',
        sa.Column('norad_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('object_type', sa.String(), nullable=True),
        sa.Column('rcs_class', sa.String(), nullable=True),
        sa.Column('bstar', sa.Float(), nullable=True),
        sa.Column('last_updated', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('norad_id')
    )
    op.create_index(op.f('ix_space_objects_norad_id'), 'space_objects', ['norad_id'], unique=False)
    op.create_index(op.f('ix_space_objects_name'), 'space_objects', ['name'], unique=False)

    # conjunctions table
    op.create_table('conjunctions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('norad_id_1', sa.Integer(), nullable=True),
        sa.Column('norad_id_2', sa.Integer(), nullable=True),
        sa.Column('tca', sa.DateTime(timezone=True), nullable=True),
        sa.Column('min_dist_km', sa.Float(), nullable=True),
        sa.Column('relative_speed_km_s', sa.Float(), nullable=True),
        sa.Column('pc', sa.Float(), nullable=True),
        sa.Column('hbr_m', sa.Float(), nullable=True),
        sa.Column('last_calculated', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['norad_id_1'], ['space_objects.norad_id'], ),
        sa.ForeignKeyConstraint(['norad_id_2'], ['space_objects.norad_id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conjunctions_id'), 'conjunctions', ['id'], unique=False)
    op.create_index(op.f('ix_conjunctions_norad_id_1'), 'conjunctions', ['norad_id_1'], unique=False)
    op.create_index(op.f('ix_conjunctions_norad_id_2'), 'conjunctions', ['norad_id_2'], unique=False)
    op.create_index(op.f('ix_conjunctions_pc'), 'conjunctions', ['pc'], unique=False)
    op.create_index(op.f('ix_conjunctions_tca'), 'conjunctions', ['tca'], unique=False)
    
    # composite index
    op.create_index('idx_conjunction_pair', 'conjunctions', ['norad_id_1', 'norad_id_2'], unique=False)


def downgrade() -> None:
    # drop conjunctions table and indexes
    op.drop_index('idx_conjunction_pair', table_name='conjunctions')
    op.drop_index(op.f('ix_conjunctions_tca'), table_name='conjunctions')
    op.drop_index(op.f('ix_conjunctions_pc'), table_name='conjunctions')
    op.drop_index(op.f('ix_conjunctions_norad_id_2'), table_name='conjunctions')
    op.drop_index(op.f('ix_conjunctions_norad_id_1'), table_name='conjunctions')
    op.drop_index(op.f('ix_conjunctions_id'), table_name='conjunctions')
    op.drop_table('conjunctions')
    
    # drop space_objects table and indexes
    op.drop_index(op.f('ix_space_objects_name'), table_name='space_objects')
    op.drop_index(op.f('ix_space_objects_norad_id'), table_name='space_objects')
    op.drop_table('space_objects')
