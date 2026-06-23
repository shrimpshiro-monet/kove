# monet/observability/metrics.py
from prometheus_client import Counter, Histogram, Gauge

ENGINE_RENDERS = Counter(
    "monet_engine_renders_total",
    "Total engine renders", ["engine", "outcome"]
)
ENGINE_DURATION = Histogram(
    "monet_engine_render_seconds",
    "Engine render duration in seconds", ["engine"],
    buckets=[1, 2, 5, 10, 30, 60, 120, 300]
)
ACTIVE_SESSIONS = Gauge("monet_active_sessions", "Active editing sessions")
PLAN_ACTIONS = Histogram(
    "monet_plan_actions_count",
    "Number of actions in generated plans",
    buckets=[1, 3, 5, 10, 20, 50]
)
