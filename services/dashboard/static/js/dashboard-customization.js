class DashboardCustomization {
    constructor() {
        this.preferences = null;
        this.draggedElement = null;
        this.init();
    }

    async init() {
        await this.loadPreferences();
        this.setupEventListeners();
        this.applyPreferences();
        this.initDragAndDrop();
        this.initKeyboardShortcuts();
    }

    async loadPreferences() {
        try {
            const response = await fetch('/api/preferences');
            const data = await response.json();
            if (data.success) {
                this.preferences = data.preferences;
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    async savePreferences(updates) {
        try {
            const response = await fetch('/api/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updates)
            });
            const data = await response.json();
            if (data.success) {
                this.preferences = data.preferences;
                this.showNotification('Preferences saved successfully', 'success');
                return true;
            }
        } catch (error) {
            console.error('Error saving preferences:', error);
            this.showNotification('Failed to save preferences', 'error');
            return false;
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.widget-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                this.toggleWidget(e.target.dataset.widgetId, e.target.checked);
            });
        });

        document.querySelectorAll('.preset-button').forEach(button => {
            button.addEventListener('click', (e) => {
                this.applyPreset(e.target.dataset.preset);
            });
        });

        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', (e) => {
                this.toggleCategory(e.currentTarget.dataset.category);
            });
        });

        const customizationToggle = document.getElementById('customization-toggle');
        if (customizationToggle) {
            customizationToggle.addEventListener('click', () => {
                this.toggleCustomizationPanel();
            });
        }

        const closePanel = document.getElementById('close-customization-panel');
        if (closePanel) {
            closePanel.addEventListener('click', () => {
                this.toggleCustomizationPanel();
            });
        }
    }

    applyPreferences() {
        if (!this.preferences) return;

        const widgetVisibility = this.preferences.widget_visibility || {};
        const widgetOrder = this.preferences.widget_order || [];

        Object.keys(widgetVisibility).forEach(widgetId => {
            const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widget) {
                widget.style.display = widgetVisibility[widgetId] ? '' : 'none';
            }

            const toggle = document.querySelector(`input[data-widget-id="${widgetId}"]`);
            if (toggle) {
                toggle.checked = widgetVisibility[widgetId];
            }
        });

        const collapsedCategories = this.preferences.collapsed_categories || [];
        collapsedCategories.forEach(categoryId => {
            const category = document.querySelector(`[data-category="${categoryId}"]`);
            if (category) {
                const content = category.nextElementSibling;
                if (content && content.classList.contains('category-content')) {
                    content.classList.add('collapsed');
                    category.classList.add('collapsed');
                }
            }
        });

        if (widgetOrder.length > 0) {
            this.reorderWidgets(widgetOrder);
        }
    }

    async toggleWidget(widgetId, isVisible) {
        const widgetVisibility = { ...this.preferences.widget_visibility };
        widgetVisibility[widgetId] = isVisible;

        const saved = await this.savePreferences({ widget_visibility: widgetVisibility });
        
        if (saved) {
            const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widget) {
                widget.style.display = isVisible ? '' : 'none';
            }
        }
    }

    async applyPreset(presetName) {
        try {
            const response = await fetch(`/api/preferences/preset/${presetName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            if (data.success) {
                this.preferences = data.preferences;
                this.applyPreferences();
                this.showNotification(`${presetName} preset applied successfully`, 'success');
            }
        } catch (error) {
            console.error('Error applying preset:', error);
            this.showNotification('Failed to apply preset', 'error');
        }
    }

    async toggleCategory(categoryId) {
        try {
            const response = await fetch(`/api/preferences/category/${categoryId}/toggle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            if (data.success) {
                const category = document.querySelector(`[data-category="${categoryId}"]`);
                if (category) {
                    const content = category.nextElementSibling;
                    if (content && content.classList.contains('category-content')) {
                        content.classList.toggle('collapsed');
                        category.classList.toggle('collapsed');
                    }
                }
            }
        } catch (error) {
            console.error('Error toggling category:', error);
        }
    }

    initDragAndDrop() {
        const widgets = document.querySelectorAll('.widget[data-widget-id]');
        widgets.forEach(widget => {
            widget.setAttribute('draggable', 'true');
            widget.addEventListener('dragstart', this.handleDragStart.bind(this));
            widget.addEventListener('dragover', this.handleDragOver.bind(this));
            widget.addEventListener('drop', this.handleDrop.bind(this));
            widget.addEventListener('dragend', this.handleDragEnd.bind(this));
        });
    }

    handleDragStart(e) {
        this.draggedElement = e.target.closest('.widget');
        e.dataTransfer.effectAllowed = 'move';
        this.draggedElement.classList.add('dragging');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const target = e.target.closest('.widget');
        if (target && target !== this.draggedElement) {
            target.classList.add('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const target = e.target.closest('.widget');
        
        if (target && target !== this.draggedElement) {
            const container = target.parentNode;
            const draggedIndex = Array.from(container.children).indexOf(this.draggedElement);
            const targetIndex = Array.from(container.children).indexOf(target);
            
            if (draggedIndex < targetIndex) {
                target.after(this.draggedElement);
            } else {
                target.before(this.draggedElement);
            }
            
            this.saveWidgetOrder();
        }
        
        target?.classList.remove('drag-over');
    }

    handleDragEnd(e) {
        e.target.closest('.widget')?.classList.remove('dragging');
        document.querySelectorAll('.widget').forEach(w => w.classList.remove('drag-over'));
    }

    async saveWidgetOrder() {
        const container = document.querySelector('.dashboard-grid');
        const widgets = container?.querySelectorAll('.widget[data-widget-id]');
        const order = Array.from(widgets || []).map(w => w.dataset.widgetId);
        
        await this.savePreferences({ widget_order: order });
    }

    reorderWidgets(order) {
        const container = document.querySelector('.dashboard-grid');
        if (!container) return;
        
        order.forEach(widgetId => {
            const widget = container.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widget) {
                container.appendChild(widget);
            }
        });
    }

    toggleCustomizationPanel() {
        const panel = document.getElementById('customization-panel');
        if (panel) {
            panel.classList.toggle('active');
        }
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 'k':
                        e.preventDefault();
                        this.openCommandPalette();
                        break;
                    case 'b':
                        e.preventDefault();
                        this.toggleSidebar();
                        break;
                    case '1':
                        e.preventDefault();
                        window.location.href = '/dashboard';
                        break;
                    case '2':
                        e.preventDefault();
                        window.location.href = '/containers';
                        break;
                    case '3':
                        e.preventDefault();
                        window.location.href = '/system';
                        break;
                    case '/':
                        e.preventDefault();
                        this.toggleCustomizationPanel();
                        break;
                }
            }
        });
    }

    openCommandPalette() {
        const palette = document.getElementById('command-palette');
        if (palette) {
            palette.classList.add('active');
            const searchInput = palette.querySelector('input');
            if (searchInput) {
                searchInput.focus();
            }
        }
    }

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.dashboardCustomization = new DashboardCustomization();
    });
} else {
    window.dashboardCustomization = new DashboardCustomization();
}
