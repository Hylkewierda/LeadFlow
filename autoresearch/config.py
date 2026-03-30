import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

HUBSPOT_API_KEY = os.getenv("HUBSPOT_API_KEY", "")
