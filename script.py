import os
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
load_dotenv()
# ============================================================
# 1. DATABASE SETUP
# ============================================================
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "StrongPassword123")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "10.73.74.37")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "event_corr_canada")

SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ============================================================
# 2. DEFINE MODELS 
# ============================================================
class Correlation(Base):
    __tablename__ = 'correlations'
    correlation_id = Column(String(50), primary_key=True)
    rca = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)
    affected_apps = Column(ARRAY(String), nullable=False)
    alerts = Column(Integer, default=0)
    correlated_at = Column(DateTime, default=datetime.utcnow)
    root_cause_event_id = Column(Integer) 
    root_cause_tier = Column(String(100))
    root_cause_name = Column(String(255))
    rca_score = Column(Integer, default=0)
    root_cause_confidence = Column(Integer, default=95)
    organization = Column(String(255))
    journey = Column(String(255))
    cascade_chain = Column(JSONB)

class EventLog(Base):
    __tablename__ = 'event_logs'
    id = Column(Integer, primary_key=True)
    organization = Column(String(150))
    application = Column(String(150))
    journey = Column(String(150))
    step = Column(String(150))
    action = Column(String(150))
    tier = Column(String(100))
    layer = Column(String(150))       
    source = Column(String(150))
    event_timestamp = Column(DateTime) 
    eventname = Column(String(150))
    message = Column(String)
    severity = Column(String(20))
    corelation_id = Column(String(50), ForeignKey('correlations.correlation_id'))

class ApplicationMetrics(Base):
    __tablename__ = 'application_metrics'

    id = Column(Integer, primary_key=True, autoincrement=True)
    application = Column(String(150))
    journey = Column(String(150))
    step = Column(String(150))
    action = Column(String(150))
    technical_tier = Column(String(100))
    layer = Column(String(150))
    log_sources = Column(String) # Stored as stringified JSON or JSONB
    source_tag = Column(String(150))

