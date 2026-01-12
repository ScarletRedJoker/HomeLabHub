#!/usr/bin/env python3
"""
Example demonstrating the Jarvis Workflow Engine

This example shows how to:
1. Create a workflow in the database
2. Dispatch a Celery task
3. Monitor workflow progress via WebSocket
4. Handle workflow completion

Prerequisites:
- Redis must be running
- Celery worker must be running
- Dashboard app must be running
- Database must be initialized
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from services.workflow_service import workflow_service
from workers.workflow_worker import run_deployment_workflow
from services.db_service import db_service
import time

def example_deployment_workflow():
    """Example: Create and run a deployment workflow"""
    
    print("=" * 60)
    print("Jarvis Workflow Engine - Deployment Example")
    print("=" * 60)
    
    if not db_service.is_available:
        print("❌ Database service not available")
        print("   Set JARVIS_DATABASE_URL environment variable")
        return
    
    print("\n✓ Database service is available")
    
    print("\n1. Creating workflow in database...")
    workflow = workflow_service.create_workflow(
        name="Deploy Discord Bot",
        workflow_type="deployment",
        created_by="admin",
        metadata={
            "service": "discord-bot",
            "image": "discord-bot:latest",
            "environment": "production"
        }
    )
    print(f"   ✓ Created workflow: {workflow.id}")
    print(f"   Status: {workflow.status.value}")
    
    print("\n2. Dispatching Celery task...")
    deployment_config = {
        'service_name': 'discord-bot',
        'image': 'discord-bot:latest',
        'environment': {
            'NODE_ENV': 'production'
        },
        'volumes': []
    }
    
    task = run_deployment_workflow.delay(
        workflow_id=str(workflow.id),
        deployment_config=deployment_config
    )
    print(f"   ✓ Task dispatched: {task.id}")
    print(f"   Task state: {task.state}")
    
    print("\n3. Monitoring task progress...")
    print("   (In production, use WebSocket to get real-time updates)")
    
    timeout = 30
    start_time = time.time()
    
    while not task.ready():
        if time.time() - start_time > timeout:
            print(f"   ⚠ Timeout waiting for task completion")
            break
        
        workflow_status = workflow_service.get_workflow_status(str(workflow.id))
        if workflow_status:
            current = workflow_status.get('current_step', 0)
            total = workflow_status.get('total_steps', 0)
            message = workflow_status.get('metadata', {}).get('last_message', '')
            
            if current and total:
                print(f"   Progress: {current}/{total} - {message}")
        
        time.sleep(1)
    
    if task.successful():
        result = task.result
        print(f"\n✓ Task completed successfully!")
        print(f"   Result: {result}")
        
        final_workflow = workflow_service.get_workflow_status(str(workflow.id))
        print(f"\n   Final workflow status: {final_workflow.get('status')}")
        
    elif task.failed():
        print(f"\n❌ Task failed!")
        print(f"   Error: {task.info}")
        
        final_workflow = workflow_service.get_workflow_status(str(workflow.id))
        print(f"   Error message: {final_workflow.get('error_message')}")
    
    print("\n" + "=" * 60)

def example_dns_workflow():
    """Example: Create and run a DNS update workflow"""
    
    print("\n" + "=" * 60)
    print("Jarvis Workflow Engine - DNS Update Example")
    print("=" * 60)
    
    from workers.workflow_worker import run_dns_update_workflow
    
    print("\n1. Creating DNS update workflow...")
    workflow = workflow_service.create_workflow(
        name="Update DNS for bot.evindrake.net",
        workflow_type="dns_update",
        created_by="admin",
        metadata={
            "domain": "bot.evindrake.net",
            "record_type": "A",
            "new_value": "192.168.1.100"
        }
    )
    print(f"   ✓ Created workflow: {workflow.id}")
    
    print("\n2. Dispatching DNS update task...")
    dns_config = {
        'domain': 'bot.evindrake.net',
        'record_type': 'A',
        'value': '192.168.1.100'
    }
    
    task = run_dns_update_workflow.delay(
        workflow_id=str(workflow.id),
        dns_config=dns_config
    )
    print(f"   ✓ Task dispatched: {task.id}")
    
    print("\n3. Waiting for completion...")
    task.wait(timeout=30)
    
    if task.successful():
        print(f"   ✓ DNS update completed!")
        print(f"   Result: {task.result}")
    
    print("\n" + "=" * 60)

def example_artifact_analysis():
    """Example: Create and run an artifact analysis workflow"""
    
    print("\n" + "=" * 60)
    print("Jarvis Workflow Engine - Artifact Analysis Example")
    print("=" * 60)
    
    from workers.workflow_worker import run_artifact_analysis_workflow
    
    print("\n1. Creating artifact analysis workflow...")
    workflow = workflow_service.create_workflow(
        name="Security Scan: discord-bot:latest",
        workflow_type="artifact_analysis",
        created_by="admin",
        metadata={
            "artifact_type": "docker_image",
            "analysis_type": "security"
        }
    )
    print(f"   ✓ Created workflow: {workflow.id}")
    
    print("\n2. Dispatching analysis task...")
    artifact_config = {
        'artifact_path': '/artifacts/discord-bot-latest.tar',
        'analysis_type': 'security'
    }
    
    task = run_artifact_analysis_workflow.delay(
        workflow_id=str(workflow.id),
        artifact_config=artifact_config
    )
    print(f"   ✓ Task dispatched: {task.id}")
    
    print("\n3. Waiting for completion...")
    task.wait(timeout=30)
    
    if task.successful():
        result = task.result
        print(f"   ✓ Analysis completed!")
        print(f"   Vulnerabilities: {result.get('findings', {}).get('vulnerabilities', 0)}")
        print(f"   Warnings: {result.get('findings', {}).get('warnings', 0)}")
        print(f"   Info: {result.get('findings', {}).get('info', 0)}")
    
    print("\n" + "=" * 60)

def list_workflows_example():
    """Example: List recent workflows"""
    
    print("\n" + "=" * 60)
    print("Jarvis Workflow Engine - List Workflows")
    print("=" * 60)
    
    workflows = workflow_service.list_workflows(limit=10)
    
    print(f"\nFound {len(workflows)} recent workflows:")
    for wf in workflows:
        print(f"\n  ID: {wf['id']}")
        print(f"  Name: {wf['name']}")
        print(f"  Type: {wf['workflow_type']}")
        print(f"  Status: {wf['status']}")
        print(f"  Created: {wf['started_at']}")
    
    print("\n" + "=" * 60)

if __name__ == '__main__':
    print("\n")
    print("╔═══════════════════════════════════════════════════════╗")
    print("║     Jarvis Workflow Engine - Example Usage           ║")
    print("╚═══════════════════════════════════════════════════════╝")
    print("\n")
    
    try:
        # Run deployment workflow example
        example_deployment_workflow()
        
        # Uncomment to run other examples:
        # example_dns_workflow()
        # example_artifact_analysis()
        # list_workflows_example()
        
    except KeyboardInterrupt:
        print("\n\n⚠ Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n✓ Example completed\n")
