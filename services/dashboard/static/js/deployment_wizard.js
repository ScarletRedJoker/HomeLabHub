const DeploymentWizard = {
    currentStep: 1,
    totalSteps: 6,
    
    selectedEnvironment: null,
    selectedTemplate: null,
    config: {},
    preflightPassed: false,
    taskId: null,
    
    environments: [],
    templates: [],
    categories: [],

    async init() {
        this.bindEvents();
        await this.loadEnvironments();
        await this.loadTemplates();
    },

    bindEvents() {
        document.getElementById('btn-next').addEventListener('click', () => this.nextStep());
        document.getElementById('btn-back').addEventListener('click', () => this.prevStep());
    },

    async loadEnvironments() {
        try {
            const response = await this.apiCall('/api/deployment/wizard/environments');
            if (response.success) {
                this.environments = response.data.environments;
                this.renderEnvironments();
            }
        } catch (error) {
            console.error('Failed to load environments:', error);
            document.getElementById('env-cards').innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--accent-red);">
                    <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
                    <p>Failed to load environments. Please refresh the page.</p>
                </div>
            `;
        }
    },

    renderEnvironments() {
        const container = document.getElementById('env-cards');
        container.innerHTML = this.environments.map(env => `
            <div class="env-card" data-env-id="${env.env_id}" onclick="DeploymentWizard.selectEnvironment('${env.env_id}')">
                <div class="env-card-header">
                    <div class="env-icon">
                        ${env.env_type === 'local' ? '🏠' : '☁️'}
                    </div>
                    <div>
                        <div class="env-name">${env.name}</div>
                        <div class="env-type">${env.env_type === 'local' ? 'On-Premise' : 'Cloud'}</div>
                    </div>
                </div>
                <div class="env-description">${env.description}</div>
                <div class="env-status">
                    <span class="status-dot ${env.health || 'unknown'}"></span>
                    <span>${this.getHealthLabel(env.health)}</span>
                    ${env.health_summary ? `
                        <span style="margin-left: auto; font-size: 0.8rem; color: var(--text-secondary);">
                            ${env.health_summary.passed || 0}/${env.health_summary.total || 0} checks passed
                        </span>
                    ` : ''}
                </div>
            </div>
        `).join('');
    },

    getHealthLabel(health) {
        const labels = {
            healthy: 'Healthy',
            degraded: 'Degraded',
            unhealthy: 'Unhealthy',
            unknown: 'Unknown'
        };
        return labels[health] || 'Unknown';
    },

    selectEnvironment(envId) {
        this.selectedEnvironment = this.environments.find(e => e.env_id === envId);
        
        document.querySelectorAll('.env-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`.env-card[data-env-id="${envId}"]`).classList.add('selected');
        
        this.updateNextButton();
    },

    async loadTemplates() {
        try {
            const response = await this.apiCall('/api/deployment/wizard/templates');
            if (response.success) {
                this.templates = response.data.templates;
                this.categories = response.data.categories;
                this.renderTemplateFilters();
                this.renderTemplates();
            }
        } catch (error) {
            console.error('Failed to load templates:', error);
        }
    },

    renderTemplateFilters() {
        const container = document.getElementById('template-filters');
        container.innerHTML = `
            <button class="filter-btn active" data-category="all" onclick="DeploymentWizard.filterTemplates('all')">All</button>
            ${this.categories.map(cat => `
                <button class="filter-btn" data-category="${cat}" onclick="DeploymentWizard.filterTemplates('${cat}')">${this.capitalizeFirst(cat)}</button>
            `).join('')}
        `;
    },

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    filterTemplates(category) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        
        this.renderTemplates(category);
    },

    renderTemplates(category = 'all') {
        const container = document.getElementById('templates-grid');
        const filtered = category === 'all' 
            ? this.templates 
            : this.templates.filter(t => t.category === category);
        
        container.innerHTML = filtered.map(template => `
            <div class="template-card ${this.selectedTemplate?.slug === template.slug ? 'selected' : ''}" 
                 data-slug="${template.slug}" 
                 onclick="DeploymentWizard.selectTemplate('${template.slug}')">
                <div class="template-header">
                    <img class="template-icon" src="${template.icon_url}" alt="${template.name}" onerror="this.src='https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/docker.svg'">
                    <div>
                        <div class="template-name">${template.name}</div>
                        <span class="template-category">${template.category}</span>
                    </div>
                </div>
                <div class="template-description">${template.description}</div>
            </div>
        `).join('');
    },

    selectTemplate(slug) {
        this.selectedTemplate = this.templates.find(t => t.slug === slug);
        
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`.template-card[data-slug="${slug}"]`).classList.add('selected');
        
        this.updateNextButton();
    },

    renderConfigForm() {
        if (!this.selectedTemplate) return;
        
        document.getElementById('config-template-name').textContent = this.selectedTemplate.name;
        
        const container = document.getElementById('config-form');
        const envTemplate = this.selectedTemplate.env_template || {};
        
        let html = `
            <div class="form-group">
                <label>Container Name</label>
                <input type="text" class="form-control" id="config-container-name" 
                       value="${this.selectedTemplate.slug}" placeholder="my-${this.selectedTemplate.slug}">
                <div class="hint">Unique name for this container instance</div>
            </div>
        `;
        
        for (const [key, spec] of Object.entries(envTemplate)) {
            const inputType = spec.type === 'password' ? 'password' : spec.type === 'number' ? 'number' : 'text';
            const value = this.config[key] || spec.default || '';
            const required = spec.required ? 'required' : '';
            
            html += `
                <div class="form-group">
                    <label>${spec.label || key}${spec.required ? ' *' : ''}</label>
                    <div class="input-group">
                        <input type="${inputType}" class="form-control config-input" 
                               id="config-${key}" data-key="${key}"
                               value="${value}" 
                               placeholder="${spec.placeholder || ''}"
                               ${required}>
                        ${spec.generate ? `
                            <button type="button" class="btn-generate" onclick="DeploymentWizard.generatePassword('${key}')">
                                <i class="bi bi-shuffle"></i> Generate
                            </button>
                        ` : ''}
                    </div>
                    ${spec.hint ? `<div class="hint">${spec.hint}</div>` : ''}
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        container.querySelectorAll('.config-input').forEach(input => {
            input.addEventListener('input', () => this.updateNextButton());
        });
    },

    async generatePassword(key) {
        try {
            const response = await this.apiCall('/api/deployment/wizard/generate-password', 'POST', { length: 24 });
            if (response.success) {
                const input = document.getElementById(`config-${key}`);
                input.value = response.data.password;
                input.type = 'text';
                this.updateNextButton();
            }
        } catch (error) {
            console.error('Failed to generate password:', error);
        }
    },

    collectConfig() {
        this.config = {};
        
        const containerName = document.getElementById('config-container-name');
        if (containerName) {
            this.config.container_name = containerName.value || this.selectedTemplate.slug;
        }
        
        document.querySelectorAll('.config-input').forEach(input => {
            const key = input.dataset.key;
            if (key) {
                this.config[key] = input.value;
            }
        });
        
        return this.config;
    },

    validateConfig() {
        if (!this.selectedTemplate) return false;
        
        const envTemplate = this.selectedTemplate.env_template || {};
        
        for (const [key, spec] of Object.entries(envTemplate)) {
            if (spec.required && !spec.generate) {
                const input = document.getElementById(`config-${key}`);
                if (input && !input.value.trim()) {
                    return false;
                }
            }
        }
        
        return true;
    },

    async runPreflightChecks() {
        const container = document.getElementById('preflight-results');
        container.innerHTML = `
            <div class="preflight-item">
                <div class="preflight-icon running">
                    <i class="bi bi-arrow-repeat"></i>
                </div>
                <div class="preflight-content">
                    <div class="preflight-name">Running preflight checks...</div>
                    <div class="preflight-message">Please wait while we verify deployment requirements</div>
                </div>
            </div>
        `;
        
        this.collectConfig();
        
        try {
            const response = await this.apiCall('/api/deployment/wizard/preflight', 'POST', {
                host_id: this.selectedEnvironment.env_id,
                template_slug: this.selectedTemplate.slug,
                config: this.config
            });
            
            if (response.success) {
                this.preflightPassed = response.data.ready;
                this.renderPreflightResults(response.data);
            } else {
                this.renderPreflightError(response.message);
            }
        } catch (error) {
            this.renderPreflightError(error.message);
        }
        
        this.updateNextButton();
    },

    renderPreflightResults(data) {
        const container = document.getElementById('preflight-results');
        
        container.innerHTML = data.checks.map(check => `
            <div class="preflight-item">
                <div class="preflight-icon ${check.status}">
                    <i class="bi ${check.icon || this.getCheckIcon(check.status)}"></i>
                </div>
                <div class="preflight-content">
                    <div class="preflight-name">${check.name}</div>
                    <div class="preflight-message">${check.message}</div>
                </div>
            </div>
        `).join('');
        
        const summary = data.summary;
        const summaryClass = data.ready ? 'var(--accent-green)' : 'var(--accent-red)';
        
        container.innerHTML += `
            <div style="margin-top: 1.5rem; padding: 1rem; background: rgba(255,255,255,0.03); border-radius: 10px; text-align: center;">
                <div style="font-size: 1.1rem; font-weight: 600; color: ${summaryClass};">
                    ${data.ready ? '✓ Ready to Deploy' : '✗ Issues Found'}
                </div>
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.5rem;">
                    ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed
                </div>
            </div>
        `;
    },

    getCheckIcon(status) {
        const icons = {
            passed: 'bi-check-circle-fill',
            warning: 'bi-exclamation-triangle-fill',
            failed: 'bi-x-circle-fill',
            running: 'bi-arrow-repeat'
        };
        return icons[status] || 'bi-question-circle';
    },

    renderPreflightError(message) {
        const container = document.getElementById('preflight-results');
        container.innerHTML = `
            <div class="preflight-item">
                <div class="preflight-icon failed">
                    <i class="bi bi-x-circle-fill"></i>
                </div>
                <div class="preflight-content">
                    <div class="preflight-name">Preflight Check Failed</div>
                    <div class="preflight-message">${message}</div>
                </div>
            </div>
        `;
        this.preflightPassed = false;
    },

    async startDeployment() {
        this.collectConfig();
        
        try {
            const response = await this.apiCall('/api/deployment/wizard/deploy', 'POST', {
                host_id: this.selectedEnvironment.env_id,
                template_slug: this.selectedTemplate.slug,
                container_name: this.config.container_name || this.selectedTemplate.slug,
                config: this.config
            });
            
            if (response.success) {
                this.taskId = response.data.task_id;
                this.pollDeploymentStatus();
            } else {
                this.showDeploymentError(response.message);
            }
        } catch (error) {
            this.showDeploymentError(error.message);
        }
    },

    async pollDeploymentStatus() {
        if (!this.taskId) return;
        
        try {
            const response = await this.apiCall(`/api/deployment/wizard/status/${this.taskId}`);
            
            if (response.success) {
                const deployment = response.data.deployment;
                this.updateDeploymentProgress(deployment);
                
                if (deployment.status === 'running' || deployment.status === 'starting') {
                    setTimeout(() => this.pollDeploymentStatus(), 2000);
                } else if (deployment.status === 'completed' || deployment.status === 'completed_with_warnings') {
                    this.showDeploymentComplete(deployment);
                } else if (deployment.status === 'failed') {
                    this.showDeploymentError(deployment.error || 'Deployment failed');
                }
            }
        } catch (error) {
            console.error('Failed to poll status:', error);
            setTimeout(() => this.pollDeploymentStatus(), 3000);
        }
    },

    updateDeploymentProgress(deployment) {
        const progress = (deployment.current_step / deployment.total_steps) * 100;
        document.getElementById('deploy-progress-bar').style.width = `${progress}%`;
        
        const currentStepInfo = deployment.steps[deployment.steps.length - 1];
        if (currentStepInfo) {
            document.getElementById('deploy-step-label').textContent = currentStepInfo.name;
        }
        
        const logsContainer = document.getElementById('deployment-logs');
        logsContainer.innerHTML = deployment.logs.map(log => `
            <div class="log-entry">
                <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="log-message ${log.level}">${log.message}</span>
            </div>
        `).join('');
        
        logsContainer.scrollTop = logsContainer.scrollHeight;
    },

    showDeploymentComplete(deployment) {
        this.goToStep(6);
        
        const isSuccess = deployment.status === 'completed';
        const result = deployment.result || {};
        
        document.getElementById('complete-content').innerHTML = `
            <div class="success-icon">${isSuccess ? '🎉' : '⚠️'}</div>
            <div class="success-title">${isSuccess ? 'Deployment Successful!' : 'Deployment Completed with Warnings'}</div>
            <div class="success-message">
                ${isSuccess 
                    ? `${this.selectedTemplate.name} has been deployed to ${this.selectedEnvironment.name}.`
                    : 'The deployment completed but some checks may have issues.'}
            </div>
            
            <div class="success-details">
                <div class="detail-row">
                    <span class="detail-label">Container Name</span>
                    <span class="detail-value">${result.container_name || this.config.container_name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Image</span>
                    <span class="detail-value">${result.image || this.selectedTemplate.docker_image}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Port</span>
                    <span class="detail-value">${result.port || this.config.PORT}</span>
                </div>
                ${result.access_url ? `
                    <div class="detail-row">
                        <span class="detail-label">Access URL</span>
                        <span class="detail-value">
                            <a href="${result.access_url}" target="_blank" style="color: var(--accent-blue);">${result.access_url}</a>
                        </span>
                    </div>
                ` : ''}
            </div>
            
            <div class="quick-actions">
                <a href="/marketplace" class="quick-action-btn secondary">
                    <i class="bi bi-grid"></i> Back to Marketplace
                </a>
                <button class="quick-action-btn primary" onclick="DeploymentWizard.deployAnother()">
                    <i class="bi bi-plus-circle"></i> Deploy Another
                </button>
            </div>
        `;
        
        document.getElementById('btn-next').style.display = 'none';
        document.getElementById('btn-back').style.display = 'none';
    },

    showDeploymentError(message) {
        const logsContainer = document.getElementById('deployment-logs');
        logsContainer.innerHTML += `
            <div class="log-entry">
                <span class="log-time">${new Date().toLocaleTimeString()}</span>
                <span class="log-message error">Error: ${message}</span>
            </div>
        `;
        
        document.getElementById('deploy-progress-bar').style.background = 'var(--accent-red)';
        document.getElementById('deploy-step-label').innerHTML = `
            <span style="color: var(--accent-red);">Deployment Failed</span>
            <button class="btn-generate" style="margin-left: 1rem;" onclick="DeploymentWizard.retryDeployment()">
                <i class="bi bi-arrow-clockwise"></i> Retry
            </button>
        `;
    },

    retryDeployment() {
        document.getElementById('deploy-progress-bar').style.width = '0%';
        document.getElementById('deploy-progress-bar').style.background = 'linear-gradient(90deg, #667eea, #764ba2)';
        document.getElementById('deployment-logs').innerHTML = '';
        this.startDeployment();
    },

    deployAnother() {
        this.currentStep = 1;
        this.selectedEnvironment = null;
        this.selectedTemplate = null;
        this.config = {};
        this.preflightPassed = false;
        this.taskId = null;
        
        document.getElementById('btn-next').style.display = '';
        document.getElementById('btn-back').style.display = '';
        
        this.updateStepUI();
        this.renderEnvironments();
        this.renderTemplates();
    },

    nextStep() {
        if (this.currentStep === 3) {
            this.collectConfig();
        }
        
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            this.updateStepUI();
            
            if (this.currentStep === 3) {
                this.renderConfigForm();
            } else if (this.currentStep === 4) {
                this.runPreflightChecks();
            } else if (this.currentStep === 5) {
                this.startDeployment();
            }
        }
    },

    prevStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updateStepUI();
        }
    },

    goToStep(step) {
        this.currentStep = step;
        this.updateStepUI();
    },

    updateStepUI() {
        document.querySelectorAll('.progress-step').forEach(stepEl => {
            const step = parseInt(stepEl.dataset.step);
            stepEl.classList.remove('active', 'completed');
            
            if (step < this.currentStep) {
                stepEl.classList.add('completed');
            } else if (step === this.currentStep) {
                stepEl.classList.add('active');
            }
        });
        
        document.querySelectorAll('.step-content').forEach(content => {
            const step = parseInt(content.dataset.step);
            content.classList.toggle('active', step === this.currentStep);
        });
        
        document.getElementById('btn-back').style.visibility = this.currentStep > 1 ? 'visible' : 'hidden';
        
        this.updateNextButton();
    },

    updateNextButton() {
        const btn = document.getElementById('btn-next');
        let enabled = false;
        let text = 'Next <i class="bi bi-arrow-right"></i>';
        
        switch (this.currentStep) {
            case 1:
                enabled = this.selectedEnvironment !== null;
                break;
            case 2:
                enabled = this.selectedTemplate !== null;
                break;
            case 3:
                enabled = this.validateConfig();
                text = 'Run Preflight Checks <i class="bi bi-arrow-right"></i>';
                break;
            case 4:
                enabled = this.preflightPassed;
                text = 'Deploy <i class="bi bi-rocket-takeoff"></i>';
                break;
            case 5:
                enabled = false;
                text = '<span class="loading-spinner"></span> Deploying...';
                break;
            case 6:
                enabled = false;
                break;
        }
        
        btn.disabled = !enabled;
        btn.innerHTML = text;
    },

    async apiCall(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]')?.content || ''
            }
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, options);
        return await response.json();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DeploymentWizard.init();
});
