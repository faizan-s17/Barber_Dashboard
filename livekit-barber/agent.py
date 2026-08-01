import os
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import asyncio
import aiohttp
from dotenv import load_dotenv
from typing import Optional

from livekit import agents, api
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.plugins import openai, cartesia, deepgram, noise_cancellation, silero, sarvam
from livekit.agents import llm

load_dotenv(".env")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("barber-receptionist")

import config


def _build_tts(provider: str = None, voice: str = None):
    provider = (provider or config.DEFAULT_TTS_PROVIDER).lower()
    if voice in ["anushka", "aravind", "amartya", "dhruv"]:
        provider = "sarvam"
    if provider == "cartesia":
        return cartesia.TTS(model=config.CARTESIA_MODEL, voice=config.CARTESIA_VOICE)
    if provider == "sarvam":
        return sarvam.TTS(model=config.SARVAM_MODEL, speaker=voice or "anushka", target_language_code=config.SARVAM_LANGUAGE)
    voice = voice or config.DEFAULT_TTS_VOICE
    return openai.TTS(model="tts-1", voice=voice)


def _build_llm(provider: str = None):
    provider = (provider or config.DEFAULT_LLM_PROVIDER).lower()
    if provider == "groq":
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=config.GROQ_MODEL,
            temperature=config.GROQ_TEMPERATURE,
        )
    return openai.LLM(model=config.DEFAULT_LLM_MODEL)


async def _call_n8n(intent: str, **kwargs) -> str:
    """POST to n8n barber webhook and return the message to speak."""
    payload = {"intent": intent, **{k: v for k, v in kwargs.items() if v is not None and v != ""}}
    logger.info(f"n8n call → intent={intent} payload={payload}")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                config.N8N_WEBHOOK_URL,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                data = await resp.json()
                logger.info(f"n8n response: {data}")
                return data.get("message", "I'm sorry, something went wrong. Please try again.")
    except asyncio.TimeoutError:
        return "That took a bit too long — please try again in a moment."
    except Exception as e:
        logger.error(f"n8n webhook error: {e}")
        return "I'm having trouble reaching our booking system right now. Please call us on 0161 123 4567."


