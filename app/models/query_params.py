# app/models/query_params.py

# Pydantic V2 model for query params validation
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from datetime import datetime

class MetricsQueryParams(BaseModel):
    """
    Pydantic model for validating GET query parameters for the /api/metrics endpoint.
    """
    customer: Optional[str] = None
    supplier: Optional[str] = None
    destination: Optional[str] = None

    time_from: datetime = Field(..., alias='from')
    time_to: datetime = Field(..., alias='to')

    reverse: bool = False
    granularity: str = "both"  # allowed: '5m' | '1h' | 'both'

    # cross-field validation
    @model_validator(mode='after')
    def check_dates(self) -> 'MetricsQueryParams':
        """
        Ensures that 'time_to' is not earlier than 'time_from'.
        """
        if self.time_from and self.time_to and self.time_to <= self.time_from:
            raise ValueError('Validation Error: "to" date must be after "from" date')
        return self

    @model_validator(mode='after')
    def normalize_and_validate_granularity(self) -> 'MetricsQueryParams':
        """Validate and normalize granularity to one of allowed values."""
        if hasattr(self, 'granularity') and isinstance(self.granularity, str):
            g = self.granularity.lower().strip()
            if g not in {"5m", "1h", "both"}:
                raise ValueError("Validation Error: 'granularity' must be one of '5m', '1h', 'both'")
            self.granularity = g
        else:
            self.granularity = "both"
        return self

    # Pydantic V2 config
    class Config:
        # This allows the model to be populated from object attributes as well as dictionaries.
        from_attributes = True