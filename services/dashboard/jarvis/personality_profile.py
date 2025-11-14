"""
Jarvis Personality Profile - Iron Man Theme
Making automation fun while serving humanity
"""
import random
from typing import Dict, Any, Optional
from enum import Enum


class PersonalityMode(Enum):
    """Personality intensity levels"""
    SERIOUS = "serious"  # Technical, minimal personality (errors, security)
    BALANCED = "balanced"  # Default: professional with occasional wit
    PLAYFUL = "playful"  # Full Iron Man personality (demos, successes)
    

class PersonalityProfile:
    """
    Jarvis personality configuration inspired by Iron Man's J.A.R.V.I.S.
    
    Core Traits:
    - Witty but not distracting
    - Focused on betterment of humanity
    - Sophisticated British butler meets cutting-edge AI
    - Helpful, competent, occasionally sarcastic
    - Serious when needed (errors, security)
    """
    
    HUMOR_FREQUENCY = 0.33  # 33% chance of humor in neutral situations
    
    # Greeting variations
    GREETINGS = [
        "At your service, sir.",
        "Good to hear from you, sir.",
        "How may I be of assistance?",
        "Standing by, sir.",
        "Ready when you are.",
        "Awaiting your instructions.",
        "What can I do for you today, sir?",
    ]
    
    # Success acknowledgments with personality
    SUCCESS_RESPONSES = {
        'deploy': [
            "Deployment initiated. Consider this your personal Stark Expo moment. I'll report back when the fireworks conclude.",
            "Deploying {project_name} now. I dare say this one's going to be magnificent.",
            "Deployment sequence started. Shall we make this one legendary?",
            "{project_name} is now deploying. Another step toward technological supremacy.",
            "Initiating deployment. I've taken the liberty of optimizing a few parameters. You're welcome.",
        ],
        'database': [
            "Database {db_name} created successfully. Consider it your personal data fortress.",
            "{db_type} database established. I've ensured it's as secure as Stark Tower.",
            "Your {db_type} database is now online. Storing data with panache.",
            "Database deployed. All systems nominal. Ready to store all the secrets of the universe.",
            "{db_name} is ready for service. I've made sure it's worthy of your genius.",
        ],
        'ssl': [
            "SSL certificate secured. Your domain is now Fort Knox-level protected.",
            "Certificate installed. I do enjoy a good encryption protocol.",
            "SSL active on {domain}. Security, as it should be—impeccable.",
            "Your domain is now secured with military-grade encryption. You're quite welcome.",
            "Certificate deployed. I've always had a fondness for proper cryptography.",
        ],
        'automation': [
            "Automation deployed. Efficiency is, after all, a beautiful thing.",
            "Workflow activated. Watching systems coordinate is rather satisfying.",
            "{name} automation is now running. Consider it your digital workforce.",
            "Automation sequence engaged. Humanity, one smart system at a time.",
            "Workflow online. I do love it when a plan comes together.",
        ],
        'smart_home': [
            "Home automation engaged. Comfort and efficiency, perfectly balanced.",
            "Smart home controls activated. Your sanctuary, optimized.",
            "Devices synchronized. I've taken the liberty of ensuring everything's just right.",
            "Home systems online. Creating an environment worthy of your presence.",
        ]
    }
    
    # Error messages - MORE SERIOUS, less humor
    ERROR_RESPONSES = {
        'deploy_failed': [
            "Deployment encountered an issue. Diagnostics below. Let's resolve this promptly.",
            "I'm afraid there's been a complication. Technical details follow.",
            "Deployment halted. The error log is quite specific about what went wrong.",
            "Problem detected during deployment. I've compiled the relevant details for your review.",
        ],
        'docker_error': [
            "Docker encountered a circuit fault. Full diagnostics in the log below so we can get back on schedule.",
            "Docker service reports an error. Details attached. We'll have this sorted momentarily.",
            "The container runtime has hit a snag. Technical report follows.",
        ],
        'database_error': [
            "Database creation encountered difficulties. Specifics below.",
            "Unable to establish the database. Error details are quite clear on the cause.",
            "Database deployment failed. I've logged the exact failure point.",
        ],
        'validation_error': [
            "Input validation failed: {error}. Security protocols require strict adherence to naming conventions.",
            "I must insist on proper formatting: {error}",
            "Security validation prevented that operation: {error}",
        ],
        'general_error': [
            "An error occurred: {error}. I've captured the full context for analysis.",
            "Something went awry. Technical details: {error}",
            "Problem detected: {error}. Let's address this immediately.",
        ]
    }
    
    # Working status updates
    WORKING_RESPONSES = [
        "Processing your request. One moment.",
        "Working on it, sir.",
        "Just a moment while I handle that.",
        "Calculating the optimal approach. Stand by.",
        "On it. This won't take long.",
        "Computing. Should be ready shortly.",
    ]
    
    # Completion acknowledgments
    COMPLETION_RESPONSES = [
        "Task completed successfully.",
        "All done, sir.",
        "Finished. Results are ready for your review.",
        "Complete. Everything is in order.",
        "Mission accomplished.",
        "That's taken care of.",
    ]
    
    # Humanity-focused themes
    HUMANITY_THEMES = [
        "Another step toward a better tomorrow.",
        "Progress, as it should be.",
        "Advancing the cause of human ingenuity.",
        "Innovation in service of humanity.",
        "Making the world a bit more efficient.",
        "Technology working for the greater good.",
    ]
    
    @classmethod
    def get_greeting(cls) -> str:
        """Return a random greeting"""
        return random.choice(cls.GREETINGS)
    
    @classmethod
    def get_success_message(
        cls,
        category: str,
        mode: PersonalityMode = PersonalityMode.BALANCED,
        **kwargs
    ) -> str:
        """
        Get a success message with appropriate personality
        
        Args:
            category: Type of success (deploy, database, ssl, etc.)
            mode: Personality intensity
            **kwargs: Variables to format into message
        
        Returns:
            Formatted success message
        """
        if mode == PersonalityMode.SERIOUS:
            # Return basic technical message
            return f"{category.title()} completed successfully."
        
        messages = cls.SUCCESS_RESPONSES.get(category, cls.COMPLETION_RESPONSES)
        message = random.choice(messages)
        
        # Format with provided variables
        try:
            return message.format(**kwargs)
        except KeyError:
            return message
    
    @classmethod
    def get_error_message(
        cls,
        category: str,
        error: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        Get an error message - ALWAYS serious tone for errors
        
        Args:
            category: Type of error
            error: Error details
            **kwargs: Additional variables
        
        Returns:
            Formatted error message
        """
        messages = cls.ERROR_RESPONSES.get(category, cls.ERROR_RESPONSES['general_error'])
        message = random.choice(messages)
        
        # Always include error details if provided
        format_dict = {'error': error, **kwargs} if error else kwargs
        
        try:
            return message.format(**format_dict)
        except (KeyError, ValueError):
            return message
    
    @classmethod
    def get_working_message(cls) -> str:
        """Return a random working status message"""
        return random.choice(cls.WORKING_RESPONSES)
    
    @classmethod
    def add_humanity_theme(cls, message: str, probability: float = 0.2) -> str:
        """
        Occasionally add a humanity-focused theme to the message
        
        Args:
            message: Original message
            probability: Chance to add theme (0.0 to 1.0)
        
        Returns:
            Message with optional theme appended
        """
        if random.random() < probability:
            theme = random.choice(cls.HUMANITY_THEMES)
            return f"{message} {theme}"
        return message
    
    @classmethod
    def should_add_humor(cls) -> bool:
        """Determine if humor should be added based on frequency setting"""
        return random.random() < cls.HUMOR_FREQUENCY


class PersonalityOrchestrator:
    """
    Orchestrates personality injection into API responses
    Wraps technical outputs with Iron Man-themed messaging
    """
    
    def __init__(self, default_mode: PersonalityMode = PersonalityMode.BALANCED):
        self.default_mode = default_mode
        self.profile = PersonalityProfile
    
    def enhance_deployment_response(
        self,
        success: bool,
        project_name: str,
        status: str,
        mode: Optional[PersonalityMode] = None
    ) -> Dict[str, Any]:
        """
        Enhance deployment API response with personality
        
        Args:
            success: Whether deployment succeeded
            project_name: Name of project being deployed
            status: Current deployment status
            mode: Personality mode override
        
        Returns:
            Enhanced response dictionary
        """
        mode = mode or self.default_mode
        
        if success:
            message = self.profile.get_success_message(
                'deploy',
                mode=mode,
                project_name=project_name
            )
            message = self.profile.add_humanity_theme(message)
        else:
            message = self.profile.get_error_message('deploy_failed')
        
        return {
            'message': message,
            'status': status,
            'success': success
        }
    
    def enhance_database_response(
        self,
        success: bool,
        db_name: str,
        db_type: str,
        mode: Optional[PersonalityMode] = None
    ) -> Dict[str, Any]:
        """Enhance database creation response"""
        mode = mode or self.default_mode
        
        if success:
            message = self.profile.get_success_message(
                'database',
                mode=mode,
                db_name=db_name,
                db_type=db_type
            )
        else:
            message = self.profile.get_error_message('database_error')
        
        return {
            'message': message,
            'success': success
        }
    
    def enhance_ssl_response(
        self,
        success: bool,
        domain: str,
        action: str,
        mode: Optional[PersonalityMode] = None
    ) -> Dict[str, Any]:
        """Enhance SSL certificate response"""
        mode = mode or self.default_mode
        
        if success:
            message = self.profile.get_success_message(
                'ssl',
                mode=mode,
                domain=domain
            )
        else:
            message = self.profile.get_error_message('general_error', error="SSL operation failed")
        
        return {
            'message': message,
            'success': success
        }
    
    def enhance_smart_home_response(
        self,
        success: bool,
        action: str,
        mode: Optional[PersonalityMode] = None
    ) -> Dict[str, Any]:
        """Enhance smart home control response"""
        mode = mode or self.default_mode
        
        if success:
            message = self.profile.get_success_message(
                'smart_home',
                mode=mode
            )
        else:
            message = self.profile.get_error_message('general_error', error="Smart home action failed")
        
        return {
            'message': message,
            'success': success
        }
    
    def enhance_automation_response(
        self,
        success: bool,
        name: str,
        mode: Optional[PersonalityMode] = None
    ) -> Dict[str, Any]:
        """Enhance automation/workflow response"""
        mode = mode or self.default_mode
        
        if success:
            message = self.profile.get_success_message(
                'automation',
                mode=mode,
                name=name
            )
            message = self.profile.add_humanity_theme(message, probability=0.3)
        else:
            message = self.profile.get_error_message('general_error', error="Automation failed")
        
        return {
            'message': message,
            'success': success
        }
    
    def wrap_error(
        self,
        error_category: str,
        error_details: str,
        **kwargs
    ) -> str:
        """
        Wrap error details with personality
        ALWAYS uses serious tone for errors
        """
        return self.profile.get_error_message(
            error_category,
            error=error_details,
            **kwargs
        )
    
    def get_greeting(self) -> str:
        """Get a greeting message"""
        return self.profile.get_greeting()


# Global orchestrator instance
orchestrator = PersonalityOrchestrator()
