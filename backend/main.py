from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import feedparser
import time
import hashlib
import asyncio
import urllib.parse

# --- CONFIGURATION ---
# Point to your hosted model on Hugging Face
MODEL_PATH = "Kenji-X-S/resq-tweet"

# LIST OF SOURCES
RSS_SOURCES = [
    # 1. Reddit (The Human Element)
    {
        "name": "Reddit",
        "url": "https://www.reddit.com/r/worldnews+news+disaster+emergency+earthquakes.rss",
        "color": "orange" 
    },
    # 2. GDACS (The Scientific Element)
    {
        "name": "GDACS",
        "url": "https://www.gdacs.org/xml/rss.xml",
        "color": "blue"
    },
    # 3. Google News (The Broad Net)
    {
        "name": "Google News",
        "url": "https://news.google.com/rss/search?q=earthquake+OR+flood+OR+fire+OR+tsunami+when:1h&hl=en-US&gl=US&ceid=US:en",
        "color": "green"
    }
]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
model = None
tokenizer = None

@app.on_event("startup")
def load_resources():
    global model, tokenizer
    print("⏳ Loading AI Model...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
        print("✅ System Online: AI Model Loaded.")
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")

# --- HELPER: KEYWORD OVERRIDES ---
def apply_rule_based_overrides(text, predicted_label, confidence):
    text_lower = text.lower()
    
    # 1. Fire Override
    if "fire" in text_lower or "wildfire" in text_lower:
        return "Fire", 1.0  # Force 100% confidence
        
    # 2. Flood Override
    if "flood" in text_lower:
        return "Flood", 1.0
        
    # 3. Earthquake Override
    if "earthquake" in text_lower or "magnitude" in text_lower:
        return "Earthquake", 1.0

    # 4. Crisis/Medical Override
    if "hospital" in text_lower or "injured" in text_lower:
        return "Medical Emergency", 1.0

    return predicted_label, confidence

def predict(text):
    if not model: return "Loading...", 0.0
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=128, padding="max_length")
    with torch.no_grad():
        logits = model(**inputs).logits
    
    pred_id = logits.argmax().item()
    confidence = torch.softmax(logits, dim=1).max().item()
    label = model.config.id2label[pred_id]
    
    # Apply overrides to fix "Other" labels on obvious disasters
    final_label, final_conf = apply_rule_based_overrides(text, label, confidence)
    
    return final_label, final_conf

# --- HELPER: PROCESS SINGLE ENTRY ---
def process_entry(entry, source_name):
    """
    Standardizes parsing, prediction, filtering, and ID generation 
    for both live feed and search results.
    """
    title = entry.title
    
    # PREDICTION
    category, conf = predict(title)
    
    # STRICT FILTERS
    if conf < 0.75: return None
    if category == "Other" and conf < 0.95: return None
    
    # --- FIX: STRONGER ID GENERATION ---
    clean_title = title.strip()
    clean_link = entry.link.strip()
    unique_string = clean_title + clean_link
    post_id = hashlib.md5(unique_string.encode('utf-8')).hexdigest()

    # Timestamp handling
    if hasattr(entry, 'published_parsed') and entry.published_parsed:
        timestamp = time.mktime(entry.published_parsed)
    elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
        timestamp = time.mktime(entry.updated_parsed)
    else:
        timestamp = time.time()

    return {
        "id": post_id,
        "title": title,
        "category": category,
        "confidence": round(conf * 100, 1),
        "url": entry.link,
        "subreddit": source_name, 
        "timestamp": timestamp
    }

@app.get("/api/live-feed")
def get_feed():
    results = []
    
    # Loop through all sources
    for source in RSS_SOURCES:
        try:
            print(f"Fetching {source['name']}...")
            feed = feedparser.parse(source['url'])
            
            # Take top 5 from each source
            for entry in feed.entries[:5]:
                item = process_entry(entry, source['name'])
                if item:
                    results.append(item)

        except Exception as e:
            print(f"Error fetching {source['name']}: {e}")
            continue
            
    # Sort all combined results by time (newest first)
    results.sort(key=lambda x: x['timestamp'], reverse=True)
            
    return {"status": "success", "data": results}

@app.get("/api/search")
def search_feed(q: str):
    """
    Searches the RSS feeds for a specific query if the user wants older/specific events.
    """
    if not q:
        return {"status": "error", "message": "Query parameter 'q' is required"}

    results = []
    encoded_query = urllib.parse.quote(q)
    print(f"🔎 Global Search Initiated for: {q}")

    # 1. Google News Search
    # Uses the search RSS endpoint directly
    try:
        gn_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"
        feed = feedparser.parse(gn_url)
        for entry in feed.entries[:10]:
            item = process_entry(entry, "Google News")
            if item: results.append(item)
    except Exception as e:
        print(f"Search Error (Google): {e}")

    # 2. Reddit Search
    # Uses Reddit's search.rss endpoint
    try:
        reddit_url = f"https://www.reddit.com/r/worldnews+news+disaster+emergency+earthquakes/search.rss?q={encoded_query}&sort=new&restrict_sr=on"
        feed = feedparser.parse(reddit_url)
        for entry in feed.entries[:10]:
            item = process_entry(entry, "Reddit")
            if item: results.append(item)
    except Exception as e:
        print(f"Search Error (Reddit): {e}")

    # 3. GDACS (Manual Filter)
    # GDACS doesn't support search params, so we fetch the live feed and filter by text
    try:
        feed = feedparser.parse("https://www.gdacs.org/xml/rss.xml")
        for entry in feed.entries:
            if q.lower() in entry.title.lower():
                item = process_entry(entry, "GDACS")
                if item: results.append(item)
    except Exception as e:
        print(f"Search Error (GDACS): {e}")

    results.sort(key=lambda x: x['timestamp'], reverse=True)
    return {"status": "success", "data": results}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)