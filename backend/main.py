from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import feedparser
import time
import hashlib
import asyncio
import urllib.parse
from difflib import SequenceMatcher

# --- TELEGRAM ---
try:
    from telethon import TelegramClient, events
    TELETHON_AVAILABLE = True
except ImportError:
    TELETHON_AVAILABLE = False
    print("⚠️ Telethon not installed, Telegram integration disabled.")

# --- NER (spaCy) ---
try:
    import spacy
    NER_AVAILABLE = True
    nlp = spacy.load("en_core_web_sm")
except ImportError:
    NER_AVAILABLE = False
    print("⚠️ spaCy not installed, NER-based keyword rescue disabled.")

# --- CONFIGURATION ---
MODEL_PATH = "Kenji-X-S/resq-tweet" 

# ✅ UPDATED CREDENTIALS
TELEGRAM_API_ID = 39031443
TELEGRAM_API_HASH = "82bad289f9e6a636ad14ced5d7ce19c5"

# Real Crisis Channels (High Signal)
TELEGRAM_CHANNELS = [
    "bnonews",         # Breaking news (Very fast)
    "insiderpaper",    # Geopolitical/Emergency alerts
    "disaster_news",   # Natural disasters
    "geoconfirmed",    # Verified footage
    "AtlasNews"        # Conflict news
] 

RSS_SOURCES = [
    {"name": "Reddit WhatsHappening","url": "https://www.reddit.com/r/WhatsHappening/new.rss?limit=60","color": "orange","base_trust": 28},
    {"name": "Reddit PublicFreakout","url": "https://www.reddit.com/r/PublicFreakout/new.rss?limit=60","color": "orange","base_trust": 26},
    {"name": "Reddit Firefighting","url": "https://www.reddit.com/r/Firefighting/new.rss?limit=50","color": "orange","base_trust": 30},
    {"name": "Reddit BreakingNews","url": "https://www.reddit.com/r/BreakingNews/new.rss?limit=60","color": "orange","base_trust": 32},
    {"name": "Reddit CasualConversation","url": "https://www.reddit.com/r/CasualConversation/new.rss?limit=60","color": "orange","base_trust": 22},
    {"name": "Reddit AskReddit","url": "https://www.reddit.com/r/AskReddit/new.rss?limit=60","color": "orange","base_trust": 20},
    {"name": "Reddit Intel","url": "https://www.reddit.com/r/PrepperIntel+conflictnews+disaster+emergency/new.rss?limit=100","color": "orange","base_trust": 25},
    {"name": "Reddit News","url": "https://www.reddit.com/r/worldnews+news+disaster/new.rss?limit=50","color": "orange","base_trust": 20},
    {"name": "GDACS","url": "https://www.gdacs.org/xml/rss.xml","color": "blue","base_trust": 100},
    {"name": "Google News","url": "https://news.google.com/rss/search?q=earthquake+OR+flood+OR+wildfire+OR+tsunami+OR+explosion+when:48h&hl=en-US&gl=US&ceid=US:en&scoring=n","color": "green","base_trust": 50},
    {"name": "Local Alerts","url": "https://news.google.com/rss/search?q=fire+department+OR+police+reported+OR+emergency+crews+OR+blaze+OR+rescue+when:24h&hl=en-US&gl=US&ceid=US:en&scoring=n","color": "green","base_trust": 60}
]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
tokenizer = None
PREDICTION_CACHE = {} 
telegram_client = None

if TELETHON_AVAILABLE and TELEGRAM_API_ID and TELEGRAM_API_HASH:
    # Initialize client (connects in startup event)
    telegram_client = TelegramClient("resq_telegram", TELEGRAM_API_ID, TELEGRAM_API_HASH)

# --- BACKGROUND TASK: CACHE CLEANUP ---
async def periodic_cleanup():
    while True:
        await asyncio.sleep(3600) # Sleep for 1 hour
        print("🧹 Running Cache Cleanup...")
        try:
            current_time = time.time()
            keys_to_delete = [
                k for k, v in PREDICTION_CACHE.items() 
                if current_time - v['timestamp'] > 86400
            ]
            for k in keys_to_delete:
                del PREDICTION_CACHE[k]
            print(f"✅ Cleanup Complete. Removed {len(keys_to_delete)} old items.")
        except Exception as e:
            print(f"⚠️ Cleanup failed: {e}")

