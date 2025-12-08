#!/usr/bin/env python3
"""
Plex Auto-Cache Service
Intelligent caching system that automatically caches content when played,
manages disk space with LRU eviction, and protects active playback sessions.
"""

import os
import json
import sqlite3
import subprocess
import threading
import time
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from queue import PriorityQueue
from dataclasses import dataclass, field
from typing import Optional
from flask import Flask, request, jsonify

app = Flask(__name__)

CACHE_BASE = os.getenv("CACHE_BASE", "/opt/plex-cache")
NAS_BASE = os.getenv("NAS_BASE", "/mnt/nas/networkshare")
CACHE_MAX_SIZE_GB = int(os.getenv("CACHE_MAX_SIZE_GB", "100"))
CACHE_BUFFER_GB = int(os.getenv("CACHE_BUFFER_GB", "10"))
SESSION_PROTECT_MINUTES = int(os.getenv("SESSION_PROTECT_MINUTES", "60"))
DB_PATH = os.getenv("DB_PATH", "/data/cache_metadata.db")
PLEX_CACHE_SCRIPT = os.getenv("PLEX_CACHE_SCRIPT", "/scripts/plex-cache.sh")

CACHE_PATHS = {
    "movie": f"{CACHE_BASE}/movies",
    "show": f"{CACHE_BASE}/shows",
    "episode": f"{CACHE_BASE}/shows",
    "music": f"{CACHE_BASE}/music",
    "track": f"{CACHE_BASE}/music",
}

NAS_PATHS = {
    "movie": f"{NAS_BASE}/video/Movies",
    "show": f"{NAS_BASE}/video/Shows",
    "episode": f"{NAS_BASE}/video/Shows",
    "music": f"{NAS_BASE}/music",
    "track": f"{NAS_BASE}/music",
}


def init_db():
    """Initialize SQLite database with required tables."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS media_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plex_key TEXT UNIQUE,
            title TEXT,
            media_type TEXT,
            folder_name TEXT,
            file_path TEXT,
            size_bytes INTEGER DEFAULT 0,
            is_cached INTEGER DEFAULT 0,
            cached_at TIMESTAMP,
            last_watched TIMESTAMP,
            watch_progress REAL DEFAULT 0,
            watch_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS active_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_key TEXT UNIQUE,
            plex_key TEXT,
            media_type TEXT,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            state TEXT DEFAULT 'playing'
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS cache_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plex_key TEXT UNIQUE,
            folder_name TEXT,
            media_type TEXT,
            priority INTEGER DEFAULT 5,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            error TEXT
        )
    """)
    
    c.execute("CREATE INDEX IF NOT EXISTS idx_media_cached ON media_items(is_cached)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_media_watched ON media_items(last_watched)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_sessions_key ON active_sessions(plex_key)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_queue_status ON cache_queue(status)")
    
    conn.commit()
    conn.close()