class BarberFunctions(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext):
        super().__init__(tools=[])
        self.ctx = ctx

    @llm.function_tool(description="Book a haircut appointment. Requires customer name, phone, email, service, date (YYYY-MM-DD), and time (HH:MM 24-hour). Barber is optional.")
    async def book_appointment(
        self,
        customer_name: str,
        phone: str,
        email: str,
        service_type: str,
        preferred_date: str,
        preferred_time: str,
        preferred_barber: Optional[str] = None,
    ) -> str:
        return await _call_n8n(
            "book_appointment",
            customer_name=customer_name,
            phone=phone,
            email=email,
            service_type=service_type,
            preferred_date=preferred_date,
            preferred_time=preferred_time,
            preferred_barber=preferred_barber or "",
        )

    @llm.function_tool(description="Check if a slot is available on a given date and time for a service.")
    async def check_availability(
        self,
        service_type: str,
        preferred_date: str,
        preferred_time: str,
        preferred_barber: Optional[str] = None,
    ) -> str:
        return await _call_n8n(
            "check_availability",
            service_type=service_type,
            preferred_date=preferred_date,
            preferred_time=preferred_time,
            preferred_barber=preferred_barber or "",
        )

    @llm.function_tool(description="Look up an existing appointment using the customer's phone number.")
    async def lookup_appointment(self, phone: str) -> str:
        return await _call_n8n("lookup_appointment", phone=phone)

    @llm.function_tool(description="Reschedule an existing appointment to a new date and time. Requires phone number and new date/time.")
    async def reschedule_appointment(
        self,
        phone: str,
        preferred_date: str,
        preferred_time: str,
        service_type: Optional[str] = None,
        preferred_barber: Optional[str] = None,
    ) -> str:
        return await _call_n8n(
            "reschedule_appointment",
            phone=phone,
            preferred_date=preferred_date,
            preferred_time=preferred_time,
            service_type=service_type or "",
            preferred_barber=preferred_barber or "",
        )

    @llm.function_tool(description="Cancel an existing appointment. Requires phone number. Set confirm_cancel=True only after the customer confirms they want to cancel.")
    async def cancel_appointment(
        self,
        phone: str,
        confirm_cancel: bool = False,
    ) -> str:
        return await _call_n8n(
            "cancel_appointment",
            phone=phone,
            confirm_cancel=confirm_cancel,
        )

    @llm.function_tool(description="Check if there is a walk-in slot available today for a given service.")
    async def walk_in_today(self, service_type: str) -> str:
        return await _call_n8n("walk_in_today", service_type=service_type)

    @llm.function_tool(description="Transfer the call to a human staff member when the caller explicitly requests it.")
    async def transfer_call(self, destination: Optional[str] = None) -> str:
        target = destination or config.DEFAULT_TRANSFER_NUMBER
        if not target:
            return "I'm sorry, I can't transfer the call right now. Please call us directly on 0161 123 4567."
        if "@" not in target:
            if config.SIP_DOMAIN:
                clean = target.replace("tel:", "").replace("sip:", "")
                target = f"sip:{clean}@{config.SIP_DOMAIN}"
            elif not target.startswith("tel:"):
                target = f"tel:{target}"
        participant_identity = None
        for p in self.ctx.room.remote_participants.values():
            participant_identity = p.identity
            break
        if not participant_identity:
            return "Could not identify the caller to transfer."
        try:
            await self.ctx.api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=self.ctx.room.name,
                    participant_identity=participant_identity,
                    transfer_to=target,
                    play_dialtone=False,
                )
            )
            return "Transferring you now — please hold."
        except Exception as e:
            logger.error(f"Transfer failed: {e}")
            return "Transfer failed. Please call us directly on 0161 123 4567."


class BarberAssistant(Agent):
    def __init__(self, tools: list) -> None:
        super().__init__(instructions=config.SYSTEM_PROMPT, tools=tools)


async def entrypoint(ctx: agents.JobContext):
    logger.info(f"Inbound call — room: {ctx.room.name}")

    fnc_ctx = BarberFunctions(ctx)

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model=config.STT_MODEL, language=config.STT_LANGUAGE),
        llm=_build_llm(),
        tts=_build_tts(),
    )

    await session.start(
        room=ctx.room,
        agent=BarberAssistant(tools=list(fnc_ctx.function_tools.values())),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
            close_on_disconnect=True,
        ),
    )

    # Wait for the caller to join if not already present
    if not ctx.room.remote_participants:
        logger.info("Waiting for caller to connect...")
        participant_event = asyncio.Event()

        @ctx.room.on("participant_connected")
        def on_participant_connected(p):
            logger.info(f"Caller connected: {p.identity}")
            participant_event.set()

        try:
            await asyncio.wait_for(participant_event.wait(), timeout=30)
        except asyncio.TimeoutError:
            logger.warning("No caller joined within 30s — shutting down.")
            return

    await asyncio.sleep(0.5)
    await session.generate_reply(instructions=config.INITIAL_GREETING)

    # Post-call: send transcript to n8n (optional — only if N8N_POST_CALL_WEBHOOK is set)
    @ctx.room.on("disconnected")
    async def on_disconnect(reason):
        logger.info(f"Call ended: {reason}")
        if not config.N8N_POST_CALL_WEBHOOK:
            return
        try:
            messages = session.chat_ctx.messages
            transcript = "\n".join(
                f"{m.role}: {m.content}" for m in messages if m.content
            )
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    config.N8N_POST_CALL_WEBHOOK,
                    json={"transcript": transcript, "room": ctx.room.name, "status": "completed"},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    logger.info(f"Post-call webhook: {resp.status}")
        except Exception as e:
            logger.error(f"Post-call webhook failed: {e}")


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="barber-receptionist",
        )
    )
