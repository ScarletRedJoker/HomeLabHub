from sqlalchemy import String, DateTime, Text, Integer, Boolean, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime
from . import Base


class MarketplaceApp(Base):
    """Represents an app in the marketplace catalog"""
    __tablename__ = 'marketplace_apps'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    long_description: Mapped[Optional[str]] = mapped_column(Text)
    icon_url: Mapped[Optional[str]] = mapped_column(String(500))
    screenshot_url: Mapped[Optional[str]] = mapped_column(String(500))
    docker_image: Mapped[str] = mapped_column(String(200))
    default_port: Mapped[int] = mapped_column(Integer)
    requires_database: Mapped[bool] = mapped_column(Boolean, default=False)
    db_type: Mapped[Optional[str]] = mapped_column(String(50))
    config_template: Mapped[dict] = mapped_column(JSON)
    env_template: Mapped[dict] = mapped_column(JSON)
    popularity: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationship to deployed apps
    deployments: Mapped[list["DeployedApp"]] = relationship("DeployedApp", back_populates="app", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<MarketplaceApp(slug='{self.slug}', name='{self.name}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'slug': self.slug,
            'name': self.name,
            'category': self.category,
            'description': self.description,
            'long_description': self.long_description,
            'icon_url': self.icon_url,
            'screenshot_url': self.screenshot_url,
            'docker_image': self.docker_image,
            'default_port': self.default_port,
            'requires_database': self.requires_database,
            'db_type': self.db_type,
            'config_template': self.config_template,
            'env_template': self.env_template,
            'popularity': self.popularity,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class DeployedApp(Base):
    """Represents a user-deployed app from marketplace"""
    __tablename__ = 'deployed_apps'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    app_id: Mapped[int] = mapped_column(Integer, ForeignKey('marketplace_apps.id', ondelete='CASCADE'), nullable=False, index=True)
    container_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(200))
    port: Mapped[int] = mapped_column(Integer)
    env_vars: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(50), default='deploying', index=True)
    health_status: Mapped[str] = mapped_column(String(50), default='unknown')
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    
    # Relationship to marketplace app
    app: Mapped["MarketplaceApp"] = relationship("MarketplaceApp", back_populates="deployments")
    
    def __repr__(self):
        return f"<DeployedApp(container_name='{self.container_name}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'app_id': self.app_id,
            'app_name': self.app.name if self.app else None,
            'app_slug': self.app.slug if self.app else None,
            'container_name': self.container_name,
            'domain': self.domain,
            'port': self.port,
            'status': self.status,
            'health_status': self.health_status,
            'deployed_at': self.deployed_at.isoformat() if self.deployed_at else None,
            'last_check': self.last_check.isoformat() if self.last_check else None,
            'error_message': self.error_message
        }