def get_db():
    """Get database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_cache_size_bytes():
    """Get current cache size in bytes."""
    total = 0
    for subdir in ["movies", "shows", "music"]:
        path = Path(CACHE_BASE) / subdir
        if path.exists():
            for f in path.rglob("*"):
                if f.is_file():
                    total += f.stat().st_size
    return total


def get_folder_size_bytes(path):
    """Get folder size in bytes."""
    total = 0
    path = Path(path)
    if path.exists():
        for f in path.rglob("*"):
            if f.is_file():
                total += f.stat().st_size
    return total


def bytes_to_gb(b):
    """Convert bytes to GB."""
    return b / (1024 ** 3)


def gb_to_bytes(gb):
    """Convert GB to bytes."""
    return gb * (1024 ** 3)


def is_session_protected(plex_key):
    """Check if media has an active or recently-active session."""
    conn = get_db()
    c = conn.cursor()
    
    cutoff = datetime.now() - timedelta(minutes=SESSION_PROTECT_MINUTES)
    c.execute("""
        SELECT COUNT(*) FROM active_sessions 
        WHERE plex_key = ? AND last_update > ?
    """, (plex_key, cutoff))
    
    count = c.fetchone()[0]
    conn.close()
    return count > 0


def get_eviction_candidates():
    """Get list of cached items sorted by eviction priority (lowest priority = evict first)."""
    conn = get_db()
    c = conn.cursor()
    
    c.execute("""
        SELECT 
            id, plex_key, title, media_type, folder_name, size_bytes,
            last_watched, watch_progress, watch_count
        FROM media_items 
        WHERE is_cached = 1
        ORDER BY 
            CASE WHEN watch_progress >= 0.9 THEN 0 ELSE 1 END,
            last_watched ASC,
            watch_count ASC
    """)
    
    candidates = []
    for row in c.fetchall():
        if not is_session_protected(row["plex_key"]):
            candidates.append(dict(row))
    
    conn.close()
    return candidates


def evict_to_fit(needed_bytes):
    """Evict cached items to make room for new content."""
    current_size = get_cache_size_bytes()
    max_size = gb_to_bytes(CACHE_MAX_SIZE_GB - CACHE_BUFFER_GB)
    
    space_to_free = (current_size + needed_bytes) - max_size
    if space_to_free <= 0:
        return True
    
    candidates = get_eviction_candidates()
    freed = 0
    
    for item in candidates:
        if freed >= space_to_free:
            break
        
        cache_path = Path(CACHE_PATHS.get(item["media_type"], CACHE_PATHS["movie"])) / item["folder_name"]
        if cache_path.exists():
            item_size = get_folder_size_bytes(cache_path)
            app.logger.info(f"Evicting: {item['title']} ({bytes_to_gb(item_size):.1f}GB)")
            
            try:
                shutil.rmtree(cache_path)
                freed += item_size
                
                conn = get_db()
                c = conn.cursor()
                c.execute("UPDATE media_items SET is_cached = 0, cached_at = NULL WHERE id = ?", (item["id"],))
                conn.commit()
                conn.close()
            except Exception as e:
                app.logger.error(f"Failed to evict {item['title']}: {e}")
    
    return freed >= space_to_free


def extract_folder_name(file_path, media_type):
    """Extract the folder name from a file path."""
    if not file_path:
        return None
    
    path = Path(file_path)
    
    if media_type in ["movie"]:
        if "/nas/video/Movies/" in file_path:
            rel = file_path.split("/nas/video/Movies/")[1]
            return rel.split("/")[0]
    elif media_type in ["episode", "show"]:
        if "/nas/video/Shows/" in file_path:
            rel = file_path.split("/nas/video/Shows/")[1]
            return rel.split("/")[0]
    elif media_type in ["track", "music"]:
        if "/nas/music/" in file_path:
            rel = file_path.split("/nas/music/")[1]
            return rel.split("/")[0]
    
    return path.parent.name


def is_already_cached(folder_name, media_type):
    """Check if content is already in cache."""
    cache_dir = CACHE_PATHS.get(media_type, CACHE_PATHS["movie"])
    cache_path = Path(cache_dir) / folder_name
    return cache_path.exists()


def cache_content(folder_name, media_type, plex_key=None, title=None):
    """Cache content using plex-cache.sh."""
    type_map = {"movie": "movie", "episode": "show", "show": "show", "track": "music", "music": "music"}
    cache_type = type_map.get(media_type, "movie")
    
    nas_dir = NAS_PATHS.get(media_type, NAS_PATHS["movie"])
    source_path = Path(nas_dir) / folder_name
    
    if not source_path.exists():
        app.logger.warning(f"Source not found: {source_path}")
        return False
    
    needed_bytes = get_folder_size_bytes(source_path)
    
    if not evict_to_fit(needed_bytes):
        app.logger.error(f"Cannot evict enough space for {folder_name}")
        return False
    
    try:
        cache_dest = CACHE_PATHS.get(media_type, CACHE_PATHS["movie"])
        os.makedirs(cache_dest, exist_ok=True)
        
        result = subprocess.run(
            ["rsync", "-av", "--progress", str(source_path), cache_dest],
            capture_output=True,
            text=True,
            timeout=3600
        )
        
        if result.returncode == 0:
            dest_path = Path(cache_dest) / folder_name
            if dest_path.exists():
                subprocess.run(["chown", "-R", "1000:1000", str(dest_path)], check=False)
            
            if plex_key:
                conn = get_db()
                c = conn.cursor()
                c.execute("""
                    INSERT OR REPLACE INTO media_items 
                    (plex_key, title, media_type, folder_name, size_bytes, is_cached, cached_at, last_watched)
                    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (plex_key, title or folder_name, media_type, folder_name, needed_bytes))
                conn.commit()
                conn.close()
            
            app.logger.info(f"Cached: {folder_name} ({bytes_to_gb(needed_bytes):.1f}GB)")
            return True
        else:
            app.logger.error(f"rsync failed: {result.stderr}")
            return False
            
    except Exception as e:
        app.logger.error(f"Cache failed for {folder_name}: {e}")
        return False


