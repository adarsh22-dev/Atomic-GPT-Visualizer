import os
import sys
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from openai import OpenAI
from dotenv import load_dotenv
import uvicorn

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("microgpt-api")

app = FastAPI(title="MicroGPT AI Backend")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

def get_openai_client():
    """Lazy initialization of OpenAI client."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    return OpenAI(api_key=api_key)

@app.get("/api/health")
async def health():
    return {"status": "ok", "backend": "fastapi"}

@app.post("/api/chat/openai")
async def chat_openai(request: ChatRequest):
    client = get_openai_client()
    if not client:
        logger.error("OpenAI API Key not configured")
        raise HTTPException(status_code=400, detail="OpenAI API Key not configured in Secrets.")
        
    try:
        logger.info(f"Processing chat request with {len(request.messages)} messages")
        # Log the intent (last message)
        if request.messages:
            logger.info(f"User Intent: {request.messages[-1].content[:50]}...")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[m.model_dump() for m in request.messages]
        )
        
        content = response.choices[0].message.content
        logger.info("Successfully generated AI response")
        return {"content": content}
    except Exception as e:
        logger.error(f"OpenAI Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/MicroGPT.py")
async def download_script():
    """Endpoint to serve the MicroGPT.py script for download."""
    script_path = os.path.join(os.getcwd(), "MicroGPT.py")
    if os.path.exists(script_path):
        return FileResponse(script_path, filename="MicroGPT.py")
    raise HTTPException(status_code=404, detail="Script not found")

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", 3001))
    logger.info(f"Starting FastAPI on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
