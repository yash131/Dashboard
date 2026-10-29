from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    author: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=1000)


class CommentResponse(BaseModel):
    author: str
    message: str
    created_at: datetime
