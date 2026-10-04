"""
Custom exceptions for AI processing errors.

Defines a common base exception to safely propagate AI failures
throughout the application without swallowing them or confusing
them with programming errors.
"""

class AIParsingError(Exception):
    """
    Exception raised when the AI processing encounters a known failure condition.

    Attributes:
        error_type: The categorized type of error (e.g., ai_transient, ai_configuration).
        message: A safe error message to expose to the caller.
    """

    def __init__(self, error_type: str, message: str):
        super().__init__(message)
        self.error_type = error_type
        self.message = message