# ============================================================
# 3. FULL ALERT DATASET 
# ============================================================
RAW_DATA = [
  {"tier": "Presentation", "layer": "Digital Experience Monitor", "timestamp": "14:00:06", "eventname": "BackendCallResponseTimeHigh", "message": "PolicyRecalcAdapter response time degraded to 6200ms (baseline 400ms) — end-user impact on Benefit Recalculation Service", "severity": "critical", "source": "Dynatrace"},
  {"tier": "Presentation", "layer": "Digital Experience Monitor", "timestamp": "14:00:22", "eventname": "UserActionFailureRate", "message": "Endorsement submission failure rate 18% across 4,580 active sessions", "severity": "High", "source": "Dynatrace"},
  {"tier": "Presentation", "layer": "Digital Experience Monitor", "timestamp": "14:00:30", "eventname": "GatewayTimeoutSpike", "message": "504 Gateway Timeout responses spiked to 340/min at /api/endorsement/recalc", "severity": "High", "source": "Splunk"},
  {"tier": "Application", "layer": "Application Server", "timestamp": "14:23:18", "eventname": "ThreadPoolExhaustion", "message": "Thread pool exhaustion: 198/200 threads busy on managed server 'PAS_MS1'", "severity": "critical", "source": "AppDynamics"},
  {"tier": "Application", "layer": "Application Server", "timestamp": "14:23:45", "eventname": "HighResponseTimeDeviation", "message": "Average response time 5.2s exceeds baseline 400ms (13x deviation)", "severity": "High", "source": "AppDynamics"},
  {"tier": "Application", "layer": "Business Rules Engine", "timestamp": "14:24:10", "eventname": "RuleExecutionTimeout", "message": "Rule execution timeout: 4.8s per invocation (threshold: 500ms), rule set: 'EndorsementBenefitRules'", "severity": "critical", "source": "AppDynamics"},
  {"tier": "Application", "layer": "Application Server", "timestamp": "14:24:02", "eventname": "RejectedExecutionException", "message": "SEVERE: java.util.concurrent.RejectedExecutionException — 342 occurrences in 5 min", "severity": "High", "source": "Splunk"},
  {"tier": "Application", "layer": "Application Server", "timestamp": "14:23:55", "eventname": "PoolWaitTimeout", "message": "WARN: JDBC connection pool 'CanaraPolicyDS' wait timeout exceeded", "severity": "Medium", "source": "Splunk"},
  {"tier": "Application", "layer": "Business Rules Engine", "timestamp": "14:24:15", "eventname": "WorkingMemoryExceeded", "message": "WARN: Working memory exceeded 512MB threshold — rule session leak suspected", "severity": "Medium", "source": "Splunk"},
  {"tier": "Integration", "layer": "Enterprise Service Bus", "timestamp": "14:23:22", "eventname": "ProcessEngineStuckThrea", "message": "Process engine stuck thread count: 47/50 — process 'PolicyEndorsement.bwp' backlogged", "severity": "critical", "source": "TIBCO Hawk"},
  {"tier": "Integration", "layer": "Enterprise Service Bus", "timestamp": "14:23:35", "eventname": "HighQueueDepth", "message": "Queue depth 'PAS.ENDORSEMENT.REQ': 2,340 messages (threshold: 500)", "severity": "High", "source": "TIBCO Hawk"},
  {"tier": "Integration", "layer": "Enterprise Service Bus", "timestamp": "14:23:40", "eventname": "BWProcessTimeout", "message": "ERROR: [BW-PROCESS-TIMEOUT] Process 'PolicyEndorsement.bwp' activity 'InvokeOracleDB' timed out after 30s", "severity": "High", "source": "Splunk"},
  {"tier": "Integration", "layer": "Enterprise Service Bus", "timestamp": "14:24:00", "eventname": "ESBBackendCallLatency", "message": "ESB backend call latency to Oracle DB: 3,200ms (baseline: 45ms)", "severity": "Medium", "source": "AppDynamics"},
  {"tier": "Data", "layer": "Primary Database", "timestamp": "14:23:05", "eventname": "RACNodeInstanceFailover", "message": "RAC Node-2 instance failover detected at 14:23:05 — unplanned (CHG0045231 maintenance overrun)", "severity": "critical", "source": "Oracle Enterprise Manager"},
  {"tier": "Data", "layer": "Primary Database", "timestamp": "14:23:12", "eventname": "ActiveSessionsSpike", "message": "Active sessions spike: 340-890 on Node-1 (absorbing Node-2 load)", "severity": "critical", "source": "Oracle Enterprise Manager"},
  {"tier": "Data", "layer": "Primary Database", "timestamp": "14:23:08", "eventname": "TNSListenerNoHandler", "message": "ORA-12516: TNS listener could not find available handler with matching protocol stack", "severity": "critical", "source": "Splunk"},
  {"tier": "Data", "layer": "Primary Database", "timestamp": "14:23:45", "eventname": "TNSConnectionRejections", "message": "ORA-12519: TNS no appropriate service handler found — 230 connection rejections in 2 min", "severity": "High", "source": "Splunk"},
  {"tier": "Data", "layer": "Primary Database", "timestamp": "14:23:50", "eventname": "HighPoolWaitTime", "message": "Connection pool wait time: 4,200ms (baseline: 15ms) — pool 'CanaraPolicyDS' exhausted at maxActive=200", "severity": "High", "source": "AppDynamics Database"},
  {"tier": "Data", "layer": "Cache Layer", "timestamp": "14:24:30", "eventname": "HighCacheMissRate", "message": "Cache miss rate: 67% (baseline: 12%) — stale policy data after DB failover", "severity": "Medium", "source": "Redis Insight"},
  {"tier": "Data", "layer": "Cache Layer", "timestamp": "14:24:35", "eventname": "HighMemoryFragmentation", "message": "Memory fragmentation ratio: 1.8 (threshold: 1.5)", "severity": "Low", "source": "Grafana"},
  {"tier": "Infrastructure", "layer": "Compute / Virtualization", "timestamp": "14:25:00", "eventname": "HighCPUReadyTime", "message": "CPU ready time: 12ms (threshold: 5ms) on ESXi host 'esxi-prod-03'", "severity": "Medium", "source": "SolarWinds Server & Application Monitor"},
  {"tier": "Infrastructure", "layer": "Compute / Virtualization", "timestamp": "14:25:10", "eventname": "VMMemoryBalloonActive", "message": "VM memory balloon active: 'weblogic-pas-03' at 92% — host memory contention", "severity": "Medium", "source": "VMware vCenter"}
]

