"""Query Performance Testing Script

Tests query execution times and cache hit rates to measure optimization improvements.
"""

import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List
from sqlalchemy import select, func
from contextlib import contextmanager

from services.db_service import db_service
from services.cache_service import cache_service
from models.storage import StorageMetric, StorageAlert
from models.marketplace import MarketplaceApp, DeployedApp
from models.agent import Agent, AgentTask, AgentConversation
from models.google_integration import GoogleServiceStatus, CalendarAutomation
from models.deployment import Deployment
from models.nas import NASMount, NASBackupJob

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@contextmanager
def timer(operation: str):
    """Context manager to time operations"""
    start = time.time()
    yield
    elapsed = (time.time() - start) * 1000  # Convert to ms
    logger.info(f"{operation}: {elapsed:.2f}ms")
    return elapsed


class QueryPerformanceTester:
    """Test query performance and cache effectiveness"""
    
    def __init__(self):
        self.results: Dict[str, Dict] = {}
    
    def test_storage_metrics_query(self):
        """Test storage metrics query performance"""
        logger.info("\n=== Testing Storage Metrics Query ===")
        
        if not db_service.is_available:
            logger.error("Database not available")
            return
        
        # Test without cache
        with timer("Storage metrics (no cache)") as no_cache_time:
            with db_service.get_session() as session:
                cutoff_date = datetime.utcnow() - timedelta(days=7)
                metrics = session.execute(
                    select(StorageMetric)
                    .where(StorageMetric.timestamp >= cutoff_date)
                    .order_by(StorageMetric.timestamp.desc())
                ).scalars().all()
                count = len(metrics)
        
        logger.info(f"Retrieved {count} metrics")
        
        # Test with cache (first call - miss)
        cache_key = 'storage:metrics:test'
        cache_service.delete(cache_key)
        
        with timer("Storage metrics (cache miss)"):
            cached = cache_service.get(cache_key)
            if not cached:
                with db_service.get_session() as session:
                    metrics = session.execute(
                        select(StorageMetric)
                        .where(StorageMetric.timestamp >= cutoff_date)
                        .order_by(StorageMetric.timestamp.desc())
                    ).scalars().all()
                    data = [m.to_dict() for m in metrics]
                    cache_service.set(cache_key, data, ttl=300)
        
        # Test with cache (second call - hit)
        with timer("Storage metrics (cache hit)"):
            cached = cache_service.get(cache_key)
        
        logger.info(f"Cache hit: {cached is not None}")
        
        self.results['storage_metrics'] = {
            'count': count,
            'cache_available': cache_service.is_available
        }
    
    def test_marketplace_apps_query(self):
        """Test marketplace apps query performance"""
        logger.info("\n=== Testing Marketplace Apps Query ===")
        
        if not db_service.is_available:
            logger.error("Database not available")
            return
        
        # Test without cache
        with timer("Marketplace apps (no cache)"):
            with db_service.get_session() as session:
                apps = session.execute(
                    select(MarketplaceApp)
                    .order_by(MarketplaceApp.popularity.desc())
                ).scalars().all()
                count = len(apps)
        
        logger.info(f"Retrieved {count} apps")
        
        # Test with cache
        cache_key = 'marketplace:apps:test'
        cache_service.delete(cache_key)
        
        with timer("Marketplace apps (cache miss)"):
            cached = cache_service.get(cache_key)
            if not cached:
                with db_service.get_session() as session:
                    apps = session.execute(
                        select(MarketplaceApp)
                        .order_by(MarketplaceApp.popularity.desc())
                    ).scalars().all()
                    data = [a.to_dict() for a in apps]
                    cache_service.set(cache_key, data, ttl=3600)
        
        with timer("Marketplace apps (cache hit)"):
            cached = cache_service.get(cache_key)
        
        logger.info(f"Cache hit: {cached is not None}")
        
        self.results['marketplace_apps'] = {
            'count': count,
            'cache_available': cache_service.is_available
        }
    
    def test_agent_tasks_query(self):
        """Test agent tasks query performance"""
        logger.info("\n=== Testing Agent Tasks Query ===")
        
        if not db_service.is_available:
            logger.error("Database not available")
            return
        
        # Test without cache
        with timer("Agent tasks (no cache)"):
            with db_service.get_session() as session:
                tasks = session.execute(
                    select(AgentTask)
                    .where(AgentTask.status.in_(['pending', 'in_progress']))
                    .order_by(AgentTask.priority.desc(), AgentTask.created_at.desc())
                ).scalars().all()
                count = len(tasks)
        
        logger.info(f"Retrieved {count} tasks")
        
        # Test with eager loading
        with timer("Agent tasks (with eager loading)"):
            with db_service.get_session() as session:
                from sqlalchemy.orm import joinedload
                tasks = session.execute(
                    select(AgentTask)
                    .options(joinedload(AgentTask.agent))
                    .where(AgentTask.status.in_(['pending', 'in_progress']))
                    .order_by(AgentTask.priority.desc(), AgentTask.created_at.desc())
                ).unique().scalars().all()
        
        logger.info(f"Retrieved {len(tasks)} tasks with eager loading")
        
        self.results['agent_tasks'] = {
            'count': count,
            'cache_available': cache_service.is_available
        }
    
    def test_pagination_performance(self):
        """Test pagination query performance"""
        logger.info("\n=== Testing Pagination Performance ===")
        
        if not db_service.is_available:
            logger.error("Database not available")
            return
        
        # Test .all() query
        with timer("Storage alerts (all)"):
            with db_service.get_session() as session:
                alerts = session.execute(
                    select(StorageAlert)
                ).scalars().all()
                all_count = len(alerts)
        
        logger.info(f"Retrieved {all_count} alerts with .all()")
        
        # Test paginated query
        page = 1
        per_page = 50
        
        with timer("Storage alerts (paginated)"):
            with db_service.get_session() as session:
                alerts = session.execute(
                    select(StorageAlert)
                    .offset((page - 1) * per_page)
                    .limit(per_page)
                ).scalars().all()
                page_count = len(alerts)
        
        logger.info(f"Retrieved {page_count} alerts with pagination")
        
        self.results['pagination'] = {
            'all_count': all_count,
            'page_count': page_count
        }
    
    def test_index_performance(self):
        """Test query performance with indexes"""
        logger.info("\n=== Testing Index Performance ===")
        
        if not db_service.is_available:
            logger.error("Database not available")
            return
        
        # Test indexed column query
        with timer("Query with indexed status"):
            with db_service.get_session() as session:
                tasks = session.execute(
                    select(AgentTask)
                    .where(AgentTask.status == 'pending')
                ).scalars().all()
                count = len(tasks)
        
        logger.info(f"Retrieved {count} pending tasks")
        
        # Test compound index query
        with timer("Query with compound index (status + priority)"):
            with db_service.get_session() as session:
                tasks = session.execute(
                    select(AgentTask)
                    .where(AgentTask.status == 'pending')
                    .order_by(AgentTask.priority.desc())
                ).scalars().all()
        
        # Test timestamp range query
        with timer("Query with timestamp index"):
            with db_service.get_session() as session:
                cutoff = datetime.utcnow() - timedelta(days=7)
                metrics = session.execute(
                    select(StorageMetric)
                    .where(StorageMetric.timestamp >= cutoff)
                ).scalars().all()
                metrics_count = len(metrics)
        
        logger.info(f"Retrieved {metrics_count} metrics from last 7 days")
        
        self.results['index_performance'] = {
            'pending_tasks': count,
            'recent_metrics': metrics_count
        }
    
    def test_cache_hit_rate(self, iterations: int = 10):
        """Test cache hit rate"""
        logger.info(f"\n=== Testing Cache Hit Rate ({iterations} iterations) ===")
        
        if not cache_service.is_available:
            logger.warning("Cache not available, skipping hit rate test")
            return
        
        cache_key = 'test:hit_rate'
        test_data = {'test': 'data', 'timestamp': datetime.utcnow().isoformat()}
        
        # Set cache
        cache_service.set(cache_key, test_data, ttl=60)
        
        hits = 0
        misses = 0
        
        for i in range(iterations):
            start = time.time()
            result = cache_service.get(cache_key)
            elapsed = (time.time() - start) * 1000
            
            if result:
                hits += 1
            else:
                misses += 1
                cache_service.set(cache_key, test_data, ttl=60)
            
            logger.debug(f"Iteration {i+1}: {'HIT' if result else 'MISS'} ({elapsed:.2f}ms)")
        
        hit_rate = (hits / iterations) * 100
        logger.info(f"Cache hit rate: {hit_rate:.1f}% ({hits}/{iterations})")
        
        # Clean up
        cache_service.delete(cache_key)
        
        self.results['cache_hit_rate'] = {
            'hits': hits,
            'misses': misses,
            'rate': hit_rate
        }
    
    def run_all_tests(self):
        """Run all performance tests"""
        logger.info("=" * 60)
        logger.info("QUERY PERFORMANCE TEST SUITE")
        logger.info("=" * 60)
        
        self.test_storage_metrics_query()
        self.test_marketplace_apps_query()
        self.test_agent_tasks_query()
        self.test_pagination_performance()
        self.test_index_performance()
        self.test_cache_hit_rate()
        
        logger.info("\n" + "=" * 60)
        logger.info("TEST RESULTS SUMMARY")
        logger.info("=" * 60)
        
        for test_name, results in self.results.items():
            logger.info(f"\n{test_name}:")
            for key, value in results.items():
                logger.info(f"  {key}: {value}")
        
        return self.results


if __name__ == '__main__':
    tester = QueryPerformanceTester()
    results = tester.run_all_tests()
    
    logger.info("\n" + "=" * 60)
    logger.info("Performance testing complete!")
    logger.info("=" * 60)