@app.on_event("startup")
async def startup_event():
    global model, tokenizer
    print("⏳ Loading AI Model...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
        print("✅ AI Model Loaded")
        
        # Start Telegram Client (Non-blocking)
        if telegram_client:
            print("🚀 Connecting to Telegram...")
            try:
                await telegram_client.connect()
                if not await telegram_client.is_user_authorized():
                    print("⚠️ Telegram Session Invalid or Missing. Please upload 'resq_telegram.session'.")
                else:
                    print("✅ Telegram Connected Successfully")
            except Exception as e:
                print(f"❌ Telegram Connection Error: {e}")

        asyncio.create_task(periodic_cleanup())
        print("✅ Memory Cleanup Task Started")
    except Exception as e:
        print(f"❌ Error loading model: {e}")

# --- NER Rescue ---
def keyword_rescue(text, label, conf):
    if not NER_AVAILABLE or conf > 0.9:
        return label, conf
    text_low = text.lower()
    doc = nlp(text)
    disaster_keywords = {"fire":"Fire","blaze":"Fire","flood":"Flood","crash":"Medical Emergency"}
    for kw, cat in disaster_keywords.items():
        if kw in text_low and not any(ent.label_=="PERSON" and kw in ent.text.lower() for ent in doc.ents):
            if label=="Other": return cat,0.85
    return label, conf

def predict(text):
    if not model: return "Loading...",0.0
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=128, padding="max_length")
    with torch.no_grad():
        logits = model(**inputs).logits
    pred_id = logits.argmax().item()
    conf = torch.softmax(logits, dim=1).max().item()
    label = model.config.id2label[pred_id]
    return keyword_rescue(text,label,conf)

# --- Tweet style ---
def headline_to_tweet_style(text):
    if not text: return text
    t = text.replace("\n"," ").rstrip(".")
    words = t.split()
    if len(words)>18: t = " ".join(words[:16])+"..."
    if not t.lower().startswith(("people","witnesses","residents","reports","breaking")):
        t = "People reporting: "+t
    return t

# --- Similarity ---
def enhanced_similarity(a,b):
    base = SequenceMatcher(None,a,b).ratio()
    boost = 0
    for kw in ["fire","flood","blast","explosion"]:
        if kw in a.lower() and kw in b.lower(): boost+=0.18
    return min(base+boost,1.0)

def calculate_consensus_boost(new_item, cache):
    count = 0
    now = time.time()
    # FIX: Iterate over a list copy to prevent runtime errors during high concurrency
    for cached in list(cache.values()):
        try:
            if cached['id']==new_item['id']: continue
            if cached['category']!=new_item['category']: continue
            sim = enhanced_similarity(new_item['title'],cached['title'])
            if sim>0.55:
                age_sec = now - cached.get('timestamp',now)
                w = 1.0 if age_sec<3600 else 0.8 if age_sec<14400 else 0.6
                count+=w
        except: continue
    return int(min(count*20,60))

# --- COMMON PROCESSING LOGIC ---
def process_item_logic(title, link, source_name, timestamp, base_trust, seen_ids, results, now):
    # 1. Deduplication via ID
    post_id = hashlib.md5((title+link).encode()).hexdigest()
    if post_id in seen_ids: return

    # 2. Check Cache
    if post_id in PREDICTION_CACHE:
        item = PREDICTION_CACHE[post_id]
        boost = calculate_consensus_boost(item, PREDICTION_CACHE)
        age_min = max(0, (now - item.get('timestamp', now))/60)
        recency_bonus = max(0, 40 - age_min)
        item['confidence'] = min(100, int(base_trust + boost + recency_bonus))
        
        results.append(item)
        seen_ids.add(post_id)
        return

    # 3. Predict
    tstyle = headline_to_tweet_style(title)
    cat, conf = predict(tstyle)

    # 4. Filters
    if conf < 0.45 and source_name in ("Google News", "Local Alerts"): return
    if conf < 0.65 and source_name not in ("Google News", "Local Alerts"): return

    # 5. Create Item
    item = {
        "id": post_id, 
        "title": title, 
        "category": cat, 
        "url": link,
        "subreddit": source_name, 
        "timestamp": timestamp
    }

    # 6. Calc Confidence
    boost = calculate_consensus_boost(item, PREDICTION_CACHE)
    age_min = max(0, (now - timestamp)/60)
    recency_bonus = max(0, 40 - age_min)
    item['confidence'] = min(100, int(base_trust + boost + recency_bonus))

    # 7. Store
    PREDICTION_CACHE[post_id] = item
    results.append(item)
    seen_ids.add(post_id)


