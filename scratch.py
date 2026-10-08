import os
from dotenv import load_dotenv
load_dotenv()
from google import genai
from pydantic import BaseModel, Field

class PurchaseIntentSchema(BaseModel):
    has_intent: bool = Field(...)
    product_code: str | None = Field(None)

client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))
response = client.models.generate_content(
    model='gemini-3.8-flash',
    contents='Parse this Vietnamese livestream comment:\n"Mua B05"',
    config=genai.types.GenerateContentConfig(
        response_mime_type='application/json',
        response_schema=PurchaseIntentSchema,
    )
)
print('TEXT:', repr(response.text))
print('PARSED TYPE:', type(response.parsed) if hasattr(response, 'parsed') else 'N/A')
print('PARSED DATA:', getattr(response, 'parsed', 'N/A'))
