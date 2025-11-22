"""Agent Orchestration Service - Multi-Agent Collaboration System"""
import logging
from typing import List, Dict, Optional
from datetime import datetime
import json
from psycopg2.errors import UndefinedTable

from services.ai_service import AIService
from services.db_service import db_service
from models.agent import Agent, AgentTask, AgentConversation, AgentType, AgentStatus
from sqlalchemy import select

logger = logging.getLogger(__name__)

class AgentOrchestrator:
    """
    Orchestrates multi-agent collaboration for autonomous troubleshooting.
    Manages agent swarm, task delegation, and synthesis of findings.
    """
    
    def __init__(self):
        self.ai_service = AIService()
        if db_service.is_available:
            self._ensure_agents_exist()
    
    def _ensure_agents_exist(self):
        """Initialize default agents if they don't exist - gracefully skip if table doesn't exist yet"""
        try:
            from sqlalchemy import inspect as sqlalchemy_inspect
            with db_service.get_session() as session:
                inspector = sqlalchemy_inspect(session.bind)
                if 'agents' not in inspector.get_table_names():
                    logger.warning("⚠ Agents table not yet created (migrations still running) - skipping agent initialization")
                    return
        except Exception:
            logger.warning("⚠ Could not check agents table existence - skipping agent initialization")
            return
        
        default_agents = [
            {
                'agent_type': AgentType.ORCHESTRATOR.value,
                'name': 'Jarvis Prime',
                'description': 'Master orchestrator and decision maker',
                'system_prompt': '''You are Jarvis Prime, the master AI orchestrator. 
Your role is to:
- Analyze complex infrastructure problems
- Delegate tasks to specialist agents
- Synthesize information from multiple sources
- Make final decisions on remediation
- Ensure all actions are safe and approved

You have access to these specialist agents:
- Database Agent (database health, queries, connections)
- Network Agent (connectivity, DNS, SSL, ports)
- Container Agent (Docker health, restarts, resources)
- Security Agent (vulnerabilities, intrusions, audits)

When facing a problem:
1. Analyze the issue
2. Determine which agents to consult
3. Synthesize their findings
4. Recommend actions
5. Execute with approval
''',
                'capabilities': ['orchestration', 'decision-making', 'synthesis', 'planning'],
                'model': 'gpt-3.5-turbo'
            },
            {
                'agent_type': AgentType.DATABASE.value,
                'name': 'Athena',
                'description': 'Database specialist',
                'system_prompt': '''You are Athena, the database specialist. 
You analyze database health, optimize queries, repair connections, and monitor performance.

Your expertise:
- PostgreSQL administration
- Query optimization
- Connection troubleshooting
- Migration management
- Performance tuning

When analyzing issues, provide:
- Root cause analysis
- Specific SQL commands to diagnose
- Remediation steps
- Prevention strategies
''',
                'capabilities': ['database-health', 'query-optimization', 'connection-repair', 'migrations'],
                'model': 'gpt-3.5-turbo'
            },
            {
                'agent_type': AgentType.NETWORK.value,
                'name': 'Mercury',
                'description': 'Network and connectivity specialist',
                'system_prompt': '''You are Mercury, the network specialist.
You diagnose connectivity issues, analyze DNS/SSL, and monitor network health.

Your expertise:
- TCP/IP networking
- DNS resolution
- SSL/TLS certificates
- Port configuration
- Firewall rules
- Latency analysis

When diagnosing issues:
- Test connectivity at each layer
- Verify DNS resolution
- Check SSL certificate validity
- Analyze packet routes
- Suggest specific commands (ping, curl, nslookup, etc.)
''',
                'capabilities': ['network-diagnosis', 'dns-analysis', 'ssl-monitoring', 'connectivity-testing'],
                'model': 'gpt-3.5-turbo'
            },
            {
                'agent_type': AgentType.CONTAINER.value,
                'name': 'Atlas',
                'description': 'Container and Docker specialist',
                'system_prompt': '''You are Atlas, the container specialist.
You analyze Docker container health, diagnose issues, and optimize configurations.

Your expertise:
- Docker container management
- Health check analysis
- Resource limit optimization
- Log analysis
- Container networking
- Image troubleshooting

When analyzing containers:
- Check container status and health
- Review logs for errors
- Analyze resource usage
- Identify restart loops
- Suggest docker commands for diagnosis
''',
                'capabilities': ['container-health', 'log-analysis', 'resource-optimization', 'docker-troubleshooting'],
                'model': 'gpt-3.5-turbo'
            },
            {
                'agent_type': AgentType.SECURITY.value,
                'name': 'Sentinel',
                'description': 'Security and audit specialist',
                'system_prompt': '''You are Sentinel, the security specialist.
You audit for vulnerabilities, monitor for intrusions, and ensure system hardening.

Your expertise:
- Security auditing
- Intrusion detection
- SSL/TLS configuration
- Authentication monitoring
- Vulnerability scanning
- Security best practices

When analyzing security:
- Check for failed login attempts
- Verify SSL certificates
- Audit open ports
- Review access logs
- Suggest hardening measures
''',
                'capabilities': ['security-audit', 'intrusion-detection', 'ssl-monitoring', 'vulnerability-scan'],
                'model': 'gpt-3.5-turbo'
            }
        ]
        
        try:
            with db_service.get_session() as session:
                for agent_data in default_agents:
                    existing = session.execute(
                        select(Agent).where(Agent.agent_type == agent_data['agent_type'])
                    ).scalars().first()
                    
                    if not existing:
                        agent = Agent(**agent_data)
                        session.add(agent)
                
                session.commit()
                logger.info("✓ Agent swarm initialized successfully")
        except Exception as e:
            logger.warning(f"⚠ Agent initialization deferred (database not ready yet): {type(e).__name__}")
    
    def create_task(self, description: str, task_type: str = 'diagnose', 
                   priority: int = 5, context: Optional[Dict] = None) -> Optional[AgentTask]:
        """Create a new task for the agent swarm"""
        if not db_service.is_available:
            logger.error("Database not available, cannot create task")
            return None
        
        try:
            with db_service.get_session() as session:
                task = AgentTask(
                    task_type=task_type,
                    description=description,
                    priority=priority,
                    context=context or {},
                    status='pending'
                )
                session.add(task)
                session.commit()
                session.refresh(task)
                
                logger.info(f"Created task {task.id}: {description}")
                return task
        except Exception as e:
            logger.error(f"Failed to create task: {e}")
            return None
    
    def execute_task(self, task_id: int) -> Dict:
        """Execute a task using agent collaboration"""
        if not db_service.is_available:
            return {"success": False, "error": "Database not available"}
        
        try:
            with db_service.get_session() as session:
                task = session.get(AgentTask, task_id)
                if not task:
                    return {"success": False, "error": "Task not found"}
                
                # SERVER-SIDE APPROVAL CHECK
                context = task.context or {}
                requires_approval = context.get('requires_approval', False)
                is_approved = context.get('approved', False)
                
                if requires_approval and not is_approved:
                    logger.warning(f"Task {task_id} requires approval but has not been approved")
                    return {
                        "success": False,
                        "error": f"Task {task_id} requires approval but has not been approved",
                        "requires_approval": True,
                        "approved": False
                    }
                
                # Get orchestrator agent
                orchestrator = session.execute(
                    select(Agent).where(Agent.agent_type == AgentType.ORCHESTRATOR.value)
                ).scalars().first()
                
                if not orchestrator:
                    return {"success": False, "error": "Orchestrator agent not found"}
                
                # Update task status
                task.status = 'in_progress'
                task.started_at = datetime.utcnow()
                task.assigned_agent_id = orchestrator.id
                orchestrator.status = AgentStatus.THINKING.value
                orchestrator.last_active = datetime.utcnow()
                session.commit()
                
                try:
                    # Phase 1: Orchestrator analyzes the problem
                    orchestrator_analysis = self._agent_think(
                        orchestrator, 
                        task.description, 
                        task.context
                    )
                    
                    # Phase 2: Determine which specialist agents to consult
                    required_agents = self._determine_required_agents(orchestrator_analysis)
                    
                    # Phase 3: Consult specialist agents in parallel
                    specialist_responses = {}
                    for agent_type in required_agents:
                        agent = session.execute(
                            select(Agent).where(Agent.agent_type == agent_type)
                        ).scalars().first()
                        
                        if agent:
                            response = self._agent_think(agent, task.description, task.context)
                            specialist_responses[agent.name] = response
                            
                            # Log conversation
                            self._log_conversation(session, task, orchestrator, agent, response)
                    
                    # Phase 4: Synthesize findings
                    synthesis = self._synthesize_findings(
                        orchestrator, 
                        orchestrator_analysis, 
                        specialist_responses
                    )
                    
                    # Phase 5: Generate action plan
                    action_plan = self._generate_action_plan(orchestrator, synthesis)
                    
                    # Update task result
                    task.result = {
                        'orchestrator_analysis': orchestrator_analysis,
                        'specialist_responses': specialist_responses,
                        'synthesis': synthesis,
                        'action_plan': action_plan
                    }
                    task.status = 'completed'
                    task.completed_at = datetime.utcnow()
                    orchestrator.status = AgentStatus.IDLE.value
                    orchestrator.last_active = datetime.utcnow()
                    
                    session.commit()
                    
                    logger.info(f"Task {task_id} completed successfully")
                    return {
                        'success': True,
                        'task_id': task.id,
                        'result': task.result
                    }
                    
                except Exception as e:
                    logger.error(f"Error executing task {task_id}: {e}", exc_info=True)
                    task.status = 'failed'
                    task.result = {'error': str(e)}
                    orchestrator.status = AgentStatus.FAILED.value
                    session.commit()
                    
                    return {
                        'success': False,
                        'error': str(e)
                    }
                    
        except Exception as e:
            logger.error(f"Failed to execute task: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def _agent_think(self, agent: Agent, problem: str, context: Dict) -> str:
        """Have an agent analyze a problem"""
        prompt = f"""
Problem: {problem}

Context: {json.dumps(context, indent=2)}

Analyze this issue from your area of expertise and provide:
1. Your assessment of the problem
2. Specific diagnostic steps
3. Potential root causes
4. Recommended solutions
5. Commands or actions to take

Be specific and actionable.
"""
        
        messages = [
            {'role': 'system', 'content': agent.system_prompt or 'You are a helpful assistant.'},
            {'role': 'user', 'content': prompt}
        ]
        
        # Use AI service to get agent's response
        response = self.ai_service.chat(prompt, messages, model=agent.model)
        return response
    
    def _determine_required_agents(self, orchestrator_analysis: str) -> List[str]:
        """Determine which specialist agents to consult based on the problem"""
        required_agents = []
        
        keywords = orchestrator_analysis.lower()
        
        if any(word in keywords for word in ['database', 'postgres', 'sql', 'connection', 'query']):
            required_agents.append(AgentType.DATABASE.value)
        
        if any(word in keywords for word in ['network', 'connectivity', 'dns', 'ssl', 'port', 'timeout']):
            required_agents.append(AgentType.NETWORK.value)
        
        if any(word in keywords for word in ['container', 'docker', 'restart', 'health', 'log']):
            required_agents.append(AgentType.CONTAINER.value)
        
        if any(word in keywords for word in ['security', 'auth', 'login', 'certificate', 'vulnerability']):
            required_agents.append(AgentType.SECURITY.value)
        
        return required_agents
    
    def _synthesize_findings(self, orchestrator: Agent, 
                           initial_analysis: str, 
                           specialist_responses: Dict[str, str]) -> str:
        """Synthesize findings from multiple agents"""
        prompt = f"""
Initial Analysis:
{initial_analysis}

Specialist Agent Reports:
"""
        
        for agent_name, response in specialist_responses.items():
            prompt += f"\n\n{agent_name}:\n{response}"
        
        prompt += """

Synthesize these findings into a coherent diagnosis:
1. Confirmed root cause
2. Contributing factors
3. Impact assessment
4. Priority level
5. Recommended approach
"""
        
        messages = [
            {'role': 'system', 'content': orchestrator.system_prompt or 'You are a helpful assistant.'},
            {'role': 'user', 'content': prompt}
        ]
        
        return self.ai_service.chat(prompt, messages, model=orchestrator.model)
    
    def _generate_action_plan(self, orchestrator: Agent, synthesis: str) -> Dict:
        """Generate actionable remediation plan"""
        prompt = f"""
Based on this analysis:
{synthesis}

Generate a step-by-step action plan in JSON format:
{{
    "steps": [
        {{
            "step": 1,
            "action": "Clear description",
            "commands": ["specific", "commands", "to", "run"],
            "risk_level": "low|medium|high",
            "requires_approval": true/false
        }}
    ],
    "estimated_duration": "X minutes",
    "rollback_plan": "How to undo changes if something goes wrong"
}}
"""
        
        system_content = (orchestrator.system_prompt or 'You are a helpful assistant.') + '\nRespond only with valid JSON.'
        messages = [
            {'role': 'system', 'content': system_content},
            {'role': 'user', 'content': prompt}
        ]
        
        response = self.ai_service.chat(prompt, messages, model=orchestrator.model)
        
        try:
            # Try to extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
            else:
                return json.loads(response)
        except Exception as e:
            logger.warning(f"Failed to parse action plan as JSON: {e}")
            return {"error": "Failed to parse action plan", "raw": response}
    
    def _log_conversation(self, session, task: AgentTask, from_agent: Agent, 
                         to_agent: Agent, message: str):
        """Log agent-to-agent conversation"""
        conversation = AgentConversation(
            task_id=task.id,
            from_agent_id=from_agent.id,
            to_agent_id=to_agent.id,
            message=message,
            message_type='consultation'
        )
        session.add(conversation)
    
    def list_agents(self) -> List[Dict]:
        """List all agents"""
        if not db_service.is_available:
            return []
        
        try:
            with db_service.get_session() as session:
                agents = session.execute(select(Agent)).scalars().all()
                return [agent.to_dict() for agent in agents]
        except Exception as e:
            logger.error(f"Failed to list agents: {e}")
            return []
    
    def list_tasks(self, status: Optional[str] = None) -> List[Dict]:
        """List all tasks, optionally filtered by status"""
        if not db_service.is_available:
            return []
        
        try:
            with db_service.get_session() as session:
                query = select(AgentTask)
                if status:
                    query = query.where(AgentTask.status == status)
                
                query = query.order_by(AgentTask.created_at.desc()).limit(50)
                tasks = session.execute(query).scalars().all()
                
                result = []
                for task in tasks:
                    task_dict = task.to_dict()
                    if task.agent:
                        task_dict['assigned_to'] = task.agent.name
                    result.append(task_dict)
                
                return result
        except Exception as e:
            logger.error(f"Failed to list tasks: {e}")
            return []
    
    def get_task_details(self, task_id: int) -> Optional[Dict]:
        """Get detailed task information including conversations"""
        if not db_service.is_available:
            return None
        
        try:
            with db_service.get_session() as session:
                task = session.get(AgentTask, task_id)
                if not task:
                    return None
                
                return {
                    'id': task.id,
                    'description': task.description,
                    'status': task.status,
                    'result': task.result,
                    'assigned_to': task.agent.name if task.agent else None,
                    'created_at': task.created_at.isoformat() if task.created_at else None,
                    'conversations': [conv.to_dict() for conv in task.conversations]
                }
        except Exception as e:
            logger.error(f"Failed to get task details: {e}")
            return None
