"""Google Calendar Service for event management and automation triggers"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from googleapiclient.errors import HttpError
from .google_client import google_client_manager

logger = logging.getLogger(__name__)


class CalendarService:
    """Google Calendar integration for event management"""
    
    def __init__(self):
        """Initialize Calendar Service"""
        self.client_manager = google_client_manager
    
    def list_calendars(self) -> List[Dict[str, Any]]:
        """
        List all calendars accessible to the user
        
        Returns:
            List of calendar dictionaries
        """
        try:
            client = self.client_manager.get_calendar_client()
            calendar_list = client.calendarList().list().execute()
            
            calendars = []
            for calendar_item in calendar_list.get('items', []):
                calendars.append({
                    'id': calendar_item.get('id'),
                    'summary': calendar_item.get('summary'),
                    'description': calendar_item.get('description'),
                    'timezone': calendar_item.get('timeZone'),
                    'primary': calendar_item.get('primary', False),
                    'backgroundColor': calendar_item.get('backgroundColor'),
                    'foregroundColor': calendar_item.get('foregroundColor')
                })
            
            logger.info(f"Retrieved {len(calendars)} calendars")
            return calendars
        
        except HttpError as e:
            logger.error(f"Error listing calendars: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error listing calendars: {e}", exc_info=True)
            raise
    
    def list_events(
        self,
        calendar_id: str = 'primary',
        time_min: Optional[datetime] = None,
        time_max: Optional[datetime] = None,
        max_results: int = 100,
        query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List calendar events with optional filtering
        
        Args:
            calendar_id: Calendar ID (default: 'primary')
            time_min: Start time for event filtering
            time_max: End time for event filtering
            max_results: Maximum number of events to return
            query: Free text search query
            
        Returns:
            List of event dictionaries
        """
        try:
            client = self.client_manager.get_calendar_client()
            
            # Build parameters
            params = {
                'calendarId': calendar_id,
                'maxResults': max_results,
                'singleEvents': True,
                'orderBy': 'startTime'
            }
            
            if time_min:
                params['timeMin'] = time_min.isoformat() + 'Z'
            else:
                params['timeMin'] = datetime.utcnow().isoformat() + 'Z'
            
            if time_max:
                params['timeMax'] = time_max.isoformat() + 'Z'
            
            if query:
                params['q'] = query
            
            events_result = client.events().list(**params).execute()
            events = events_result.get('items', [])
            
            formatted_events = []
            for event in events:
                start = event.get('start', {})
                end = event.get('end', {})
                
                formatted_events.append({
                    'id': event.get('id'),
                    'summary': event.get('summary'),
                    'description': event.get('description'),
                    'location': event.get('location'),
                    'start': start.get('dateTime') or start.get('date'),
                    'end': end.get('dateTime') or end.get('date'),
                    'status': event.get('status'),
                    'htmlLink': event.get('htmlLink'),
                    'created': event.get('created'),
                    'updated': event.get('updated'),
                    'creator': event.get('creator', {}).get('email'),
                    'attendees': [a.get('email') for a in event.get('attendees', [])]
                })
            
            logger.info(f"Retrieved {len(formatted_events)} events from calendar {calendar_id}")
            return formatted_events
        
        except HttpError as e:
            logger.error(f"Error listing events: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error listing events: {e}", exc_info=True)
            raise
    
    def get_upcoming_automation_events(
        self,
        automation_keywords: List[str],
        lead_time_minutes: int = 30,
        calendar_id: str = 'primary'
    ) -> List[Dict[str, Any]]:
        """
        Get upcoming events that should trigger automations
        
        Args:
            automation_keywords: List of keywords to match in event summaries
            lead_time_minutes: How many minutes ahead to look for events
            calendar_id: Calendar ID to search
            
        Returns:
            List of events matching automation criteria
        """
        try:
            time_min = datetime.utcnow()
            time_max = time_min + timedelta(minutes=lead_time_minutes)
            
            all_events = self.list_events(
                calendar_id=calendar_id,
                time_min=time_min,
                time_max=time_max,
                max_results=50
            )
            
            matching_events = []
            for event in all_events:
                summary = event.get('summary', '').lower()
                description = event.get('description', '').lower()
                
                for keyword in automation_keywords:
                    if keyword.lower() in summary or keyword.lower() in description:
                        matching_events.append(event)
                        break
            
            logger.info(f"Found {len(matching_events)} automation events in next {lead_time_minutes} minutes")
            return matching_events
        
        except Exception as e:
            logger.error(f"Error getting automation events: {e}", exc_info=True)
            return []
    
    def create_event(
        self,
        summary: str,
        start_time: datetime,
        end_time: datetime,
        calendar_id: str = 'primary',
        description: Optional[str] = None,
        location: Optional[str] = None,
        attendees: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create a new calendar event
        
        Args:
            summary: Event title
            start_time: Event start time
            end_time: Event end time
            calendar_id: Calendar ID
            description: Event description
            location: Event location
            attendees: List of attendee emails
            
        Returns:
            Created event dictionary
        """
        try:
            client = self.client_manager.get_calendar_client()
            
            event = {
                'summary': summary,
                'description': description,
                'location': location,
                'start': {
                    'dateTime': start_time.isoformat(),
                    'timeZone': 'UTC'
                },
                'end': {
                    'dateTime': end_time.isoformat(),
                    'timeZone': 'UTC'
                }
            }
            
            if attendees:
                event['attendees'] = [{'email': email} for email in attendees]
            
            created_event = client.events().insert(
                calendarId=calendar_id,
                body=event
            ).execute()
            
            logger.info(f"Created event: {created_event.get('id')}")
            return created_event
        
        except HttpError as e:
            logger.error(f"Error creating event: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error creating event: {e}", exc_info=True)
            raise
    
    def delete_event(self, event_id: str, calendar_id: str = 'primary') -> bool:
        """
        Delete a calendar event
        
        Args:
            event_id: Event ID to delete
            calendar_id: Calendar ID
            
        Returns:
            True if successful
        """
        try:
            client = self.client_manager.get_calendar_client()
            client.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
            
            logger.info(f"Deleted event: {event_id}")
            return True
        
        except HttpError as e:
            logger.error(f"Error deleting event: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error deleting event: {e}", exc_info=True)
            return False


# Initialize global calendar service
calendar_service = CalendarService()
