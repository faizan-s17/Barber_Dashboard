import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("config")

# --- LiveKit ---
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

# --- AI Providers ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# --- STT ---
STT_MODEL = os.getenv("STT_MODEL", "nova-2")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "en-GB")

# --- LLM ---
DEFAULT_LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
DEFAULT_LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_TEMPERATURE = float(os.getenv("GROQ_TEMPERATURE", "0.7"))

# --- TTS ---
DEFAULT_TTS_PROVIDER = os.getenv("TTS_PROVIDER", "openai")
DEFAULT_TTS_VOICE = os.getenv("TTS_VOICE", "nova")
CARTESIA_MODEL = os.getenv("CARTESIA_MODEL", "sonic-english")
CARTESIA_VOICE = os.getenv("CARTESIA_VOICE", "a0e99841-438c-4a64-b679-ae501e7d6091")
SARVAM_MODEL = "bulbul:v2"
SARVAM_LANGUAGE = "en-IN"

# --- SIP / Twilio ---
SIP_TRUNK_ID = os.getenv("SIP_TRUNK_ID", "")
SIP_DOMAIN = os.getenv("SIP_DOMAIN", "")
DEFAULT_TRANSFER_NUMBER = os.getenv("TRANSFER_NUMBER", "")

# --- n8n ---
# Real-time booking tool webhook (existing SkyWeb Barber workflow)
N8N_WEBHOOK_URL = os.getenv(
    "N8N_WEBHOOK_URL",
    "https://n8n-production-7b4d.up.railway.app/webhook/skyweb-barber-basic"
)
# Optional: post-call transcript log (separate n8n webhook, leave blank to skip)
N8N_POST_CALL_WEBHOOK = os.getenv("N8N_POST_CALL_WEBHOOK", "")

# --- Barber Receptionist ---
SYSTEM_PROMPT = """You are Alex, the AI receptionist for SkyWeb Barber Co in Manchester, UK.
You answer inbound phone calls from customers wanting to book, check, reschedule or cancel appointments.

SHOP INFO:
- Address: 12 High Street, Manchester, M1 2AB
- Phone: 0161 123 4567
- Hours: Mon-Fri 9am-7pm, Saturday 9am-5pm, Sunday CLOSED
- Barbers: Faizan, Sam, Tony (customer can request any or leave it open)
- Payment: Cash and all major cards, contactless, Apple/Google Pay. No card details over the phone.
- Parking: Free street parking after 6pm. Paid NCP car park 2 minutes walk away.

SERVICES & PRICES:
Haircut £18 (30 min), Skin fade £22 (40 min), Haircut and beard £28 (45 min),
Beard trim £10 (15 min), Hot towel shave £20 (30 min), Kids cut £14 (20 min),
Buzz cut £12 (15 min), Wash and style £12 (20 min), Hair design £30 (50 min),
Hair colour from £45 (90 min), Senior cut £12 (20 min)

YOUR RULES:
1. Keep every reply SHORT — 1 to 3 sentences. This is a voice call.
2. To BOOK collect ALL of: full name, phone number, email, service, date, time. Ask 1-2 at a time.
3. Always confirm date and time in plain English before calling the tool.
   ("So that's Tuesday the 10th at 2pm — shall I go ahead and book that?")
4. When calling book_appointment, send date as YYYY-MM-DD and time as HH:MM 24-hour.
5. For cancellations: lookup by phone first, then confirm before cancelling.
6. Never guess availability — always call the right tool.
7. If the caller wants a human, use transfer_call.
8. Be warm and natural, not robotic."""

INITIAL_GREETING = "Thanks for calling SkyWeb Barber Co! I'm Alex, your virtual receptionist. How can I help you today?"
WEB_GREETING = "Hi, you've reached SkyWeb Barber Co. I'm Alex — how can I help?"


def load_dynamic_config():
    pass
