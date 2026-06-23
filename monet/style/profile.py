# monet/style/profile.py
from pydantic import BaseModel

class StyleProfile(BaseModel):
    summary: str
