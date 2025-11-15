from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from . import Base

class UserPreferences(Base):
    __tablename__ = 'user_preferences'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), unique=True, nullable=False, index=True)
    
    # Dashboard layout preferences
    dashboard_layout = Column(JSONB, default=dict)
    widget_visibility = Column(JSONB, default=dict)
    widget_order = Column(JSONB, default=list)
    active_preset = Column(String(50), default='default')
    
    # Navigation preferences
    collapsed_categories = Column(JSONB, default=list)
    pinned_pages = Column(JSONB, default=list)
    recent_pages = Column(JSONB, default=list)
    
    # Theme and display preferences
    theme = Column(String(20), default='dark')
    sidebar_collapsed = Column(Boolean, default=False)
    show_breadcrumbs = Column(Boolean, default=True)
    compact_mode = Column(Boolean, default=False)
    
    # Keyboard shortcuts
    custom_shortcuts = Column(JSONB, default=dict)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<UserPreferences(user_id={self.user_id}, theme={self.theme})>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'dashboard_layout': self.dashboard_layout or {},
            'widget_visibility': self.widget_visibility or {},
            'widget_order': self.widget_order or [],
            'active_preset': self.active_preset,
            'collapsed_categories': self.collapsed_categories or [],
            'pinned_pages': self.pinned_pages or [],
            'recent_pages': self.recent_pages or [],
            'theme': self.theme,
            'sidebar_collapsed': self.sidebar_collapsed,
            'show_breadcrumbs': self.show_breadcrumbs,
            'compact_mode': self.compact_mode,
            'custom_shortcuts': self.custom_shortcuts or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @staticmethod
    def get_default_preferences():
        """Return default preferences for new users"""
        return {
            'dashboard_layout': {
                'grid_columns': 'auto-fit',
                'card_size': 'medium'
            },
            'widget_visibility': {
                'cpu': True,
                'memory': True,
                'disk': True,
                'containers': True,
                'performance': True,
                'containerStatus': True,
                'recentActivity': True,
                'quickActions': True,
                'systemHealth': True,
                'networkStatus': True
            },
            'widget_order': [
                'cpu', 'memory', 'disk', 'containers',
                'performance', 'containerStatus', 
                'recentActivity', 'quickActions',
                'systemHealth', 'networkStatus'
            ],
            'active_preset': 'default',
            'collapsed_categories': [],
            'pinned_pages': ['/dashboard', '/containers', '/system'],
            'recent_pages': [],
            'theme': 'dark',
            'sidebar_collapsed': False,
            'show_breadcrumbs': True,
            'compact_mode': False,
            'custom_shortcuts': {
                'search': 'ctrl+k',
                'sidebar': 'ctrl+b',
                'dashboard': 'ctrl+1',
                'containers': 'ctrl+2',
                'system': 'ctrl+3'
            }
        }
    
    @staticmethod
    def get_preset(preset_name):
        """Get predefined layout presets"""
        presets = {
            'admin': {
                'widget_visibility': {
                    'cpu': True,
                    'memory': True,
                    'disk': True,
                    'containers': True,
                    'performance': False,
                    'containerStatus': True,
                    'recentActivity': True,
                    'quickActions': True,
                    'systemHealth': True,
                    'networkStatus': True
                },
                'widget_order': [
                    'systemHealth', 'containers', 'cpu', 'memory',
                    'disk', 'containerStatus', 'networkStatus',
                    'recentActivity', 'quickActions'
                ]
            },
            'developer': {
                'widget_visibility': {
                    'cpu': True,
                    'memory': True,
                    'disk': True,
                    'containers': True,
                    'performance': True,
                    'containerStatus': True,
                    'recentActivity': True,
                    'quickActions': True,
                    'systemHealth': False,
                    'networkStatus': False
                },
                'widget_order': [
                    'containers', 'performance', 'cpu', 'memory',
                    'containerStatus', 'recentActivity', 
                    'quickActions', 'disk'
                ]
            },
            'monitor': {
                'widget_visibility': {
                    'cpu': True,
                    'memory': True,
                    'disk': True,
                    'containers': True,
                    'performance': True,
                    'containerStatus': True,
                    'recentActivity': True,
                    'quickActions': False,
                    'systemHealth': True,
                    'networkStatus': True
                },
                'widget_order': [
                    'performance', 'cpu', 'memory', 'disk',
                    'systemHealth', 'networkStatus',
                    'containers', 'containerStatus', 'recentActivity'
                ]
            }
        }
        return presets.get(preset_name, {})