@dataclass(order=True)
class CacheJob:
    priority: int
    plex_key: str = field(compare=False)
    folder_name: str = field(compare=False)
    media_type: str = field(compare=False)
    title: str = field(compare=False)


cache_queue = PriorityQueue()
queue_lock = threading.Lock()
active_jobs = set()


def update_job_status(plex_key, status, error=None):
    """Update job status in SQLite."""
    try:
        conn = get_db()
        c = conn.cursor()
        if status == 'processing':
            c.execute("""
                UPDATE cache_queue SET status = ?, started_at = CURRENT_TIMESTAMP
                WHERE plex_key = ?
            """, (status, plex_key))
        elif status in ('completed', 'failed'):
            c.execute("""
                UPDATE cache_queue SET status = ?, completed_at = CURRENT_TIMESTAMP, error = ?
                WHERE plex_key = ?
            """, (status, error, plex_key))
        else:
            c.execute("UPDATE cache_queue SET status = ? WHERE plex_key = ?", (status, plex_key))
        conn.commit()
        conn.close()
    except Exception as e:
        app.logger.error(f"Failed to update job status: {e}")


def cache_worker():
    """Background worker that processes cache queue."""
    import logging
    logger = logging.getLogger('cache_worker')
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s - CACHE_WORKER - %(message)s'))
        logger.addHandler(handler)
    
    logger.info("Cache worker thread STARTED - waiting for jobs...")
    heartbeat_counter = 0
    
    while True:
        try:
            job = cache_queue.get(timeout=10)
            logger.info(f"Processing job: {job.title} ({job.media_type}) - folder: {job.folder_name}")
            
            with queue_lock:
                if job.plex_key in active_jobs:
                    logger.info(f"Skipping duplicate job: {job.title}")
                    cache_queue.task_done()
                    continue
                active_jobs.add(job.plex_key)
            
            update_job_status(job.plex_key, 'processing')
            
            try:
                if is_already_cached(job.folder_name, job.media_type):
                    logger.info(f"Already cached: {job.title}")
                    update_job_status(job.plex_key, 'completed', 'Already cached')
                else:
                    logger.info(f"Starting rsync for: {job.title}")
                    success = cache_content(job.folder_name, job.media_type, job.plex_key, job.title)
                    if success:
                        logger.info(f"Successfully cached: {job.title}")
                        update_job_status(job.plex_key, 'completed')
                    else:
                        logger.error(f"Failed to cache: {job.title}")
                        update_job_status(job.plex_key, 'failed', 'Cache operation failed')
            except Exception as e:
                logger.error(f"Cache worker error for {job.title}: {e}")
                update_job_status(job.plex_key, 'failed', str(e))
            finally:
                with queue_lock:
                    active_jobs.discard(job.plex_key)
                cache_queue.task_done()
                
        except Exception:
            heartbeat_counter += 1
            if heartbeat_counter >= 6:
                logger.info(f"Cache worker alive - queue size: {cache_queue.qsize()}")
                heartbeat_counter = 0


worker_thread = None
worker_started = False
init_lock = threading.Lock()


def reload_pending_jobs():
    """Reload pending jobs from SQLite into the in-memory queue on startup."""
    try:
        conn = get_db()
        c = conn.cursor()
        c.execute("""
            SELECT plex_key, folder_name, media_type, priority
            FROM cache_queue 
            WHERE status IN ('pending', 'processing')
            ORDER BY priority ASC, created_at ASC
        """)
        
        count = 0
        for row in c.fetchall():
            job = CacheJob(
                priority=row["priority"],
                plex_key=row["plex_key"],
                folder_name=row["folder_name"],
                media_type=row["media_type"],
                title=row["folder_name"]
            )
            cache_queue.put(job)
            count += 1
        
        c.execute("UPDATE cache_queue SET status = 'pending' WHERE status = 'processing'")
        conn.commit()
        conn.close()
        
        if count > 0:
            app.logger.info(f"Reloaded {count} pending jobs from database")
    except Exception as e:
        app.logger.error(f"Failed to reload pending jobs: {e}")