# --- API FETCH ---
@app.get("/api/live-feed")
async def get_feed(): 
    results = []
    seen_ids = set()
    MAX_ITEMS = 50 
    now = time.time()
    
    # 1. FETCH TELEGRAM (Only if connected)
    if telegram_client and telegram_client.is_connected():
        for channel in TELEGRAM_CHANNELS:
            try:
                # Fetch last 10 messages from channel
                # We use 'iter_messages' which works well for both public/private if authorized
                async for message in telegram_client.iter_messages(channel, limit=10):
                    if not message.text: continue
                    
                    link = f"https://t.me/{channel}/{message.id}"
                    clean_text = message.text[:200].replace('\n', ' ').strip()
                    if len(message.text) > 200: clean_text += "..."
                    
                    process_item_logic(
                        title=clean_text,
                        link=link,
                        source_name=f"Telegram: {channel}",
                        timestamp=message.date.timestamp(),
                        base_trust=75, # High trust for specialized channels
                        seen_ids=seen_ids,
                        results=results,
                        now=now
                    )
            except Exception as e:
                # print(f"Telegram Error ({channel}): {e}") # Optional: uncomment to debug
                pass

    # 2. FETCH RSS FEEDS
    for source in RSS_SOURCES:
        try:
            feed = feedparser.parse(source['url'], request_headers={'User-Agent': 'Mozilla/5.0'})
            for entry in feed.entries:
                if len(results) >= MAX_ITEMS * 2: break 
                
                title = getattr(entry, 'title', '').strip()
                if source['name'] == "GDACS" and "Green" in title: continue
                link = getattr(entry, 'link', '').strip()
                timestamp = time.mktime(entry.published_parsed) if hasattr(entry, 'published_parsed') else now
                
                process_item_logic(
                    title=title,
                    link=link,
                    source_name=source['name'],
                    timestamp=timestamp,
                    base_trust=source['base_trust'],
                    seen_ids=seen_ids,
                    results=results,
                    now=now
                )
        except: continue
        
    results.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return {"status": "success", "data": results[:MAX_ITEMS]}

# --- SEARCH FEATURE ---
@app.get("/api/search")
def search_feed(q: str):
    if not q: return {"status": "error", "message": "Query required"}
    results = []
    encoded_query = urllib.parse.quote(q)
    now = time.time()
    
    try:
        gn_url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en&scoring=n"
        feed = feedparser.parse(gn_url, request_headers={'User-Agent': 'Mozilla/5.0'})
        
        for entry in feed.entries[:20]: 
            title = getattr(entry,'title','').strip()
            link = getattr(entry,'link','').strip()
            tstyle = headline_to_tweet_style(title)
            cat, conf = predict(tstyle)
            timestamp = time.mktime(entry.published_parsed) if hasattr(entry, 'published_parsed') else now
            confidence = 90 if conf > 0.8 else 60
            
            item = {
                "id": hashlib.md5((title + link).encode()).hexdigest(),
                "title": title,
                "category": cat,
                "confidence": confidence,
                "url": link,
                "subreddit": "Google News Search",
                "timestamp": timestamp
            }
            results.append(item)
    except Exception as e:
        print(f"Search Error: {e}")

    results.sort(key=lambda x: x['timestamp'], reverse=True)
    return {"status": "success", "data": results}

# --- RUN SERVER ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)