import pytest
import asyncio
import httpx
from unittest.mock import Mock, patch, AsyncMock
from flask import Flask
from datetime import datetime, timedelta


class TestDashboardE2EFlows:
    """Comprehensive E2E tests for Dashboard critical user flows"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        from app import create_app
        app = create_app()
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        
        with app.test_client() as client:
            with app.app_context():
                yield client
    
    @pytest.fixture
    def authenticated_client(self, client):
        """Create authenticated test client"""
        with client.session_transaction() as sess:
            sess['user_id'] = 'test_user_123'
            sess['username'] = 'test_admin'
            sess['logged_in'] = True
        return client
    
    @pytest.fixture
    def mock_docker_client(self):
        """Mock Docker client"""
        with patch('docker.from_env') as mock:
            docker_mock = Mock()
            mock.return_value = docker_mock
            yield docker_mock
    
    def test_e2e_flow_1_docker_management(self, authenticated_client, mock_docker_client):
        """
        E2E Flow 1: Login → Docker Management → Container Start/Stop → Logs
        
        Tests the complete flow of:
        1. User authentication
        2. Viewing container list
        3. Starting a container
        4. Stopping a container
        5. Viewing container logs
        """
        # Step 1: Verify authentication
        dashboard_response = authenticated_client.get('/')
        assert dashboard_response.status_code == 200
        
        # Step 2: Get container list
        mock_container = Mock()
        mock_container.id = 'test_container_123'
        mock_container.name = 'test-nginx'
        mock_container.status = 'running'
        mock_container.image.tags = ['nginx:latest']
        mock_container.attrs = {
            'State': {
                'Status': 'running',
                'StartedAt': '2025-01-01T00:00:00Z',
                'FinishedAt': '0001-01-01T00:00:00Z'
            },
            'Config': {
                'Image': 'nginx:latest'
            },
            'NetworkSettings': {
                'Ports': {
                    '80/tcp': [{'HostPort': '8080'}]
                }
            }
        }
        
        mock_docker_client.containers.list.return_value = [mock_container]
        
        containers_response = authenticated_client.get('/api/containers')
        assert containers_response.status_code == 200
        containers = containers_response.json
        assert isinstance(containers, list)
        assert len(containers) > 0
        assert containers[0]['name'] == 'test-nginx'
        assert containers[0]['status'] == 'running'
        
        # Step 3: Stop container
        mock_container.stop = Mock()
        mock_docker_client.containers.get.return_value = mock_container
        
        stop_response = authenticated_client.post(
            '/api/containers/test_container_123/stop'
        )
        assert stop_response.status_code == 200
        assert stop_response.json['success'] is True
        mock_container.stop.assert_called_once()
        
        # Step 4: Start container
        mock_container.start = Mock()
        mock_container.status = 'exited'
        
        start_response = authenticated_client.post(
            '/api/containers/test_container_123/start'
        )
        assert start_response.status_code == 200
        assert start_response.json['success'] is True
        mock_container.start.assert_called_once()
        
        # Step 5: Get container logs
        mock_container.logs.return_value = b'2025-01-01 00:00:00 [info] Server started\n2025-01-01 00:01:00 [info] Request received\n'
        
        logs_response = authenticated_client.get(
            '/api/containers/test_container_123/logs?lines=100'
        )
        assert logs_response.status_code == 200
        logs = logs_response.json
        assert 'logs' in logs
        assert 'Server started' in logs['logs']
        
        # Step 6: Restart container
        mock_container.restart = Mock()
        
        restart_response = authenticated_client.post(
            '/api/containers/test_container_123/restart'
        )
        assert restart_response.status_code == 200
        assert restart_response.json['success'] is True
        mock_container.restart.assert_called_once()
    
    def test_e2e_flow_2_jarvis_command_execution(self, authenticated_client):
        """
        E2E Flow 2: Jarvis Command → Approval → Execution → Audit Log
        
        Tests the complete Jarvis AI assistant flow:
        1. Submit command request
        2. Review command for approval
        3. Approve command
        4. Execute command
        5. View audit log
        """
        # Step 1: Submit Jarvis command
        command_data = {
            'command': 'deploy nginx service',
            'context': 'Deploy a new nginx web server',
            'priority': 'medium'
        }
        
        with patch('services.ai_service.AIService.analyze_command') as mock_analyze:
            mock_analyze.return_value = {
                'command': 'docker run -d -p 80:80 nginx:latest',
                'risk_level': 'low',
                'requires_approval': True,
                'estimated_impact': 'Creates new nginx container on port 80',
                'safety_checks': ['Port 80 is available', 'Image exists in registry']
            }
            
            submit_response = authenticated_client.post(
                '/api/jarvis/command',
                json=command_data
            )
            
            assert submit_response.status_code == 201
            command_result = submit_response.json
            assert 'id' in command_result
            assert command_result['status'] == 'pending_approval'
            assert command_result['risk_level'] == 'low'
            command_id = command_result['id']
        
        # Step 2: Review pending commands
        pending_response = authenticated_client.get('/api/jarvis/pending')
        assert pending_response.status_code == 200
        pending_commands = pending_response.json
        assert isinstance(pending_commands, list)
        assert len(pending_commands) > 0
        assert any(cmd['id'] == command_id for cmd in pending_commands)
        
        # Step 3: Approve command
        approval_data = {
            'approved': True,
            'notes': 'Approved for deployment'
        }
        
        approve_response = authenticated_client.post(
            f'/api/jarvis/command/{command_id}/approve',
            json=approval_data
        )
        
        assert approve_response.status_code == 200
        assert approve_response.json['status'] == 'approved'
        
        # Step 4: Execute approved command
        with patch('services.ai_service.AIService.execute_command') as mock_execute:
            mock_execute.return_value = {
                'success': True,
                'output': 'Container nginx_1 started successfully',
                'container_id': 'abc123',
                'exit_code': 0
            }
            
            execute_response = authenticated_client.post(
                f'/api/jarvis/command/{command_id}/execute'
            )
            
            assert execute_response.status_code == 200
            exec_result = execute_response.json
            assert exec_result['success'] is True
            assert 'output' in exec_result
            assert 'started successfully' in exec_result['output']
        
        # Step 5: View audit log
        audit_response = authenticated_client.get(
            f'/api/jarvis/command/{command_id}/audit'
        )
        
        assert audit_response.status_code == 200
        audit_log = audit_response.json
        assert 'events' in audit_log
        assert len(audit_log['events']) >= 3  # submitted, approved, executed
        
        # Verify all major events are logged
        event_types = [event['type'] for event in audit_log['events']]
        assert 'submitted' in event_types
        assert 'approved' in event_types
        assert 'executed' in event_types
        
        # Step 6: View all commands history
        history_response = authenticated_client.get('/api/jarvis/history?limit=50')
        assert history_response.status_code == 200
        history = history_response.json
        assert isinstance(history, list)
        assert any(cmd['id'] == command_id for cmd in history)
    
    @pytest.mark.asyncio
    async def test_e2e_flow_3_google_calendar_integration(self, authenticated_client):
        """
        E2E Flow 3: Google Calendar Access → Event Retrieval → Display
        
        Tests the complete Google Calendar integration:
        1. Authenticate with Google
        2. Fetch calendar events
        3. Display events
        4. Create new event
        5. Update event
        """
        # Step 1: Mock Google OAuth
        with patch('services.google.google_client.GoogleClient.get_credentials') as mock_creds:
            mock_creds.return_value = Mock(valid=True, expired=False)
            
            auth_response = authenticated_client.get('/api/google/auth/status')
            assert auth_response.status_code == 200
            assert auth_response.json['authenticated'] is True
        
        # Step 2: Fetch calendar events
        mock_events = [
            {
                'id': 'event_1',
                'summary': 'Team Meeting',
                'start': {'dateTime': '2025-11-16T10:00:00Z'},
                'end': {'dateTime': '2025-11-16T11:00:00Z'},
                'description': 'Weekly team sync',
                'location': 'Conference Room A'
            },
            {
                'id': 'event_2',
                'summary': 'Project Review',
                'start': {'dateTime': '2025-11-16T14:00:00Z'},
                'end': {'dateTime': '2025-11-16T15:00:00Z'},
                'description': 'Q4 project review',
                'attendees': [
                    {'email': 'team@example.com', 'responseStatus': 'accepted'}
                ]
            }
        ]
        
        with patch('services.google.calendar_service.CalendarService.list_events') as mock_list:
            mock_list.return_value = mock_events
            
            events_response = authenticated_client.get(
                '/api/google/calendar/events?timeMin=2025-11-16&timeMax=2025-11-17'
            )
            
            assert events_response.status_code == 200
            events = events_response.json
            assert isinstance(events, list)
            assert len(events) == 2
            assert events[0]['summary'] == 'Team Meeting'
            assert events[1]['summary'] == 'Project Review'
        
        # Step 3: Display events on dashboard
        dashboard_response = authenticated_client.get('/google-services')
        assert dashboard_response.status_code == 200
        assert b'Team Meeting' in dashboard_response.data or b'Google Calendar' in dashboard_response.data
        
        # Step 4: Create new event
        new_event_data = {
            'summary': 'E2E Test Event',
            'start': '2025-11-20T15:00:00Z',
            'end': '2025-11-20T16:00:00Z',
            'description': 'Testing calendar integration',
            'attendees': ['test@example.com']
        }
        
        with patch('services.google.calendar_service.CalendarService.create_event') as mock_create:
            mock_create.return_value = {
                'id': 'new_event_123',
                **new_event_data
            }
            
            create_response = authenticated_client.post(
                '/api/google/calendar/events',
                json=new_event_data
            )
            
            assert create_response.status_code == 201
            created_event = create_response.json
            assert created_event['summary'] == 'E2E Test Event'
            assert 'id' in created_event
        
        # Step 5: Update event
        update_data = {
            'summary': 'Updated E2E Test Event',
            'description': 'Updated description'
        }
        
        with patch('services.google.calendar_service.CalendarService.update_event') as mock_update:
            mock_update.return_value = {
                'id': 'new_event_123',
                'summary': 'Updated E2E Test Event',
                'description': 'Updated description',
                'start': {'dateTime': '2025-11-20T15:00:00Z'},
                'end': {'dateTime': '2025-11-20T16:00:00Z'}
            }
            
            update_response = authenticated_client.patch(
                '/api/google/calendar/events/new_event_123',
                json=update_data
            )
            
            assert update_response.status_code == 200
            updated_event = update_response.json
            assert updated_event['summary'] == 'Updated E2E Test Event'
        
        # Step 6: Delete event
        with patch('services.google.calendar_service.CalendarService.delete_event') as mock_delete:
            mock_delete.return_value = {'success': True}
            
            delete_response = authenticated_client.delete(
                '/api/google/calendar/events/new_event_123'
            )
            
            assert delete_response.status_code == 200
            assert delete_response.json['success'] is True
    
    def test_e2e_flow_4_home_assistant_device_control(self, authenticated_client):
        """
        E2E Flow 4: Home Assistant → Device Control → Status Update
        
        Tests the complete Home Assistant integration:
        1. Connect to Home Assistant
        2. List devices
        3. Control device (turn on/off)
        4. Get device status
        5. Update device state
        """
        # Step 1: Mock Home Assistant connection
        with patch('services.home_assistant_service.HomeAssistantService.connect') as mock_connect:
            mock_connect.return_value = {'connected': True, 'version': '2024.1.0'}
            
            connect_response = authenticated_client.post(
                '/api/smart-home/connect',
                json={
                    'url': 'http://homeassistant.local:8123',
                    'token': 'test_ha_token'
                }
            )
            
            assert connect_response.status_code == 200
            assert connect_response.json['connected'] is True
        
        # Step 2: List all devices
        mock_devices = [
            {
                'entity_id': 'light.living_room',
                'friendly_name': 'Living Room Light',
                'state': 'on',
                'attributes': {
                    'brightness': 255,
                    'color_temp': 370,
                    'supported_features': 43
                }
            },
            {
                'entity_id': 'switch.bedroom_fan',
                'friendly_name': 'Bedroom Fan',
                'state': 'off',
                'attributes': {}
            },
            {
                'entity_id': 'climate.thermostat',
                'friendly_name': 'Thermostat',
                'state': 'heat',
                'attributes': {
                    'temperature': 72,
                    'current_temperature': 70,
                    'hvac_mode': 'heat'
                }
            }
        ]
        
        with patch('services.home_assistant_service.HomeAssistantService.get_states') as mock_states:
            mock_states.return_value = mock_devices
            
            devices_response = authenticated_client.get('/api/smart-home/devices')
            
            assert devices_response.status_code == 200
            devices = devices_response.json
            assert isinstance(devices, list)
            assert len(devices) == 3
            assert devices[0]['entity_id'] == 'light.living_room'
            assert devices[0]['state'] == 'on'
        
        # Step 3: Turn off living room light
        with patch('services.home_assistant_service.HomeAssistantService.call_service') as mock_service:
            mock_service.return_value = {'success': True}
            
            turn_off_response = authenticated_client.post(
                '/api/smart-home/device/light.living_room/turn_off'
            )
            
            assert turn_off_response.status_code == 200
            assert turn_off_response.json['success'] is True
            mock_service.assert_called_once_with(
                'light', 'turn_off', entity_id='light.living_room'
            )
        
        # Step 4: Turn on bedroom fan
        with patch('services.home_assistant_service.HomeAssistantService.call_service') as mock_service:
            mock_service.return_value = {'success': True}
            
            turn_on_response = authenticated_client.post(
                '/api/smart-home/device/switch.bedroom_fan/turn_on'
            )
            
            assert turn_on_response.status_code == 200
            assert turn_on_response.json['success'] is True
        
        # Step 5: Set thermostat temperature
        with patch('services.home_assistant_service.HomeAssistantService.call_service') as mock_service:
            mock_service.return_value = {'success': True}
            
            set_temp_response = authenticated_client.post(
                '/api/smart-home/device/climate.thermostat/set_temperature',
                json={'temperature': 74}
            )
            
            assert set_temp_response.status_code == 200
            assert set_temp_response.json['success'] is True
            mock_service.assert_called_once_with(
                'climate', 'set_temperature',
                entity_id='climate.thermostat',
                temperature=74
            )
        
        # Step 6: Get device status update
        with patch('services.home_assistant_service.HomeAssistantService.get_state') as mock_state:
            mock_state.return_value = {
                'entity_id': 'light.living_room',
                'state': 'off',
                'attributes': {
                    'brightness': 0,
                    'last_changed': '2025-11-15T12:00:00Z'
                }
            }
            
            status_response = authenticated_client.get(
                '/api/smart-home/device/light.living_room/status'
            )
            
            assert status_response.status_code == 200
            status = status_response.json
            assert status['state'] == 'off'
            assert status['attributes']['brightness'] == 0
        
        # Step 7: Control multiple devices at once
        with patch('services.home_assistant_service.HomeAssistantService.call_service') as mock_service:
            mock_service.return_value = {'success': True}
            
            bulk_control_response = authenticated_client.post(
                '/api/smart-home/devices/bulk-control',
                json={
                    'action': 'turn_off',
                    'entity_ids': ['light.living_room', 'switch.bedroom_fan']
                }
            )
            
            assert bulk_control_response.status_code == 200
            assert bulk_control_response.json['success'] is True
            assert bulk_control_response.json['affected_devices'] == 2
    
    def test_e2e_flow_5_network_monitoring_and_diagnostics(self, authenticated_client):
        """
        E2E Flow 5: Network Monitoring → Port Scanning → Service Health
        
        Tests network monitoring capabilities:
        1. Get system network status
        2. Scan open ports
        3. Check service health
        4. DNS resolution tests
        """
        # Step 1: Get network status
        with patch('services.network_service.NetworkService.get_interfaces') as mock_interfaces:
            mock_interfaces.return_value = [
                {
                    'name': 'eth0',
                    'ip': '192.168.1.100',
                    'netmask': '255.255.255.0',
                    'status': 'up',
                    'bytes_sent': 1024000,
                    'bytes_recv': 2048000
                }
            ]
            
            network_response = authenticated_client.get('/api/network/status')
            
            assert network_response.status_code == 200
            network_status = network_response.json
            assert 'interfaces' in network_status
            assert len(network_status['interfaces']) > 0
        
        # Step 2: Scan open ports
        with patch('services.network_service.NetworkService.scan_ports') as mock_scan:
            mock_scan.return_value = [
                {'port': 22, 'service': 'ssh', 'status': 'open'},
                {'port': 80, 'service': 'http', 'status': 'open'},
                {'port': 443, 'service': 'https', 'status': 'open'},
                {'port': 5000, 'service': 'flask', 'status': 'open'}
            ]
            
            scan_response = authenticated_client.post(
                '/api/network/scan-ports',
                json={'target': 'localhost', 'ports': '22,80,443,5000'}
            )
            
            assert scan_response.status_code == 200
            scan_results = scan_response.json
            assert 'ports' in scan_results
            assert len(scan_results['ports']) == 4
        
        # Step 3: Check service health
        with patch('services.network_service.NetworkService.check_service_health') as mock_health:
            mock_health.return_value = {
                'services': [
                    {'name': 'nginx', 'status': 'healthy', 'uptime': '3d 5h 22m'},
                    {'name': 'postgres', 'status': 'healthy', 'uptime': '5d 12h 45m'},
                    {'name': 'redis', 'status': 'healthy', 'uptime': '2d 8h 15m'}
                ]
            }
            
            health_response = authenticated_client.get('/api/network/service-health')
            
            assert health_response.status_code == 200
            health = health_response.json
            assert 'services' in health
            assert all(s['status'] == 'healthy' for s in health['services'])


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--cov=services', '--cov=routes'])
