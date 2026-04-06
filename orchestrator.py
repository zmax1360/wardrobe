"""
Fashion OS - Multi-Agent Orchestrator
Routes tasks to Claude API or LM Studio based on complexity
"""

import os
import json
import requests
from anthropic import Anthropic

# ── Config ────────────────────────────────────────────────────────────────────

LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
CLAUDE_MODEL = "claude-sonnet-4-20250514"
OPENAI_CHAT_MODEL = "gpt-4o-mini"


def _anthropic_key() -> str:
    return (
        os.getenv("ANTHROPIC_API_KEY", "").strip()
        or os.getenv("ANTHROPIC_API_KEK", "").strip()
    )
def _openai_key() -> str:
    key = (
        os.getenv("OPENAI_API_KEY", "").strip()
        or os.getenv("OPEN_AI_KEY", "").strip()
    )
    print(key)
    return key

def _openai_key() -> str:
    return (
       _openai_key() | 
        os.getenv("OPENAI_API_KEY", "").strip()
        or os.getenv("OPEN_AI_KEY", "").strip()
    )


def _call_openai_chat(system: str, user: str) -> str:
    key = _openai_key()
    if not key:
        raise RuntimeError("OpenAI key expected but missing")
    payload = {
        "model": OPENAI_CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 1024,
    }
    r = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=120,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


# ── Model Routers ─────────────────────────────────────────────────────────────

def call_claude(system: str, user: str) -> str:
    """Send a task to the cloud LLM: Anthropic if a key is set, else OpenAI."""
    anth = _anthropic_key()
    if anth:
        client = Anthropic(api_key=anth)
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return response.content[0].text
    if _openai_key():
        return _call_openai_chat(system, user)
    raise RuntimeError(
        "No cloud API key: set ANTHROPIC_API_KEY (or ANTHROPIC_API_KEK) "
        "or OPENAI_API_KEY / OPEN_AI_KEY"
    )


def call_local(system: str, user: str, model: str = "local-model") -> str:
    """Send a task to LM Studio (local)."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": 0.3,
        "max_tokens": 512,
    }
    try:
        r = requests.post(LM_STUDIO_URL, json=payload, timeout=30)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[LM Studio error: {e}]"


# ── Agents ────────────────────────────────────────────────────────────────────

def wardrobe_cataloger(image_description: str) -> dict:
    """
    Extracts structured clothing info from a description or image caption.
    Complexity: HIGH → Claude
    """
    system = (
        "You are a fashion cataloging expert. "
        "Extract clothing attributes and return ONLY valid JSON with keys: "
        "type, color, brand, material, occasion, season, tags."
    )
    result = call_claude(system, f"Catalog this item: {image_description}")
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {"raw": result}


def outfit_planner(wardrobe: list[str], occasion: str) -> str:
    """
    Suggests a basic outfit from available items.
    Complexity: LOW → LM Studio
    """
    system = "You are a helpful outfit planner. Keep suggestions short and practical."
    user   = f"Wardrobe: {', '.join(wardrobe)}\nOccasion: {occasion}\nSuggest one outfit."
    return call_local(system, user)


def style_designer(mood: str, season: str) -> str:
    """
    Generates creative style direction and outfit ideas.
    Complexity: HIGH → Claude
    """
    system = (
        "You are a creative fashion stylist. "
        "Generate an inspiring, detailed style direction with outfit ideas."
    )
    user = f"Mood: {mood}\nSeason: {season}\nCreate a style direction."
    return call_claude(system, user)


def gap_analyzer(wardrobe: list[str], style_goals: list[str]) -> str:
    """
    Compares wardrobe vs style goals and lists missing pieces.
    Complexity: LOW → LM Studio
    """
    system = "You are a wardrobe analyst. Be concise and list only the gaps."
    user = (
        f"Current wardrobe: {', '.join(wardrobe)}\n"
        f"Style goals: {', '.join(style_goals)}\n"
        f"What key pieces are missing?"
    )
    return call_local(system, user)


def shopping_agent(gaps: str, budget: str) -> str:
    """
    Recommends specific items to buy based on gaps and budget.
    Complexity: HIGH → Claude (needs reasoning + trend awareness)
    """
    system = (
        "You are a personal shopping assistant with deep knowledge of fashion trends. "
        "Recommend specific items with approximate prices."
    )
    user = f"Wardrobe gaps: {gaps}\nBudget: {budget}\nWhat should I buy?"
    return call_claude(system, user)


def travel_packer(destination: str, duration: str, wardrobe: list[str]) -> str:
    """
    Builds a packing list from existing wardrobe for a trip.
    Complexity: LOW → LM Studio
    """
    system = "You are a travel packing expert. Be concise and practical."
    user = (
        f"Destination: {destination}\nDuration: {duration}\n"
        f"Available wardrobe: {', '.join(wardrobe)}\n"
        f"Create a minimal packing list."
    )
    return call_local(system, user)


# ── Orchestrator ──────────────────────────────────────────────────────────────

AGENT_ROUTING = {
    "catalog"  : ("wardrobe_cataloger", "claude"),
    "outfit"   : ("outfit_planner",     "local"),
    "style"    : ("style_designer",     "claude"),
    "gaps"     : ("gap_analyzer",       "local"),
    "shop"     : ("shopping_agent",     "claude"),
    "pack"     : ("travel_packer",      "local"),
}

def orchestrate(task: str, **kwargs):
    """
    Main entry point. Pass a task name and relevant kwargs.

    Tasks:
        catalog  → kwargs: image_description
        outfit   → kwargs: wardrobe (list), occasion
        style    → kwargs: mood, season
        gaps     → kwargs: wardrobe (list), style_goals (list)
        shop     → kwargs: gaps, budget
        pack     → kwargs: destination, duration, wardrobe (list)
    """
    if task not in AGENT_ROUTING:
        raise ValueError(f"Unknown task '{task}'. Choose from: {list(AGENT_ROUTING.keys())}")

    agent_name, model = AGENT_ROUTING[task]
    print(f"\n🎯 Task: {task}")
    print(
        f"🤖 Routing to: {'☁️  Cloud (Claude or OpenAI)' if model == 'claude' else '💻 LM Studio (local)'}"
    )
    print("─" * 50)

    agent_fn = {
        "wardrobe_cataloger": wardrobe_cataloger,
        "outfit_planner"    : outfit_planner,
        "style_designer"    : style_designer,
        "gap_analyzer"      : gap_analyzer,
        "shopping_agent"    : shopping_agent,
        "travel_packer"     : travel_packer,
    }[agent_name]

    result = agent_fn(**kwargs)
    print(result)
    return result


# ── Demo ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    my_wardrobe = [
        "white linen shirt", "black jeans", "navy blazer",
        "white sneakers", "grey t-shirt", "beige chinos"
    ]

    # 1. Catalog a new item (Claude)
    orchestrate("catalog", image_description="A floral midi dress in pastel pink, cotton, H&M")

    # 2. Plan an outfit (Local)
    orchestrate("outfit", wardrobe=my_wardrobe, occasion="casual Friday at the office")

    # 3. Design a style direction (Claude)
    orchestrate("style", mood="confident minimalist", season="spring")

    # 4. Find wardrobe gaps (Local)
    orchestrate("gaps", wardrobe=my_wardrobe, style_goals=["smart casual", "weekend chic"])

    # 5. Shopping recommendations (Claude)
    orchestrate("shop", gaps="formal shoes, structured bag", budget="$200")

    # 6. Pack for a trip (Local)
    orchestrate("pack", destination="Paris", duration="4 days", wardrobe=my_wardrobe)