APPLICATION_METRICS_DATA = [
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Presentation",
        "layer": "Digital Experience Monitor",
        "log_sources": ["Dynatrace", "Splunk"],
        "source_tag": "Dynatrace SaaS"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Presentation",
        "layer": "Load Balancer",
        "log_sources": ["F5 iHealth"],
        "source_tag": "F5 BIG-IP LTM"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Application",
        "layer": "Application Server",
        "log_sources": ["AppDynamics", "Splunk"],
        "source_tag": "Oracle WebLogic 14c"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Application",
        "layer": "Business Rules Engine",
        "log_sources": ["AppDynamics", "Splunk"],
        "source_tag": "Drools 8.x (Red Hat Decision Manager)"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Integration",
        "layer": "Enterprise Service Bus",
        "log_sources": ["TIBCO Hawk", "Splunk", "AppDynamics"],
        "source_tag": "TIBCO BusinessWorks 6.x"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Data",
        "layer": "Primary Database",
        "log_sources": ["Oracle Enterprise Manager", "Splunk", "AppDynamics Database"],
        "source_tag": "Oracle RAC 19c (2-node)"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Data",
        "layer": "Document Management",
        "log_sources": ["FileNet Admin Console"],
        "source_tag": "IBM FileNet P8 5.5"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Data",
        "layer": "Cache Layer",
        "log_sources": ["Redis Insight", "Grafana"],
        "source_tag": "Redis Cluster 7.2"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Infrastructure",
        "layer": "Compute / Virtualization",
        "log_sources": [
            "SolarWinds Server & Application Monitor",
            "VMware vCenter"
        ],
        "source_tag": "VMware vSphere 8.0"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Infrastructure",
        "layer": "Storage",
        "log_sources": ["NetApp OnCommand"],
        "source_tag": "NetApp ONTAP 9.14 (SAN)"
    },
    {
        "application": "Policy Administration System",
        "journey": "Endorsement Processing",
        "step": "Eligibility & Compliance",
        "action": "Benefit Recalculation Service",
        "tecnical_tier": "Infrastructure",
        "layer": "Network",
        "log_sources": ["SolarWinds NPM"],
        "source_tag": "Cisco Nexus 9300"
    }
]
def seed_application_metrics():
    session = SessionLocal()

    try:
        metrics_records = []

        for item in APPLICATION_METRICS_DATA:
            metrics_records.append(
                ApplicationMetrics(
                    application=item["application"],
                    journey=item["journey"],
                    step=item["step"],
                    action=item["action"],
                    technical_tier=item["tecnical_tier"],
                    layer=item["layer"],
                    log_sources=item["log_sources"],
                    source_tag=item["source_tag"]
                )
            )

        session.add_all(metrics_records)
        session.commit()

        print(
            f"Successfully inserted {len(metrics_records)} records into 'application_metrices'"
        )

    except Exception as e:
        session.rollback()
        print(f"Failed to insert application metrics: {e}")

    finally:
        session.close()
# ============================================================
# 4. EXECUTION
# ============================================================
def seed_database():
    print("Checking tables and ensuring schema exists (without dropping data)...")
    Base.metadata.create_all(bind=engine)
    
    session = SessionLocal()
    
    try:
        # Using the exact date shown in your UI mockups
        target_date = "2026-07-21"
        records_to_insert = []
        
        for item in RAW_DATA:
            # Combine the fixed date with the timestamp from the array to create a full DateTime object
            full_datetime_str = f"{target_date} {item['timestamp']}"
            dt_obj = datetime.strptime(full_datetime_str, "%Y-%m-%d %H:%M:%S")
            
            log = EventLog(
                organization="Canara Life Insurance",
                application="Policy Administration System",
                journey="Endorsement Processing",
                step="Eligibility & Compliance",
                action="Benefit Recalculation Service",
                tier=item["tier"],
                layer=item["layer"],
                source=item["source"],
                event_timestamp=dt_obj,
                eventname=item["eventname"],
                message=item["message"],
                severity=item["severity"]
            )
            records_to_insert.append(log)
            
        session.add_all(records_to_insert)
        session.commit()
        print(f"Successfully appended {len(records_to_insert)} new alerts to 'event_logs'!")
        
    except Exception as e:
        session.rollback()
        print(f"Failed to seed database: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    seed_database()

    seed_application_metrics()
