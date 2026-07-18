from sqlalchemy import Column, String, Integer, Date, TIMESTAMP, Text, PrimaryKeyConstraint
from sqlalchemy.orm import declarative_base
from sqlalchemy import Identity
Base = declarative_base()
SCHEMA = "ISMART"

class ZincPipelineIncidentDetails(Base):
    __tablename__  = "ZINC_PIPELINE_INCIDENT_DETAILS"
    __table_args__ = {"schema": SCHEMA}

    # Chosen primary key (table has none declared explicitly)
    sys_id               = Column("SYS_ID", String(50), primary_key=True)

    ticket_number        = Column("TICKET_NUMBER", String(2000))
    state                = Column("STATE", String(2000))
    assigned_to          = Column("ASSIGNED_TO", String(2000))
    opened_at            = Column("OPENED_AT", TIMESTAMP)           # TIMESTAMP(6)
    short_desc           = Column("SHORT_DESC", String(2000))
    description          = Column("DESCRIPTION", String(3500))
    caller               = Column("CALLER", String(2000))
    email                = Column("EMAIL", String(2000))
    assignment_group     = Column("ASSIGNMENT_GROUP", String(2000))
    priority             = Column("PRIORITY", String(2000))
    config_item          = Column("CONFIG_ITEM", String(2000))
    created_at           = Column("CREATED_AT", TIMESTAMP)          # DEFAULT systimestamp (DB-side)
    last_updated_at      = Column("LAST_UPDATED_AT", TIMESTAMP)     # DEFAULT systimestamp (DB-side)
    action_status        = Column("ACTION_STATUS", String(100))
    pr_number            = Column("PR_NUMBER", String(100))
    dq_status            = Column("DQ_STATUS", String(100))

    issue_category       = Column("ISSUE_CATEGORY", String(3500))
    issue_sub_category   = Column("ISSUE_SUB_CATEGORY", String(3500))
    rca_category         = Column("RCA_CATEGORY", String(3500))
    rca_sub_category     = Column("RCA_SUB_CATEGORY", String(3500))
    rca_analysis         = Column("RCA_ANALYSIS", Text)             # CLOB

    resolution_category      = Column("RESOLUTION_CATEGORY", String(3500))
    resolution_sub_category  = Column("RESOLUTION_SUB_CATEGORY", String(3500))
    resolution_steps         = Column("RESOLUTION_STEPS", Text)     # CLOB


class ZincPipelineIncidentFlow(Base):
    __tablename__  = "ZINC_PIPELINE_INCIDENT_FLOW"
    __table_args__ = (
        # Composite PK since table has none; adjust if you add a real PK later
        PrimaryKeyConstraint("TICKET_NUMBER", "STEP", "CREATE_TIMESTAMP", name="PK_ZPIF_COMPOSITE"),
        {"schema": SCHEMA},
    )

    ticket_number   = Column("TICKET_NUMBER", String(100))
    step            = Column("STEP", String(3500))
    agent_name      = Column("AGENT_NAME", String(3500))
    agent_status    = Column("AGENT_STATUS", String(100))
    html_content    = Column("HTML_CONTENT", Text)                  # CLOB
    create_ts       = Column("CREATE_TIMESTAMP", TIMESTAMP)         # TIMESTAMP(6) DEFAULT systimestamp
    logpath         = Column("LOGPATH", String(3500))


class ZincPipelineSplunkQuery(Base):
    __tablename__  = "ZINC_PIPELINE_SPLUNK_QUERY"
    __table_args__ = {"schema": SCHEMA}

    id             = Column("ID", Integer, primary_key=True)
    query_name     = Column("QUERY_NAME", String(100))
    splunk_query   = Column("SPLUNK_QUERY", Text)                   # CLOB
    created_at     = Column("CREATED_AT", Date)                     # DEFAULT SYSDATE
    issue_type     = Column("ISSUE_TYPE", String(3500))
    issue_sub_type = Column("ISSUE_SUB_TYPE", String(3500))         # ← was missing
    application    = Column("APPLICATION", String(3500))



class ZincPipelinePrompts(Base):
    __tablename__  = "ZINC_PIPELINE_PROMPTS"
    __table_args__ = {"schema": SCHEMA}
 
    id          = Column("ID", String(100), primary_key=True)
    name        = Column("NAME", String(1000))
    version     = Column("VERSION", String(1000))
    template    = Column("TEMPLATE", Text)          # CLOB
    description = Column("DESCRIPTION", Text)       # CLOB

class ZincPipelineServerCedentials(Base):
    __tablename__  = "ZINC_PIPELINE_SERVER_CREDENTIALS"
    __table_args__ = {"schema": SCHEMA}
 
    id          = Column("ID", String(100), primary_key=True)
    server_id   = Column("SERVER_ID", String(1000))
    credential  = Column("CREDENTIAL", String(1000))          
    is_active   = Column("IS_ACTIVE", String(1))

class ZincPipelineIncidentAdminSettings(Base):
    __tablename__ = "ZINC_PIPELINE_INCIDENT_ADMIN_SETTINGS"
    __table_args__ = {"schema": SCHEMA}
    R_ID= Column("R_ID",Integer, Identity(start=2,increment=1),primary_key=True)
    llm_name = Column("LLM_NAME", String(20))
    llm_username = Column("LLM_USERNAME", String(50), nullable=False)
    llm_password = Column("LLM_PASSWORD", String(50), nullable=False)
    sn_username = Column("SN_USERNAME", String(50), nullable=False)
    sn_password = Column("SN_PASSWORD", String(50), nullable=False)
    sn_url = Column("SN_URL", String(200), nullable=False)
    oracle_user = Column("ORACLE_USER", String(50), nullable=False)
    oracle_password = Column("ORACLE_PASSWORD", String(50), nullable=False)
    oracle_servicename = Column("ORACLE_SERVICENAME", String(50), nullable=False)
    splunk_username = Column("SPLUNK_USERNAME", String(50), nullable=False)
    splunk_password = Column("SPLUNK_PASSWORD", String(50), nullable=False)
    splunk_url = Column("SPLUNK_URL", String(200))

class ZincPipelineIncidentAdminAccAppConfig(Base):
    __tablename__ = "ZINC_PIPELINE_INCIDENT_ADMIN_ACC_APP_CONFIG"
    __table_args__ = {"schema": SCHEMA}
 
    account_name = Column("ACCOUNT_NAME", String(3500),primary_key=True)
    application_name = Column("APPLICATION_NAME", String(3500),primary_key=True)
    auto_heal = Column("AUTO_HEAL", String(100))
    ticket_number = Column("TICKET_NUMBER", String(3500))
    server_username = Column("SERVER_USERNAME", String(3500))
    server_password = Column("SERVER_PASSWORD", String(3500))
    server_hostname = Column("SERVER_HOSTNAME", String(3500))
    splunk_choice   = Column("SPLUNK_CHOICE", String(1))