def ensure_initialized():
    """Ensure database and worker are initialized (safe to call multiple times)."""
    global worker_started, worker_thread
    if worker_started:
        return
    
    with init_lock:
        if not worker_started:
            init_db()
            reload_pending_jobs()
            worker_thread = threading.Thread(target=cache_worker, daemon=True, name="CacheWorker")
            worker_thread.start()
            worker_started = True
            app.logger.info(f"Plex Auto-Cache service initialized - worker thread: {worker_thread.name} (alive={worker_thread.is_alive()})")


def queue_cache_job(plex_key, folder_name, media_type, title, priority=5):
    """Add a cache job to the queue with SQLite persistence."""
    with queue_lock:
        if plex_key in active_jobs:
            return False
    
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        INSERT INTO cache_queue (plex_key, folder_name, media_type, priority, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
        ON CONFLICT(plex_key) DO UPDATE SET 
            priority = MIN(excluded.priority, cache_queue.priority),
            status = CASE WHEN cache_queue.status IN ('failed', 'completed') THEN 'pending' ELSE cache_queue.status END
    """, (plex_key, folder_name, media_type, priority))
    conn.commit()
    conn.close()
    
    job = CacheJob(priority=priority, plex_key=plex_key, folder_name=folder_name, media_type=media_type, title=title)
    cache_queue.put(job)
    app.logger.info(f"Queued for caching: {title} (priority {priority})")
    return True


@app.before_request
def before_request():
    """Initialize database and worker on first request (for Gunicorn)."""
    ensure_initialized()


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})


@app.route("/debug/worker", methods=["GET"])
def debug_worker():
    """Debug endpoint to check worker thread status."""
    global worker_thread, worker_started
    thread_info = {
        "worker_started_flag": worker_started,
        "thread_exists": worker_thread is not None,
        "thread_alive": worker_thread.is_alive() if worker_thread else False,
        "thread_name": worker_thread.name if worker_thread else None,
        "queue_size": cache_queue.qsize(),
        "active_jobs_count": len(active_jobs),
        "active_jobs": list(active_jobs)[:10]
    }
    return jsonify(thread_info)


@app.route("/test-webhook", methods=["GET", "POST"])
def test_webhook():
    """Test endpoint to verify webhook connectivity."""
    app.logger.info(f"Test webhook received! Method: {request.method}")
    return jsonify({
        "status": "ok",
        "message": "Webhook endpoint is reachable!",
        "method": request.method,
        "timestamp": datetime.now().isoformat()
    })


@app.route("/register-existing", methods=["POST"])
def register_existing():
    """Register existing cached content that wasn't tracked in the database."""
    registered = []
    errors = []
    
    for media_type, cache_dir in [("movie", "movies"), ("show", "shows"), ("music", "music")]:
        cache_path = Path(CACHE_BASE) / cache_dir
        if not cache_path.exists():
            continue
            
        for item in cache_path.iterdir():
            folder_name = item.name
            if folder_name.startswith('.'):
                continue
                
            try:
                size_bytes = get_folder_size_bytes(item) if item.is_dir() else item.stat().st_size
                
                conn = get_db()
                c = conn.cursor()
                c.execute("""
                    INSERT OR IGNORE INTO media_items 
                    (plex_key, title, media_type, folder_name, size_bytes, is_cached, cached_at, last_watched)
                    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (f"existing-{folder_name}", folder_name, media_type, folder_name, size_bytes))
                
                if c.rowcount > 0:
                    registered.append({"name": folder_name, "type": media_type, "size_gb": round(size_bytes / (1024**3), 2)})
                conn.commit()
                conn.close()
            except Exception as e:
                errors.append({"name": folder_name, "error": str(e)})
    
    return jsonify({
        "status": "ok",
        "registered": registered,
        "errors": errors,
        "message": f"Registered {len(registered)} existing cached items"
    })


@app.route("/status", methods=["GET"])
def status():
    """Get cache status and statistics."""
    cache_size = get_cache_size_bytes()
    max_size = gb_to_bytes(CACHE_MAX_SIZE_GB)
    
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT COUNT(*) FROM media_items WHERE is_cached = 1")
    cached_count = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM active_sessions WHERE last_update > ?", 
              (datetime.now() - timedelta(minutes=SESSION_PROTECT_MINUTES),))
    active_sessions = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM cache_queue WHERE status IN ('pending', 'processing')")
    queue_size = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM cache_queue WHERE status = 'processing'")
    processing_count = c.fetchone()[0]
    
    c.execute("SELECT COUNT(*) FROM cache_queue WHERE status = 'failed'")
    failed_count = c.fetchone()[0]
    
    conn.close()
    
    return jsonify({
        "cache_size_gb": round(bytes_to_gb(cache_size), 2),
        "max_size_gb": CACHE_MAX_SIZE_GB,
        "usage_percent": round((cache_size / max_size) * 100, 1) if max_size > 0 else 0,
        "cached_items": cached_count,
        "active_sessions": active_sessions,
        "queue_size": queue_size,
        "processing": processing_count,
        "failed_jobs": failed_count,
        "session_protect_minutes": SESSION_PROTECT_MINUTES
    })


@app.route("/queue", methods=["GET"])
def list_queue():
    """List cache queue history."""
    conn = get_db()
    c = conn.cursor()
    
    c.execute("""
        SELECT plex_key, folder_name, media_type, priority, status, 
               created_at, started_at, completed_at, error
        FROM cache_queue
        ORDER BY 
            CASE status WHEN 'processing' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
            created_at DESC
        LIMIT 50
    """)
    
    jobs = []
    for row in c.fetchall():
        jobs.append(dict(row))
    
    conn.close()
    return jsonify({"jobs": jobs, "count": len(jobs)})


@app.route("/cached", methods=["GET"])
def list_cached():
    """List all cached items."""
    conn = get_db()
    c = conn.cursor()
    
    c.execute("""
        SELECT plex_key, title, media_type, folder_name, size_bytes, last_watched, watch_progress, watch_count
        FROM media_items WHERE is_cached = 1
        ORDER BY last_watched DESC
    """)
    
    items = []
    for row in c.fetchall():
        item = dict(row)
        item["size_gb"] = round(bytes_to_gb(item["size_bytes"]), 2)
        item["protected"] = is_session_protected(row["plex_key"])
        items.append(item)
    
    conn.close()
    return jsonify({"items": items, "count": len(items)})


def get_or_create_session_key(plex_key, player):
    """
    Get a stable session key for the player/media combination.
    Falls back to plex_key if Player.uuid is not available.
    When no uuid, uses plex_key directly to avoid orphaned sessions.
    """
    player_uuid = player.get("uuid", "")
    if player_uuid:
        return player_uuid
    return f"plex-{plex_key}"


def update_session_by_key_or_plex(session_key, plex_key, state):
    """Update session by session_key, falling back to plex_key if not found."""
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        UPDATE active_sessions SET last_update = CURRENT_TIMESTAMP, state = ?
        WHERE session_key = ?
    """, (state, session_key))
    if c.rowcount == 0:
        c.execute("""
            UPDATE active_sessions SET last_update = CURRENT_TIMESTAMP, state = ?
            WHERE plex_key = ?
        """, (state, plex_key))
    conn.commit()
    conn.close()


def delete_session_by_key_or_plex(session_key, plex_key):
    """Delete session by session_key, falling back to plex_key if not found."""
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM active_sessions WHERE session_key = ?", (session_key,))
    if c.rowcount == 0:
        c.execute("DELETE FROM active_sessions WHERE plex_key = ?", (plex_key,))
    conn.commit()
    conn.close()


@app.route("/webhook", methods=["POST"])
def plex_webhook():
    """Handle Plex webhooks."""
    try:
        if request.content_type and "multipart/form-data" in request.content_type:
            payload_str = request.form.get("payload", "{}")
        else:
            payload_str = request.data.decode("utf-8")
        
        payload = json.loads(payload_str)
        
        event = payload.get("event", "")
        metadata = payload.get("Metadata", {})
        player = payload.get("Player", {})
        
        media_type = metadata.get("type", "").lower()
        title = metadata.get("title", "Unknown")
        plex_key = metadata.get("ratingKey", "")
        grandparent_title = metadata.get("grandparentTitle", "")
        
        if media_type == "episode" and grandparent_title:
            title = f"{grandparent_title} - {title}"
        
        session_key = get_or_create_session_key(plex_key, player)
        
        file_path = None
        if "Media" in metadata and metadata["Media"]:
            parts = metadata["Media"][0].get("Part", [])
            if parts:
                file_path = parts[0].get("file", "")
        
        folder_name = extract_folder_name(file_path, media_type) if file_path else None
        
        app.logger.info(f"Webhook: {event} - {title} ({media_type}) - session: {session_key[:20]}...")
        
        if event == "media.play":
            conn = get_db()
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO active_sessions (session_key, plex_key, media_type, started_at, last_update, state)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'playing')
            """, (session_key, plex_key, media_type))
            conn.commit()
            conn.close()
            
            if folder_name and not is_already_cached(folder_name, media_type):
                queue_cache_job(plex_key, folder_name, media_type, title, priority=1)
        
        elif event == "media.resume":
            update_session_by_key_or_plex(session_key, plex_key, 'playing')
        
        elif event == "media.pause":
            update_session_by_key_or_plex(session_key, plex_key, 'paused')
        
        elif event == "media.stop":
            view_offset = metadata.get("viewOffset", 0)
            duration = metadata.get("duration", 1)
            progress = view_offset / duration if duration > 0 else 0
            
            delete_session_by_key_or_plex(session_key, plex_key)
            
            conn = get_db()
            c = conn.cursor()
            c.execute("""
                UPDATE media_items 
                SET last_watched = CURRENT_TIMESTAMP, 
                    watch_progress = ?,
                    watch_count = watch_count + 1
                WHERE plex_key = ?
            """, (progress, plex_key))
            conn.commit()
            conn.close()
            
            app.logger.info(f"Stopped: {title} at {progress*100:.0f}% progress")
        
        elif event == "media.scrobble":
            conn = get_db()
            c = conn.cursor()
            c.execute("""
                UPDATE media_items 
                SET watch_progress = 1.0, watch_count = watch_count + 1
                WHERE plex_key = ?
            """, (plex_key,))
            conn.commit()
            conn.close()
        
        return jsonify({"status": "ok"})
        
    except Exception as e:
        app.logger.error(f"Webhook error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/cache", methods=["POST"])
def manual_cache():
    """Manually trigger caching for content."""
    data = request.get_json() or {}
    folder_name = data.get("folder_name")
    media_type = data.get("type", "movie")
    
    if not folder_name:
        return jsonify({"error": "folder_name required"}), 400
    
    if is_already_cached(folder_name, media_type):
        return jsonify({"status": "already_cached", "folder": folder_name})
    
    queue_cache_job(f"manual-{folder_name}", folder_name, media_type, folder_name, priority=3)
    return jsonify({"status": "queued", "folder": folder_name})


@app.route("/evict", methods=["POST"])
def manual_evict():
    """Manually evict content from cache."""
    data = request.get_json() or {}
    folder_name = data.get("folder_name")
    media_type = data.get("type", "movie")
    
    if not folder_name:
        return jsonify({"error": "folder_name required"}), 400
    
    cache_path = Path(CACHE_PATHS.get(media_type, CACHE_PATHS["movie"])) / folder_name
    
    if not cache_path.exists():
        return jsonify({"error": "not cached"}), 404
    
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT plex_key FROM media_items WHERE folder_name = ?", (folder_name,))
    row = c.fetchone()
    
    if row and is_session_protected(row["plex_key"]):
        conn.close()
        return jsonify({"error": "protected by active session"}), 409
    
    try:
        shutil.rmtree(cache_path)
        c.execute("UPDATE media_items SET is_cached = 0, cached_at = NULL WHERE folder_name = ?", (folder_name,))
        conn.commit()
        conn.close()
        return jsonify({"status": "evicted", "folder": folder_name})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    ensure_initialized()
    port = int(os.getenv("PORT", "5055"))
    app.run(host="0.0.0.0", port=port, debug=False)
