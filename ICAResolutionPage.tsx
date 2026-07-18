import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useGetDashboardJobsQuery } from "@/application/batch-health-analyzer/api/apiSlice";
import {
  CheckCircle2,
  Database,
  FileCog,
  Filter,
  History,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Zap,
  HardDrive,
  FolderSync,
  Trash2
} from "lucide-react";
import clsx from "clsx";

import {
  type JobStatus,
  type RcaCategory,
  getOperationalTimingForJob,
  getRcaDetails,
  type DashboardJobsResponse,
  mapDashboardJobToFailedJob,
} from "@/application/batch-health-analyzer/shared/agentWorkflowModel";

import { SlaCountdownBadge } from "@/application/batch-health-analyzer/shared/slaCountdownBatch";

const RERUN_WITH_RCA_STORAGE_KEY = "bha:rerun-with-rca";
const RERUN_WITH_RCA_EXPIRY_MINUTES = 2;


interface RerunWithRcaRecord {
  readonly jobId: string;
  readonly rca: RcaCategory;
  readonly completedAt: string;
  readonly expiresAt: string;
  readonly label: string;
  readonly choiceId?: string;
  readonly workflowStatus?: JobStatus;
  readonly workflowStage?: "fileWatcher" | "executor";
}

interface ChoiceItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: React.ComponentType<{ className?: string }>;

  readonly riskLevel?: string;
  readonly riskColor?: string;
  readonly badge: string;
  readonly score: string;

  // Used for dynamic choice ranking
  readonly baseConfidence?: number;


  readonly frequency: string;

  readonly avgTat?: string;
  readonly avgTatColor?: string;

  

  

  readonly fpmc?: string;
  readonly fpmcColor?: string;

  

  readonly explanation: string;
  readonly riskContext: string;

  readonly cca?: string;
  readonly baseMatch?: string;
  readonly sim?: string;
  readonly gcv?: string;
  readonly gcvColor?: string;
  readonly crri?: string;
  readonly peakExecutionRisk?: string;
  readonly peakRiskColor?: string;

  readonly nudgeSignals?: {
    readonly dtw?: {
      readonly score: number;
      readonly label: string;
      readonly weight: number;
    };
    readonly dfs?: {
      readonly score: number;
      readonly label: string;
      readonly weight: number;
    };
    readonly fpmc?: {
      readonly score: number;
      readonly label: string;
      readonly weight: number;
    };
    readonly uri?: {
      readonly score: number;
      readonly label: string;
      readonly weight: number;
    };
    readonly fitScore?: string;
    readonly rationale?: string;
  };

  readonly pipeline: readonly {
    readonly id: string;
    readonly title: string;
    readonly action: string;
    readonly scope: string;
  }[];
}

type DataFreshnessSensitivity = "High" | "Low";

interface RcaKpiDetails {
  readonly downstreamToleranceWindow: string;
  readonly dataFreshnessSensitivity: DataFreshnessSensitivity;
  readonly upstreamResponsivenessIndex: string;
  readonly upstreamResponseMinutes: number;
}
type BaseRcaKpiDetails = Omit<
  RcaKpiDetails,
  "dataFreshnessSensitivity"
>;

function isChoiceAvailableForFreshness(
  choiceId: string,
  sensitivity: DataFreshnessSensitivity,
): boolean {
  if (choiceId !== "choice-3") {
    return true;
  }

  return sensitivity === "Low";
}


function deriveDataFreshnessSensitivityFromIndex(
  jobIndex: number,
): DataFreshnessSensitivity {
  if (jobIndex < 0) {
    return "High";
  }

  return jobIndex % 3 === 0 ? "High" : "Low";
}



function getStoredRerunWithRcaRecords(): Record<string, RerunWithRcaRecord> {
  const raw = window.localStorage.getItem(RERUN_WITH_RCA_STORAGE_KEY);

  if (raw == null || raw.length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, RerunWithRcaRecord>;
  } catch {
    window.localStorage.removeItem(RERUN_WITH_RCA_STORAGE_KEY);
    return {};
  }
}

function getValidRerunWithRcaRecord(
  jobId: string,
): RerunWithRcaRecord | null {
  const records = getStoredRerunWithRcaRecords();
  const record = records[jobId];

  if (record == null) {
    return null;
  }

  const expiresAtMs = new Date(record.expiresAt).getTime();

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    const updatedRecords = { ...records };
    delete updatedRecords[jobId];

    window.localStorage.setItem(
      RERUN_WITH_RCA_STORAGE_KEY,
      JSON.stringify(updatedRecords),
    );

    return null;
  }

  return record;
}

function getExecutionPauseStepId(
  rca: RcaCategory,
  choiceId: string,
): string | null {
  const waitsForUpstreamRefeed =
    (rca === "Completeness" && choiceId === "choice-1") ||
    (rca === "Accuracy" && choiceId === "choice-2");

  return waitsForUpstreamRefeed ? "s3" : null;
}

const INCIDENT_TITLE_BY_RCA: Record<RcaCategory, string> = {
  Completeness: "file arrived but header block malformed",
  Accuracy: "duplicate transaction rows causing reconciliation break",
  Timeliness: "at risk of SLA breach – upstream Treasury Feed not received",
  Technical: "filesystem or tablespace exhausted causing batch failure",
  Unclassified: "failure requires orchestrator review",
};

function getIncidentTitleForRca(rcaCategory: RcaCategory): string {
  return INCIDENT_TITLE_BY_RCA[rcaCategory] ?? INCIDENT_TITLE_BY_RCA.Unclassified;
}

function getWorkflowStageForChoice(
  rca: RcaCategory,
  choiceId: string,
): {
  readonly label: string;
  readonly workflowStatus: JobStatus;
  readonly workflowStage: "fileWatcher" | "executor";
} {
  const waitsForUpstreamRefeed =
    (rca === "Completeness" && choiceId === "choice-1") ||
    (rca === "Accuracy" && choiceId === "choice-2");

  if (waitsForUpstreamRefeed) {
    return {
      label: "File Watcher active",
      workflowStatus: "Awaiting File",
      workflowStage: "fileWatcher",
    };
  }

  return {
    label: "Rerun with RCA",
    workflowStatus: "Auto-Fixed",
    workflowStage: "executor",
  };
}

function saveRerunWithRcaResult(
  jobId: string,
  rca: RcaCategory,
  choiceId: string,
): void {
  const existingRecords = getStoredRerunWithRcaRecords();

  const completedAt = new Date();
  const expiresAt = new Date(
    completedAt.getTime() + RERUN_WITH_RCA_EXPIRY_MINUTES * 60 * 1000,
  );

  const workflowOutcome = getWorkflowStageForChoice(rca, choiceId);

  existingRecords[jobId] = {
    jobId,
    rca,
    choiceId,
    completedAt: completedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    label: workflowOutcome.label,
    workflowStatus: workflowOutcome.workflowStatus,
    workflowStage: workflowOutcome.workflowStage,
  };

  window.localStorage.setItem(
    RERUN_WITH_RCA_STORAGE_KEY,
    JSON.stringify(existingRecords),
  );

  window.dispatchEvent(new Event("bha-rerun-with-rca-updated"));
}

const getExecutedSteps = (rcaCategory: RcaCategory) => {
  const rcaDetails = getRcaDetails(rcaCategory);

  return [
    {
      id: "batch-fetch",
      title: "Job issue fetch",
      description: "Fetch batch job issue",
      icon: Database,
      status: "Completed",
    },
    {
      id: "analyze-batch",
      title: "Analyze Log",
      description: "Analyze log patterns",
      icon: Search,
      status: "Completed",
    },
    {
      id: "problem-identification",
      title: "Problem identification",
      description: rcaDetails,
      icon: Lightbulb,
      status: "Completed",
    },
  ];
};

const RCA_KPI_DETAILS: Partial<
  Record<RcaCategory, BaseRcaKpiDetails>
> = {
  Accuracy: {
    downstreamToleranceWindow: "45 minutes",
    upstreamResponsivenessIndex: "35 minutes average response",
    upstreamResponseMinutes: 35,
  },

  Completeness: {
    downstreamToleranceWindow: "45 minutes",
    upstreamResponsivenessIndex: "25 minutes average response",
    upstreamResponseMinutes: 25,
  },

  Technical: {
    downstreamToleranceWindow: "45 minutes",
    upstreamResponsivenessIndex: "25 minutes average response",
    upstreamResponseMinutes: 25,
  }
};

function getRcaKpiDetails(
  rcaCategory: RcaCategory,
  dataFreshnessSensitivity: DataFreshnessSensitivity,
): RcaKpiDetails {
  const baseDetails = RCA_KPI_DETAILS[rcaCategory];

  return {
    downstreamToleranceWindow:
      baseDetails?.downstreamToleranceWindow ??
      "Not available",

    dataFreshnessSensitivity,

    upstreamResponsivenessIndex:
      baseDetails?.upstreamResponsivenessIndex ??
      "Not available",

    upstreamResponseMinutes:
      baseDetails?.upstreamResponseMinutes ?? 0,
  };
}

const getChoicesForRca = (
  rcaCategory: RcaCategory,
): readonly ChoiceItem[] => {
  const choicesMap: Record<string, ChoiceItem[]> = {
  Accuracy: [
  {
    id: "choice-1",
    title: "Quarantine invalid records and continue processing",
    subtitle: "Quarantine invalid records and continue",
    icon: Filter,
    riskColor: "emerald",
    badge: "System Recommended",
    score: "94%",
    
    baseConfidence: 94,
    

    frequency: "224",
    avgTat: "20m",
    
    
    fpmc: "82%",
    fpmcColor: "text-white",
    

    explanation:
      "Choose this when the required source file is available, but only a limited set of records are invalid. The job can safely continue if invalid records are separated into a reject, error, or quarantine area.",
    riskContext:
      "Use this when bad records are isolated and do not block full batch completion. This option protects SLA while keeping invalid data out of downstream systems.",
    nudgeSignals: {
      dtw: { score: 55, label: "Moderate SLA headroom", weight: 0.25 },
      dfs: { score: 60, label: "Freshness partially preserved", weight: 0.25 },
      fpmc: {
        score: 82,
        label: "Strong KEDB match for record-level rejects",
        weight: 0.3,
      },
      uri: {
        score: 45,
        label: "Upstream fix decoupled from cycle",
        weight: 0.2,
      },
      fitScore: "84%",
      rationale:
        "Row-level defect isolated; majority payload is clean, SLA safe with reject-lane path.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Review validation error logs",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Identify failed records",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s3",
        title: "Move invalid records to reject or quarantine table/file",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s4",
        title: "Confirm remaining valid records meet minimum threshold",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s5",
        title: "Continue batch processing",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
      {
        id: "s6",
        title: "Notify upstream or data owner with rejected details",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
      {
        id: "s7",
        title: "Request correction for invalid records separately",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
    ],
  },
  {
    id: "choice-2",
    title: "Upstream refeed and rerun",
    subtitle: "Request corrected feed from source",
    icon: RefreshCw,
    riskColor: "emerald",
    badge: "Cleanest Path",
    score: "88%",
    
    baseConfidence: 87,
    

    frequency: "153",
    avgTat: "30m",
    
    
    fpmc: "80%",
    fpmcColor: "text-white",
    

    explanation:
      "Choose this when the feed file is structurally broken beyond safe massaging and downstream SLA has enough headroom to wait for a corrected file from the upstream provider.",
    riskContext:
      "Lowest data-integrity risk since the source is fixed at origin. Effectiveness depends heavily on upstream MTTR and their on-call availability.",
    nudgeSignals: {
      dtw: { score: 78, label: "Ample SLA headroom", weight: 0.3 },
      dfs: {
        score: 88,
        label: "Source accuracy correction required",
        weight: 0.3,
      },
      fpmc: {
        score: 80,
        label: "Strong KEDB match for upstream correction",
        weight: 0.2,
      },
      uri: {
        score: 78,
        label: "Upstream historically responsive",
        weight: 0.2,
      },
      fitScore: "81%",
      rationale:
        "Accuracy issue is source-originated and correction at upstream is safest when SLA headroom can absorb refeed latency.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Confirm structural corruption exceeds safe massaging scope",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Check downstream SLA headroom against upstream MTTR",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s3",
        title: "Raise formal refeed request ticket to upstream owner",
        action: "REMEDIATE",
        scope: "GLOBAL",
      },
      {
        id: "s4",
        title: "Track upstream fix and validate corrected file signature",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s5",
        title: "Purge failed run artifacts and reset checkpoint state",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s6",
        title: "Rerun batch job with corrected upstream feed",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
      {
        id: "s7",
        title: "Close ticket and update KEDB with refeed root cause",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
    ],
  },
  {
    id: "choice-3",
    title: "T-1 data carry-forward fallback",
    subtitle: "Stale feed reuse from prior cycle",
    icon: History,
    riskColor: "amber",
    badge: "Fallback Path",
    score: "83%",
    
    baseConfidence: 83,
    

    frequency: "31",
    avgTat: "10m",
    
    fpmc: "58%",
    fpmcColor: "text-white",
    

    explanation:
      "Choose this only when the current-day feed is unavailable, upstream cannot deliver within SLA, and downstream consumers can tolerate T-1 data. The last known good file is re-ingested to keep the batch window green.",
    riskContext:
      "High business risk due to stale data. Requires explicit signoff from business owner and must be tagged in audit log as a stale-feed cycle.",
    nudgeSignals: {
      dtw: { score: 18, label: "Very tight SLA window", weight: 0.3 },
      dfs: {
        score: 42,
        label: "Downstream tolerates stale accuracy baseline",
        weight: 0.35,
      },
      fpmc: {
        score: 58,
        label: "Limited KEDB match — carry-forward pattern",
        weight: 0.15,
      },
      uri: {
        score: 20,
        label: "Upstream unavailable within SLA window",
        weight: 0.2,
      },
      fitScore: "44%",
      rationale:
        "SLA breach risk is high and upstream recovery is unlikely; use only when downstream classification permits stale-feed reuse.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Confirm current-day feed is unrecoverable within SLA window",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Validate downstream tolerance for T-1 stale data reuse",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s3",
        title: "Secure business owner signoff for stale feed fallback",
        action: "OBSERVE",
        scope: "GLOBAL",
      },
      {
        id: "s4",
        title: "Retrieve last known good feed from archival snapshot store",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s5",
        title: "Tag cycle with stale-feed audit marker for compliance trail",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s6",
        title: "Rerun batch job with carry-forward feed and alert stakeholders",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
    ],
  },
],

    Completeness: [
      {
        id: "choice-1",
        title: "Upstream completeness refeed and rerun",
        subtitle: "Request complete file from source and rerun",
        icon: RefreshCw,
        riskColor: "emerald",
        badge: "System Recommended",
        score: "92%",
        frequency: "240",
        avgTat: "30m",
        
        
        fpmc: "80%",
        fpmcColor: "text-white",
        

        explanation:
          "Choose this when the completeness gap is material (e.g., <90%), the missing records are business-critical, and downstream SLA has enough headroom for the upstream team to deliver a fully complete file.",
        riskContext:
          "Lowest data-integrity risk since completeness is fixed at source. Effectiveness depends on upstream MTTR and their ability to regenerate a complete extract for the business day.",
        nudgeSignals: {
          dtw: { score: 80, label: "Ample SLA headroom", weight: 0.35 },
          dfs: { score: 92, label: "Full T-0 completeness required", weight: 0.30 },
          fpmc: {
            score: 42,
            label: "Weak KEDB match — no safe partial workaround",
            weight: 0.15,
          },
          uri: { score: 78, label: "Upstream historically responsive", weight: 0.20 },
          fitScore: "80%",
          rationale:
            "SLA window wide, upstream MTTR fits — safest choice for regulatory or position-sensitive feeds.",
        },
        pipeline: [
          {
            id: "s1",
            title: "Quantify completeness gap against expected record volumetrics",
            action: "OBSERVE",
            scope: "LOCAL",
          },
          {
            id: "s2",
            title: "Confirm downstream cannot tolerate partial for this feed class",
            action: "OBSERVE",
            scope: "REGIONAL",
          },
          {
            id: "s3",
            title: "Raise formal complete-refeed request ticket to upstream owner",
            action: "REMEDIATE",
            scope: "GLOBAL",
          },
          // {
          //   id: "s4",
          //   title: "Track upstream regeneration and validate row-count signature",
          //   action: "OBSERVE",
          //   scope: "REGIONAL",
          // },
          // {
          //   id: "s5",
          //   title: "Purge partial run artifacts and reset checkpoint state",
          //   action: "REMEDIATE",
          //   scope: "LOCAL",
          // },
          // {
          //   id: "s6",
          //   title: "Rerun batch job with complete upstream feed",
          //   action: "EXECUTE",
          //   scope: "GLOBAL",
          // },
          // {
          //   id: "s7",
          //   title: "Close ticket and update KEDB with completeness root cause",
          //   action: "EXECUTE",
          //   scope: "REGIONAL",
          // },
        ],
      },
      {
        id: "choice-2",
        title: "Synthetic repair via dev-provided script",
        subtitle: "Repair missing values using certified rules",
        icon: FileCog,
        riskColor: "emerald",
        badge: "Auto-Remediation",
        score: "86%",
        frequency: "130",
        gcvColor: "text-emerald-500",
        avgTat: "15m",
        
       
        fpmc: "70%",
        fpmcColor: "text-white",
        // uri: "32% Upstream slow - bypass preferred",
       

        explanation:
          "Choose this when missing values or records match a known  pattern (forward-fill for holidays, zero-fill for no-activity accounts, derived-fill via cross-reference lookup) and dev has certified a script for that pattern.",
        riskContext:
          "Low-risk KEDB-driven standard workaround. Script is dev-certified with deterministic rules; imputed rows are tagged for full audit traceability. Not for values with regulatory materiality.",
        nudgeSignals: {
          dtw: { score: 38, label: "Tight SLA — needs quick fix", weight: 0.25 },
          dfs: {
            score: 82,
            label: "T-0 freshness preserved via deterministic rule",
            weight: 0.25,
          },
          fpmc: {
            score: 93,
            label: "Strong KEDB match with certified repair rule",
            weight: 0.35,
          },
          uri: { score: 32, label: "Upstream slow — bypass preferred", weight: 0.15 },
          fitScore: "89%",
          rationale:
            "High KEDB confidence + certified repair + tight SLA + preserved T-0 freshness = ideal auto-remediation window.",
        },
        pipeline: [
          {
            id: "s1",
            title: "Detect completeness pattern against golden expectation catalog",
            action: "OBSERVE",
            scope: "LOCAL",
          },
          {
            id: "s2",
            title: "Match gap signature against KEDB repair known-error entry",
            action: "OBSERVE",
            scope: "LOCAL",
          },
          {
            id: "s3",
            title: "Retrieve dev-certified repair script and rule metadata",
            action: "OBSERVE",
            scope: "REGIONAL",
          },
          {
            id: "s4",
            title: "Backup original partial feed to audit quarantine location",
            action: "REMEDIATE",
            scope: "LOCAL",
          },
          {
            id: "s5",
            title: "Execute repair script to synthesize missing values or rows",
            action: "REMEDIATE",
            scope: "LOCAL",
          },
          {
            id: "s6",
            title: "Tag imputed records with rule identifier for lineage traceability",
            action: "REMEDIATE",
            scope: "LOCAL",
          },
          {
            id: "s7",
            title: "Rerun batch job successful",
            action: "REMEDIATE",
            scope: "GLOBAL",
          },
        ],
      },
      {
        id: "choice-3",
        title: "T-1 data carry-forward fallback",
        subtitle: "Copy over prior business day data",
        icon: History,
        riskColor: "amber",
        badge: "Fallback Path",
        avgTat: "10m",
        score: "81%",
        frequency: "20",
        
        fpmc: "40%",
        fpmcColor: "text-white",
        // uri: "20% Upstream unavailable within SLA window",
        

        explanation:
          "Choose this only when the current-day feed cannot be completed within SLA, upstream cannot deliver in the remaining window, and downstream consumers can tolerate T-1 (previous business day) data. The last known good file is re-ingested to keep the batch window green.",
        riskContext:
          "High business risk due to stale data. Requires explicit signoff from business owner and must be tagged in audit log as a stale-feed cycle. Not suitable for regulatory or position-sensitive reports.",
        nudgeSignals: {
          dtw: { score: 22, label: "Very tight SLA — cannot wait", weight: 0.30 },
          dfs: {
            score: 28,
            label: "Downstream tolerates T-1 stale data",
            weight: 0.35,
          },
          fpmc: {
            score: 35,
            label: "Limited KEDB match — carry-forward pattern",
            weight: 0.15,
          },
          uri: { score: 20, label: "Upstream slow / unavailable", weight: 0.20 },
          fitScore: "60%",
          rationale:
            "SLA breach imminent + upstream cannot deliver + downstream classification permits T-1 stale feed.",
        },
        pipeline: [
          {
            id: "s1",
            title: "Confirm current-day feed is uncompletable within SLA window",
            action: "OBSERVE",
            scope: "LOCAL",
          },
          {
            id: "s2",
            title: "Validate downstream tolerance for T-1 stale data reuse",
            action: "OBSERVE",
            scope: "REGIONAL",
          },
          {
            id: "s3",
            title: "Secure business owner signoff for stale feed fallback",
            action: "OBSERVE",
            scope: "GLOBAL",
          },
          {
            id: "s4",
            title: "Retrieve last known good feed from archival snapshot store",
            action: "REMEDIATE",
            scope: "LOCAL",
          },
          {
            id: "s5",
            title: "Tag cycle with stale-feed audit marker for compliance trail",
            action: "REMEDIATE",
            scope: "LOCAL",
          },
          {
            id: "s6",
            title: "Rerun batch job with carry-forward feed and alert stakeholders",
            action: "EXECUTE",
            scope: "GLOBAL",
          },
        ],
      },
    ],
    Technical: [
  {
    id: "choice-1",
    title: "Purge & Reclaim Space, Then Rerun",
    subtitle: "Certified purge of aged artifacts",
    icon: Trash2,
    riskColor: "emerald",
    badge: "System Recommended",
    score: "92%",
    baseConfidence: 92,
    frequency: "312",
    avgTat: "12m",
    fpmc: "88%",
    fpmcColor: "text-white",
    explanation:
      "Choose this when the fill is caused by transient artifacts — archived logs, temp files, old snapshots, rotated audit files — that can be safely purged per certified retention policy.",
    riskContext:
      "Very low risk — purge scripts are dev-certified and target only aged/rotated artifacts protected by KEDB retention rules.",
    nudgeSignals: {
      dtw: {
        score: 68,
        label: "SLA headroom sufficient for cleanup + rerun",
        weight: 0.25,
      },
      dfs: {
        score: 55,
        label: "No data freshness impact",
        weight: 0.2,
      },
      fpmc: {
        score: 88,
        label: "Strong KEDB match — purge & rerun repeatedly successful",
        weight: 0.35,
      },
      uri: {
        score: 40,
        label: "No upstream involvement needed",
        weight: 0.2,
      },
      fitScore: "86%",
      rationale:
        "Recurring artifact-fill pattern with certified purge path and safe SLA window.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Confirm alert source & volume threshold",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Identify top space consumers via disk-usage scan",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s3",
        title: "Match consumer pattern against KEDB certified-purge rules",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s4",
        title: "Execute dev-certified purge script on aged artifacts",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s5",
        title: "Verify reclaimed space above rerun watermark",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s6",
        title: "Restart failed batch job via sendevent -E FORCE_STARTJOB",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
      {
        id: "s7",
        title: "Update KEDB with purge audit trail",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
    ],
  },
  {
    id: "choice-2",
    title: "Redirect Output to Alternate Mount, Then Rerun",
    subtitle: "Point job output/temp to registered alternate mount",
    icon: FolderSync,
    riskColor: "emerald",
    badge: "Auto-Remediation",
    score: "84%",
    baseConfidence: 84,
    frequency: "96",
    avgTat: "18m",
    fpmc: "72%",
    fpmcColor: "text-white",
    explanation:
      "Choose this when purge cannot free enough space (data files are all live) but an alternate mount/tablespace with capacity is registered and safe to use.",
    riskContext:
      "Medium — requires config change; must revert or re-baseline permanent path after the cycle to avoid drift.",
    nudgeSignals: {
      dtw: {
        score: 58,
        label: "Adequate SLA headroom",
        weight: 0.25,
      },
      dfs: {
        score: 78,
        label: "T-0 freshness preserved",
        weight: 0.25,
      },
      fpmc: {
        score: 72,
        label: "KEDB match — alternate mount redirect pattern",
        weight: 0.3,
      },
      uri: {
        score: 30,
        label: "No upstream needed",
        weight: 0.2,
      },
      fitScore: "76%",
      rationale:
        "Non-purgeable fill; alternate mount registered; SLA fits config-change + rerun.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Confirm purge non-viable (all consumers are live)",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Query registered alternate mount / tablespace capacity",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s3",
        title: "Update job config to point output/temp path to alternate mount",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s4",
        title: "Reserve rollback token for config revert",
        action: "REMEDIATE",
        scope: "LOCAL",
      },
      {
        id: "s5",
        title: "Restart batch job",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
      {
        id: "s6",
        title: "Post-cycle: revert config or re-baseline permanent path",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
    ],
  },
  {
    id: "choice-3",
    title: "Expand Storage via Infra Ticket + Bridge Rerun",
    subtitle: "Increase storage capacity",
    icon: HardDrive,
    riskColor: "amber",
    badge: "Fallback Path",
    score: "68%",
    baseConfidence: 68,
    frequency: "22",
    avgTat: "45m",
    fpmc: "45%",
    fpmcColor: "text-white",
    explanation:
      "Choose this only when purge is not viable, no alternate mount exists, and only permanent expansion of the underlying LUN/tablespace will resolve the fill.",
    riskContext:
      "High — SLA breach likely; infra approval + provisioning window required; business signoff on breach risk mandatory.",
    nudgeSignals: {
      dtw: {
        score: 18,
        label: "SLA at risk — expansion window long",
        weight: 0.3,
      },
      dfs: {
        score: 70,
        label: "T-0 preserved once expansion completes",
        weight: 0.2,
      },
      fpmc: {
        score: 45,
        label: "Weak KEDB match — infrequent expansion pattern",
        weight: 0.15,
      },
      uri: {
        score: 25,
        label: "Infra team dependency high",
        weight: 0.35,
      },
      fitScore: "55%",
      rationale:
        "Structural capacity gap; requires infra CAB approval — use only when choice-1 and choice-2 are exhausted.",
    },
    pipeline: [
      {
        id: "s1",
        title: "Confirm exhaustion of purge & redirect paths",
        action: "OBSERVE",
        scope: "LOCAL",
      },
      {
        id: "s2",
        title: "Raise emergency storage-expansion ticket to Infra",
        action: "REMEDIATE",
        scope: "GLOBAL",
      },
      {
        id: "s3",
        title: "Secure Batch Owner + Business Owner signoff on breach risk",
        action: "OBSERVE",
        scope: "GLOBAL",
      },
      {
        id: "s4",
        title: "Track expansion completion & volume remount",
        action: "OBSERVE",
        scope: "REGIONAL",
      },
      {
        id: "s5",
        title: "Reset checkpoint state & restart batch",
        action: "EXECUTE",
        scope: "GLOBAL",
      },
      {
        id: "s6",
        title: "Update KEDB with expansion RCA + capacity forecast recommendation",
        action: "EXECUTE",
        scope: "REGIONAL",
      },
    ],
  },
],
};

  return choicesMap[rcaCategory] ?? [];
};





function clampConfidence(value: number): number {
  return Math.min(99, Math.max(1, Math.round(value)));
}

function clampConfidenceToRange(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getRemainingSlaMinutes(
  slaTargetMs: number,
  nowMs: number,
): number {
  return Math.max(0, Math.ceil((slaTargetMs - nowMs) / 60_000));
}

function getDynamicAccuracyChoices(
  choices: readonly ChoiceItem[],
  remainingSlaMinutes: number,
  upstreamResponseMinutes: number,
): readonly ChoiceItem[] {
  const slaExceedsUri = remainingSlaMinutes > upstreamResponseMinutes;
  const headroomMinutes =
    remainingSlaMinutes - upstreamResponseMinutes;

  const scoredChoices = choices.map((choice): ChoiceItem => {
    const parsedScore = Number.parseFloat(choice.score);

    const baseConfidence =
      choice.baseConfidence ??
      (Number.isFinite(parsedScore) ? parsedScore : 50);

    if (choice.id === "choice-2") {
      const adjustment = slaExceedsUri
        ? Math.min(15, headroomMinutes * 0.4)
        : -Math.min(25, Math.abs(headroomMinutes) * 0.8);

      const confidence = clampConfidence(baseConfidence + adjustment);

      return {
        ...choice,
        score: `${confidence}%`,
        badge: slaExceedsUri
          ? "System Recommended"
          : "Cleanest Path",
        nudgeSignals: {
          ...choice.nudgeSignals,
          fitScore: `${confidence}%`,
          rationale: slaExceedsUri
            ? `Remaining SLA is ${remainingSlaMinutes} minutes and upstream response time is ${upstreamResponseMinutes} minutes, leaving ${headroomMinutes} minutes of headroom. Upstream refeed is preferred.`
            : `Remaining SLA is ${remainingSlaMinutes} minutes, which is not enough for the ${upstreamResponseMinutes}-minute upstream response time.`,
        },
      };
    }

    if (choice.id === "choice-1") {
      const adjustment = slaExceedsUri
        ? -Math.min(12, headroomMinutes * 0.25)
        : Math.min(12, Math.abs(headroomMinutes) * 0.5);

      const confidence = clampConfidence(baseConfidence + adjustment);

      return {
        ...choice,
        score: `${confidence}%`,
        badge: slaExceedsUri
          ? "Fast Recovery Path"
          : "System Recommended",
        nudgeSignals: {
          ...choice.nudgeSignals,
          fitScore: `${confidence}%`,
          rationale: slaExceedsUri
            ? "SLA headroom supports source-level correction, so quarantine is the secondary option."
            : "SLA is at or below the upstream response time, so quarantine is the preferred fast-recovery option.",
        },
      };
    }

    if (choice.id === "choice-3") {
      return {
        ...choice,
        score: "83%",
        badge: "Fallback Path",
        nudgeSignals: {
          ...choice.nudgeSignals,
          fitScore: "83%",
          rationale:
            "T-1 remains a fallback because it introduces stale-data risk and requires business approval.",
        },
      };
    }

    return choice;
  });

  const priority = slaExceedsUri
    ? ["choice-2", "choice-1", "choice-3"]
    : ["choice-1", "choice-2", "choice-3"];

  const orderedChoices = [...scoredChoices].sort(
    (left, right) =>
      priority.indexOf(left.id) - priority.indexOf(right.id),
  );

  return orderedChoices.map((choice, index): ChoiceItem => {
    const rawConfidence = Number.parseFloat(choice.score);

    const parsedConfidence = Number.isFinite(rawConfidence)
      ? rawConfidence
      : 50;

    if (index === 0) {
      const confidence = clampConfidenceToRange(
        parsedConfidence,
        91,
        93,
      );

      return {
        ...choice,
        score: `${confidence}%`,
        nudgeSignals: {
          ...choice.nudgeSignals,
          fitScore: `${confidence}%`,
        },
      };
    }

    if (index === 1) {
      const confidence = clampConfidenceToRange(
        parsedConfidence,
        85,
        89,
      );

      return {
        ...choice,
        score: `${confidence}%`,
        nudgeSignals: {
          ...choice.nudgeSignals,
          fitScore: `${confidence}%`,
        },
      };
    }

    return choice;
  });
}
const ICA_SUPPORTED_RCA_CATEGORIES: readonly RcaCategory[] = [
  "Completeness",
  "Accuracy",
  "Technical",
];

function isIcaSupportedRcaCategory(value: unknown): value is RcaCategory {
  return (
    typeof value === "string" &&
    ICA_SUPPORTED_RCA_CATEGORIES.includes(value as RcaCategory)
  );
}

function SomethingWentWrongPage({
  onGoBack,
  reason,
}: Readonly<{
  onGoBack: () => void;
  reason?: string;
}>): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6 text-zinc-300">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-[#0f1115] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-red-900/60 bg-red-950/40 text-red-400">
          <ShieldAlert className="h-6 w-6" />
        </div>

        <h1 className="mt-5 text-xl font-bold text-white">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          {reason ??
            "Unable to load ICA resolution details for this job. Please return to the traceability page and open ICA again."}
        </p>

        <button
          type="button"
          onClick={onGoBack}
          className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
        >
          Go back
        </button>
      </section>
    </main>
  );
}

class IcaResolutionErrorBoundary extends React.Component<
  Readonly<{
    children: React.ReactNode;
    onGoBack: () => void;
  }>,
  Readonly<{
    hasError: boolean;
  }>
> {
  constructor(
    props: Readonly<{
      children: React.ReactNode;
      onGoBack: () => void;
    }>,
  ) {
    super(props);

    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(): Readonly<{ hasError: boolean }> {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: unknown): void {
    console.error("ICA resolution page failed to render", error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <SomethingWentWrongPage
          onGoBack={this.props.onGoBack}
          reason="ICA resolution page failed to load due to an unexpected rendering error."
        />
      );
    }

    return this.props.children;
  }
}

const MIN_GRAPH_ZOOM = 0.55;
const MAX_GRAPH_ZOOM = 1.4;

function clampGraphZoom(value: number): number {
  return Math.min(MAX_GRAPH_ZOOM, Math.max(MIN_GRAPH_ZOOM, value));
}

function InteractiveDecisionTree({
  activeChoiceId,
  rcaCategory,
}: Readonly<{
  activeChoiceId: string;
  rcaCategory: string;
}>): JSX.Element {
  const treeData =
    decisionTrees[rcaCategory]?.[activeChoiceId] ??
    decisionTrees.Completeness["choice-1"];

  const [graphZoom, setGraphZoom] = useState(1.2);

  useEffect(() => {
    setGraphZoom(1.2);
  }, [activeChoiceId, rcaCategory]);

  function handleGraphWheel(
    event: React.WheelEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const zoomStep = event.deltaY > 0 ? -0.06 : 0.06;

    setGraphZoom((current) =>
      clampGraphZoom(current + zoomStep),
    );
  }

  const NodeCard = ({
    node,
  }: Readonly<{
    node: any;
  }>): JSX.Element | null => {
    if (!node) {
      return null;
    }

    return (
      <div
        className={clsx(
          "relative w-52 rounded-lg border px-3 py-2.5 text-left",
          "border-zinc-700/80 bg-[#0f1115]",
          node.type === "error" && "border-red-900/50",
          node.type === "success" && "border-emerald-900/50",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          {node.type === "error" && (
            <ShieldAlert className="h-3 w-3 text-red-500" />
          )}

          {node.type === "success" && (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          )}

          {node.type === "observe" && (
            <Search className="h-3 w-3 text-blue-400" />
          )}

          {node.type === "remediate" && (
            <RotateCcw className="h-3 w-3 text-purple-400" />
          )}

          {node.type === "execute" && (
            <Zap className="h-3 w-3 text-amber-400" />
          )}

          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">
            {node.type}
          </span>
        </div>

        <p className="text-[10px] font-bold leading-tight text-zinc-300">
          {node.title}
        </p>
      </div>
    );
  };

  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-800/80 bg-[#0a0c10]">
      <div
        className="relative min-h-[390px] overflow-auto p-6"
        onWheel={handleGraphWheel}
      >
        <div className="flex min-w-[720px] justify-center">
          <div
            className="origin-top pb-8 transition-transform duration-150 ease-out"
            style={{
              transform: `scale(${graphZoom})`,
            }}
          >
            <div className="flex flex-col items-center">
              <NodeCard node={treeData.root} />

              <div className="h-8 w-px bg-zinc-600" />

              <div className="relative h-px w-[360px] bg-zinc-600">
                <div className="absolute left-0 top-0 h-6 w-px bg-zinc-600" />
                <div className="absolute right-0 top-0 h-6 w-px bg-zinc-600" />
              </div>

              <div className="mt-6 flex justify-center gap-16">
                <div className="flex flex-col items-center">
                  <NodeCard node={treeData.failPath} />

                  <div className="h-6 w-px border-l border-dashed border-zinc-600" />

                  <div className="w-56 rounded-md border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-center">
                    <span className="font-mono text-[10px] font-bold leading-snug text-amber-300">
                      {treeData.failTerminal?.title ??
                        "End of Automation"}
                    </span>

                    {treeData.failTerminal?.subtitle && (
                      <p className="mt-1 text-[9px] leading-snug text-zinc-400">
                        {treeData.failTerminal.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <NodeCard node={treeData.successPath} />

                  {treeData.step2 && (
                    <>
                      <div className="h-8 w-px bg-zinc-600" />
                      <NodeCard node={treeData.step2} />
                    </>
                  )}

                  {treeData.step3 && (
                    <>
                      <div className="h-8 w-px bg-zinc-600" />
                      <NodeCard node={treeData.step3} />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const decisionTrees: Record<string, Record<string, any>> = {
  Accuracy: {
    "choice-1": {
      root: {
        id: "n1",
        title: "Filter and Evaluate Bad Records",
        type: "observe",
        risk: "Low",
        impact: "None",
        rollback: "N/A",
        description: "Log analyzer scans validation output to determine the volume and criticality of bad records against acceptable thresholds.",
      },
      failPath: {
        id: "n2",
        title: "Volume Over Threshold",
        type: "error",
        risk: "Critical",
        impact: "Data Quality",
        rollback: "Halt Loop",
        description: "Invalid record count exceeds the predefined safe threshold. Quarantining is unsafe. Escalate to Data Owner and degrade to Choice 2 (Request Corrected Data).",
        nextNudge: "choice-2",
        escalationLevel: "Data Owner",
      },
      failTerminal: {
        title: "Escalate to Data Owner",
        subtitle: "Error threshold exceeded; quarantine unsafe",
      },
      successPath: {
        id: "n3",
        title: "Safe Count Verified",
        type: "success",
        risk: "Low",
        impact: "Local Storage",
        rollback: "Auto Clear",
        description: "Invalid records are within acceptable limits and non-critical fields. Cleared to proceed with quarantine protocol.",
      },
      step2: {
        id: "n4",
        title: "Move to Quarantine Pool and Resume",
        type: "remediate",
        risk: "Medium",
        impact: "DB Cluster",
        rollback: "Part Reset",
        description: "Mismatched fields are isolated into a reject/quarantine table. Remaining valid records are pushed downstream for processing.",
      },
      step2FailPath: {
        id: "n5",
        title: "Quarantine Process Failed",
        type: "error",
        risk: "High",
        impact: "Target Database",
        rollback: "Restore Partitions",
        description: "Failed to cleanly separate invalid records. Halt batch to prevent downstream corruption and escalate to Database Admin.",
        nextNudge: "human-in-the-loop",
        escalationLevel: "Database Admin",
      },
    },
    
    "choice-2": {
      root: {
        id: "n1",
        title: "Isolate and Package Bad Batches",
        type: "observe",
        risk: "Low",
        impact: "None",
        rollback: "N/A",
        description: "Diagnostic dump files and sample bad records are gathered and packaged for upstream review.",
      },
      failPath: {
        id: "n2",
        title: "Upstream Engine Unreachable",
        type: "error",
        risk: "High",
        impact: "SLA",
        rollback: "N/A",
        description: "Source engine is unreachable or unresponsive. Cannot issue reload request. Escalate to Upstream L3 Support and evaluate Choice 3 (Business Override) if SLA is critical.",
        nextNudge: "choice-3",
        escalationLevel: "Upstream L3 Support",
      },
      failTerminal: {
        title: "Escalate to Upstream Support",
        subtitle: "Source system unreachable",
      },
      successPath: {
        id: "n3",
        title: "Diagnostic Dump Saved",
        type: "success",
        risk: "Low",
        impact: "Disk",
        rollback: "Purge Dump",
        description: "Log bundle and sample bad records packed safely. Ready to trigger reload workflow.",
      },
      step2: {
        id: "n4",
        title: "Issue Upstream Reload and Await Refeed",
        type: "execute",
        risk: "Medium",
        impact: "Source API",
        rollback: "Abort Reload",
        description: "Signals upstream data feed to fix data and rerun payload. Arms watcher for corrected file.",
      },
      step2FailPath: {
        id: "n5",
        title: "Corrected Refeed Failed/Invalid",
        type: "error",
        risk: "Critical",
        impact: "SLA",
        rollback: "Discard Feed",
        description: "New feed arrived but still failed validation. Escalate to Application Owner and Business Owner for potential cycle skip or override.",
        nextNudge: "choice-3",
        escalationLevel: "Application Owner + Business Owner",
      },
    },

    "choice-3": {
      root: {
        id: "n1",
        title: "Audit Policy and Signoff Checks",
        type: "observe",
        risk: "Low",
        impact: "None",
        rollback: "N/A",
        description: "Validates governance tracking rules to ensure explicit business signoff exists for bypassing the specific data exception.",
      },
      failPath: {
        id: "n2",
        title: "No Business Signoff Detected",
        type: "error",
        risk: "Critical",
        impact: "Compliance",
        rollback: "Halt Execution",
        description: "Business approval token is missing or timed out. Overriding without consent violates compliance. Halt execution and escalate to Compliance Officer.",
        nextNudge: "human-in-the-loop",
        escalationLevel: "Compliance Officer + Business Owner",
      },
      failTerminal: {
        title: "Escalate to Compliance",
        subtitle: "Business approval token missing",
      },
      successPath: {
        id: "n3",
        title: "Signoff Logged and Verified",
        type: "success",
        risk: "High",
        impact: "Security Log",
        rollback: "Revoke Token",
        description: "Manual business release approved and securely logged in the audit trail. Cleared for override.",
      },
      step2: {
        id: "n4",
        title: "Inject Override Bypass and Execute",
        type: "remediate",
        risk: "High",
        impact: "Core Engine",
        rollback: "Strip Override",
        description: "Injects runtime skip arguments into the core engine to ignore the data quality rules and forces the batch to execute.",
      },
      step2FailPath: {
        id: "n5",
        title: "Execution Failed with Bypass",
        type: "error",
        risk: "Critical",
        impact: "Global Systems",
        rollback: "DB Restore",
        description: "Batch failed to execute even with bypassed validation (e.g., hard constraint hit). Immediate DB restore required. Escalate to L3 Engineering.",
        nextNudge: "human-in-the-loop",
        escalationLevel: "L3 Engineering",
      },
    },
  },
  Completeness: {
  "choice-1": {
    root: {
      id: "n1",
      title: "Complete Refeed Requested from Upstream",
      type: "observe",
      risk: "Low",
      impact: "None",
      rollback: "N/A",
      description:
        "Upstream owner asked to regenerate and drop a fully complete file; FM sentinel re-armed with residual SLA countdown to watch for the refeed landing.",
    },
    failPath: {
      id: "n2",
      title: "Refeed Not Received",
      type: "error",
      risk: "Medium",
      impact: "SLA",
      rollback: "Keep FM Armed",
      description:
        "FM window elapsed without refeed arrival. Escalate ticket from L2 on-call to L3 upstream manager with residual SLA breach warning. If still no drop within escalation SLA, degrade to Choice 2 (Repair Script) if pattern is KEDB-matched, otherwise degrade to Choice 3 (T-1 Carry-Forward) subject to business signoff.",
      nextNudge: "choice-2",
      escalationLevel: "L3 Upstream Manager",
    },
    failTerminal: {
      title: "Escalate to L3 Upstream Manager",
      subtitle: "Refeed not received within watcher window",
    },
    successPath: {
      id: "n3",
      title: "Complete Refeed Detected in Landing Zone",
      type: "success",
      risk: "Low",
      impact: "Local Queue",
      rollback: "Re-apply Hold",
      description:
        "FM detects the refeed file, row-count signature and completeness ratio pass the golden expectation catalog, readiness signal emitted for CMD handoff.",
    },
    step2: {
      id: "n4",
      title: "CMD Executor Handoff — Loader Fires",
      type: "execute",
      risk: "Low",
      impact: "Scheduler",
      rollback: "Hold Executor",
      description:
        "CMD job unblocked by FM readiness signal; loader script fires with full T-0 data at source integrity. Downstream cascades on standard triggers.",
    },
    step2FailPath: {
      id: "n5",
      title: "CMD Execution Failure — Rollback and Re-route",
      type: "error",
      risk: "High",
      impact: "Batch Output",
      rollback: "Restore Cycle Checkpoint",
      description:
        "If CMD loader fails post-handoff (e.g., DB lock, target space, schema drift), rollback cycle checkpoint and re-route to Controlled Restart nudge. If restart also fails, escalate to Batch Engine Owner for manual intervention.",
      nextNudge: "controlled-restart",
      escalationLevel: "Batch Engine Owner",
    },
  },
 
  "choice-2": {
    root: {
      id: "n1",
      title: "Repair Script Executed on Partial Feed",
      type: "remediate",
      risk: "Low",
      impact: "Local File",
      rollback: "Restore Backup",
      description:
        "Dev-certified repair script run against the partial feed; missing values synthesized via deterministic rules and imputed rows tagged with lineage marker for audit traceability.",
    },
    failPath: {
      id: "n2",
      title: "Repair Failed or Validation Rejected",
      type: "error",
      risk: "Medium",
      impact: "SLA",
      rollback: "Restore Quarantine Backup",
      description:
        "FM rejects the transformed file (completeness ratio below tolerance or repair rule signature mismatched). Restore original quarantine backup, communicate failure to Upstream Data Owner requesting complete refeed (falls back to Choice 1 flow). If upstream cannot deliver within residual SLA, degrade to Choice 3 (T-1 Carry-Forward) subject to business signoff.",
      nextNudge: "choice-1",
      escalationLevel: "Upstream Data Owner + Dev Script Owner",
    },
    failTerminal: {
      title: "Communicate Upstream Team",
      subtitle: "repair rejected or validation failed",
    },
    successPath: {
      id: "n3",
      title: "Completed File Validation",
      type: "success",
      risk: "Low",
      impact: "Local Queue",
      rollback: "Re-apply Hold",
      description:
        "FM validates the imputed file against the golden completeness signature; repair audit tag preserved in lineage and CMD handoff prepared.",
    },
    step2: {
      id: "n4",
      title: "CMD Executor Handoff — Loader Fires on Completed Feed",
      type: "execute",
      risk: "Low",
      impact: "Scheduler",
      rollback: "Hold Executor",
      description:
        "CMD loader runs the batch against the deterministically completed feed with T-0 fidelity preserved. Downstream stakeholders notified of repair lineage tag for reconciliation awareness.",
    },
    step2FailPath: {
      id: "n5",
      title: "CMD Execution Failure — Restore Original and Escalate",
      type: "error",
      risk: "High",
      impact: "Batch Output",
      rollback: "Restore Original Partial Feed + Cycle Checkpoint",
      description:
        "If CMD fails post-handoff, restore original partial feed and cycle checkpoint. Route to Choice 3 (T-1 Carry-Forward) if downstream tolerates stale, else escalate to Batch Owner + Data Steward for human-in-the-loop decision.",
      nextNudge: "choice-3",
      escalationLevel: "Batch Owner + Data Steward",
    },
  },
 
  "choice-3": {
    root: {
      id: "n1",
      title: "Validate T-1 Carry-Forward Eligibility",
      type: "observe",
      risk: "High",
      impact: "None",
      rollback: "N/A",
      description:
        "Checks whether T-1 carry-forward is permitted by current business rules, downstream classification, and feed-level regulatory tagging.",
    },
    failPath: {
      id: "n2",
      title: "Carry-Forward Not Approved",
      type: "error",
      risk: "Critical",
      impact: "Compliance",
      rollback: "Halt",
      description:
        "Business approval missing or feed is regulatory-classified (stale data disallowed). Escalate to Business Owner + Compliance Officer for exception approval. If exception denied, revert to Choice 1 (extended upstream escalation to L4/vendor SLA) or invoke Cycle Skip with formal SLA breach notification to downstream stakeholders.",
      nextNudge: "choice-1",
      escalationLevel: "Business Owner + Compliance Officer",
    },
    failTerminal: {
      title: "Escalate to Business + Compliance",
      subtitle: "Carry-forward approval missing or blocked",
    },
    successPath: {
      id: "n3",
      title: "Carry-Forward Approved and File Seeded",
      type: "success",
      risk: "Medium",
      impact: "Audit Log",
      rollback: "Revoke Marker",
      description:
        "Last known good file staged in landing zone under T-0 naming, trigger marker dropped, FM satisfies readiness, stale-feed audit tag written to compliance trail.",
    },
    step2: {
      id: "n4",
      title: "CMD Executor Runs on Carry-Forward Feed",
      type: "execute",
      risk: "High",
      impact: "Batch Output",
      rollback: "Restore Cycle",
      description:
        "CMD loader runs the batch using the carry-forward feed; downstream stakeholders alerted of stale-cycle marker for reconciliation. Backfill job auto-registered for next-cycle delta merge once real T-0 arrives.",
    },
    step2FailPath: {
      id: "n5",
      title: "CMD Failure on Stale Feed — Emergency Escalation",
      type: "error",
      risk: "Critical",
      impact: "Batch Output + Compliance",
      rollback: "Restore Cycle + Revoke Stale Marker",
      description:
        "If CMD fails even on carry-forward feed (target lock, script incompatibility with T-1 schema), all automated paths exhausted. Emergency escalate to Batch Owner + Application Manager + Business Owner for manual override or cycle skip decision.",
      nextNudge: "human-in-the-loop",
      escalationLevel: "Batch Owner + Application Manager + Business Owner",
    },
  },
  },
  Technical: {
  "choice-1": {
    root: {
      id: "n1",
      title: "Scan Consumers & Match Purge Rule",
      type: "observe",
      risk: "Low",
      impact: "None",
      rollback: "N/A",
      description:
        "Disk-usage scan identifies top artifact consumers; KEDB match confirms a safe certified purge rule is available.",
    },
    failPath: {
      id: "n2",
      title: "No Safe Purge Rule Matched",
      type: "error",
      risk: "Medium",
      impact: "SLA",
      rollback: "Keep Watcher Armed",
      description:
        "Consumers are live data files with no certified purge path. Degrade to Choice 2 (Alternate Mount Redirect).",
      nextNudge: "choice-2",
      escalationLevel: "Storage Owner",
    },
    failTerminal: {
      title: "Escalate to Storage Owner",
      subtitle: "No certified purge rule available",
    },
    successPath: {
      id: "n3",
      title: "Space Reclaimed Above Rerun Watermark",
      type: "success",
      risk: "Low",
      impact: "Filesystem",
      rollback: "N/A",
      description:
        "Certified purge completed; free-space delta exceeds rerun watermark; job ready to restart.",
    },
    step2: {
      id: "n4",
      title: "Executor Restarts Batch Job",
      type: "execute",
      risk: "Low",
      impact: "Scheduler",
      rollback: "Hold Executor",
      description:
        "sendevent -E FORCE_STARTJOB fires; job resumes with reclaimed capacity.",
    },
    step2FailPath: {
      id: "n5",
      title: "Job Fails Again — Consumer Refills Fast",
      type: "error",
      risk: "High",
      impact: "Batch Output",
      rollback: "Restore Cycle Checkpoint",
      description:
        "Space refills mid-run indicating live growth. Degrade to Choice 3 (Storage Expansion).",
      nextNudge: "choice-3",
      escalationLevel: "Infra + Batch Owner",
    },
  },

  "choice-2": {
    root: {
      id: "n1",
      title: "Validate Alternate Mount Capacity",
      type: "observe",
      risk: "Low",
      impact: "None",
      rollback: "N/A",
      description:
        "Query registered alternate mount / tablespace and confirm free capacity above rerun watermark plus safety margin.",
    },
    failPath: {
      id: "n2",
      title: "Alternate Mount Also Constrained",
      type: "error",
      risk: "High",
      impact: "SLA",
      rollback: "N/A",
      description:
        "No alternate mount has sufficient headroom. Escalate to Choice 3 (Storage Expansion).",
      nextNudge: "choice-3",
      escalationLevel: "Infra + Storage Owner",
    },
    failTerminal: {
      title: "Escalate to Storage & Infra",
      subtitle: "No alternate mount available",
    },
    successPath: {
      id: "n3",
      title: "Alternate Mount Registered & Ready",
      type: "success",
      risk: "Low",
      impact: "Job Config",
      rollback: "Revert Config Token",
    },
    step2: {
      id: "n4",
      title: "Executor Restarts Batch on Alternate Path",
      type: "execute",
      risk: "Medium",
      impact: "Scheduler",
      rollback: "Hold Executor",
      description:
        "Job restarts writing to alternate mount; downstream stakeholders notified of temporary path change.",
    },
    step2FailPath: {
      id: "n5",
      title: "Post-Cycle Revert Failed",
      type: "error",
      risk: "Medium",
      impact: "Config Drift",
      rollback: "Manual Revert",
      description:
        "Config revert failed — schedule manual revert and update KEDB.",
      nextNudge: "human-in-the-loop",
      escalationLevel: "Batch Config Owner",
    },
  },

  "choice-3": {
    root: {
      id: "n1",
      title: "Raise Storage Expansion Ticket",
      type: "remediate",
      risk: "High",
      impact: "Infra",
      rollback: "N/A",
      description:
        "Emergency storage expansion ticket raised with Infra + CAB. Business Owner signoff captured for expected SLA breach.",
    },
    failPath: {
      id: "n2",
      title: "Expansion Not Approved in Time",
      type: "error",
      risk: "Critical",
      impact: "SLA",
      rollback: "Halt",
      description:
        "CAB / Infra could not deliver capacity within remaining window. Escalate for cycle-skip decision.",
      nextNudge: "human-in-the-loop",
      escalationLevel: "Application Manager + Business Owner",
    },
    failTerminal: {
      title: "Escalate for Cycle-Skip Decision",
      subtitle: "Infra could not deliver capacity within SLA",
    },
    successPath: {
      id: "n3",
      title: "Capacity Provisioned & Volume Remounted",
      type: "success",
      risk: "Medium",
      impact: "Filesystem",
      rollback: "N/A",
    },
    step2: {
      id: "n4",
      title: "Reset Checkpoint & Restart Batch",
      type: "execute",
      risk: "Medium",
      impact: "Scheduler",
      rollback: "Hold Executor",
      description:
        "Cycle checkpoint reset; batch restarted with new capacity; KEDB updated with expansion RCA.",
    },
    step2FailPath: {
      id: "n5",
      title: "Restart Fails Even After Expansion",
      type: "error",
      risk: "Critical",
      impact: "Batch Output",
      rollback: "Restore Cycle Checkpoint",
      description:
        "Job continues to fail post-expansion — root cause likely not space-only. Route to human hand-off.",
      nextNudge: "human-in-the-loop",
      escalationLevel: "L3 Engineering + Batch Owner",
    },
  },
  },
};

function KpiMetric({
  label,
  value,
  className,
}: Readonly<{
  label: string;
  value: string;
  className?: string;
}>): JSX.Element {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800/80 bg-black/30 px-3 py-2">
      <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-blue-400">
        {label}
      </p>

      <p
        className={clsx(
          "mt-1 break-words text-[13px] font-bold leading-snug",
          className ?? "text-zinc-200",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function IcaResolutionPageContent({
  currentRcaCategory,
  dataFreshnessSensitivity,
}: Readonly<{
  currentRcaCategory: RcaCategory;
  dataFreshnessSensitivity: DataFreshnessSensitivity;
}>): JSX.Element {

  const navigate = useNavigate();
  const { batchName } = useParams();
  
  const decodedBatchName = decodeURIComponent(
    batchName ?? "BAN_DEPOSI_FD_P_0117",
  );
  
  const dynamicExecutedSteps = getExecutedSteps(currentRcaCategory);
  const incidentTitle = getIncidentTitleForRca(currentRcaCategory);
  const rcaKpiDetails = React.useMemo(
  () =>
    getRcaKpiDetails(
      currentRcaCategory,
      dataFreshnessSensitivity,
    ),
  [
    currentRcaCategory,
    dataFreshnessSensitivity,
  ],
);


  const baseChoices = React.useMemo(
    () => getChoicesForRca(currentRcaCategory),
    [currentRcaCategory],
  );

  const [pausedStepId, setPausedStepId] = useState<string | null>(null);
  const [activeChoiceId, setActiveChoiceId] = useState<string>("choice-1");
  const [isExecuting, setIsExecuting] = useState(false);
  const [visibleStepCount, setVisibleStepCount] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [hasRerunWithRca, setHasRerunWithRca] = useState(false);
  const [lastWorkflowStage, setLastWorkflowStage] = useState<
    "fileWatcher" | "executor" | null
  >(null);
  const [pageOpenedAtMs] = useState(() => Date.now());
  const [logs, setLogs] = useState<
    { id: number; time: string; source: string; msg: string; type: string }[]
  >([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  

  const currentJobStatus: JobStatus =
    lastWorkflowStage === "fileWatcher"
      ? "Awaiting File"
      : hasRerunWithRca
        ? "Auto-Fixed"
        : currentRcaCategory === "Completeness"
          ? "Awaiting File"
          : "In-Progress";

  const operationalTiming = getOperationalTimingForJob({
  jobId: decodedBatchName,
  rca: currentRcaCategory,
  status: currentJobStatus,
  nowMs: pageOpenedAtMs,
});

const remainingSlaMinutes = getRemainingSlaMinutes(
  operationalTiming.slaTargetMs,
  pageOpenedAtMs,
);

const choices = React.useMemo(
  () =>
    currentRcaCategory === "Accuracy"
      ? getDynamicAccuracyChoices(
          baseChoices,
          remainingSlaMinutes,
          rcaKpiDetails.upstreamResponseMinutes,
        )
      : baseChoices,
  [
    baseChoices,
    currentRcaCategory,
    remainingSlaMinutes,
    rcaKpiDetails.upstreamResponseMinutes,
  ],
);


const recommendedChoiceId = React.useMemo(() => {
  const firstAvailableChoice = choices.find((choice) =>
    isChoiceAvailableForFreshness(
      choice.id,
      rcaKpiDetails.dataFreshnessSensitivity,
    ),
  );

  return firstAvailableChoice?.id ?? "choice-1";
}, [
  choices,
  rcaKpiDetails.dataFreshnessSensitivity,
]);

const activeChoice = choices.find(
  (choice) =>
    choice.id === activeChoiceId &&
    isChoiceAvailableForFreshness(
      choice.id,
      rcaKpiDetails.dataFreshnessSensitivity,
    ),
);


const rerunExpiryMinutes = RERUN_WITH_RCA_EXPIRY_MINUTES;

  useEffect(() => {
    function refreshRerunState(): void {
      const record = getValidRerunWithRcaRecord(decodedBatchName);

      setHasRerunWithRca(record != null);
      if (record?.choiceId != null) {
        setLastWorkflowStage(
          getWorkflowStageForChoice(record.rca, record.choiceId).workflowStage,
        );
      } else {
        setLastWorkflowStage(record?.workflowStage ?? null);
      }
    }

    refreshRerunState();

    window.addEventListener("bha-rerun-with-rca-updated", refreshRerunState);
    window.addEventListener("focus", refreshRerunState);
    window.addEventListener("pageshow", refreshRerunState);

    return () => {
      window.removeEventListener("bha-rerun-with-rca-updated", refreshRerunState);
      window.removeEventListener("focus", refreshRerunState);
      window.removeEventListener("pageshow", refreshRerunState);
    };
  }, [decodedBatchName]);

  const addLog = (
    source: string,
    msg: string,
    type: "info" | "success" | "error" | "warning" = "info",
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString("en-GB"),
        source,
        msg,
        type,
      },
    ]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
  setActiveChoiceId(recommendedChoiceId);
  setVisibleStepCount(0);
  setIsFinished(false);
  setIsExecuting(false);
  setPausedStepId(null);
  setLogs([]);
}, [
  decodedBatchName,
  currentRcaCategory,
  recommendedChoiceId,
]);

  const handleExecute = (choiceId: string): void => {
  if (isExecuting || hasRerunWithRca) {
    return;
  }

  const isChoiceAvailable = isChoiceAvailableForFreshness(
    choiceId,
    rcaKpiDetails.dataFreshnessSensitivity,
  );

  if (!isChoiceAvailable) {
    addLog(
      "System",
      "T-1 carry-forward is unavailable because this job has High data freshness sensitivity.",
      "warning",
    );

    return;
  }

  setActiveChoiceId(choiceId);
  setIsExecuting(true);
  setVisibleStepCount(0);
  setIsFinished(false);
  setPausedStepId(null);
  setLogs([]);

  const choice = choices.find(
    (item) => item.id === choiceId,
  );

  addLog(
    "System",
    `Authorization granted. Initiating automated recovery runbook: [${choice?.title}]`,
    "info",
  );

  addLog(
    "Runner",
    "Connecting to Batch Orchestrator...",
    "info",
  );
};


  useEffect(() => {
  if (!isExecuting || !activeChoice || isFinished) return;

  const pauseStepId = getExecutionPauseStepId(
    currentRcaCategory,
    activeChoiceId,
  );

  const pauseStepIndex =
    pauseStepId == null
      ? -1
      : activeChoice.pipeline.findIndex((step) => step.id === pauseStepId);

  if (pauseStepIndex >= 0 && visibleStepCount >= pauseStepIndex) {
    const pauseStep = activeChoice.pipeline[pauseStepIndex];

    const timer = window.setTimeout(() => {
      const workflowOutcome = getWorkflowStageForChoice(
        currentRcaCategory,
        activeChoiceId,
      );

      setIsFinished(true);
      setIsExecuting(false);
      setPausedStepId(pauseStep.id);
      setHasRerunWithRca(true);
      setLastWorkflowStage(workflowOutcome.workflowStage);

      saveRerunWithRcaResult(
        decodedBatchName,
        currentRcaCategory,
        activeChoiceId,
      );

      addLog(
        "System",
        `Execution paused at task: ${pauseStep.title}. Upstream refeed request is now running. This workflow state expires in ${rerunExpiryMinutes} minutes.`,
        "success",
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }

  if (visibleStepCount < (activeChoice?.pipeline?.length ?? 0)) {
    const timer = window.setTimeout(() => {
      const step = activeChoice?.pipeline?.[visibleStepCount];

      if (step) {
        addLog("Runner", `Executing task: ${step.title}`, "info");
      }

      setVisibleStepCount((prev) => prev + 1);
    }, 1500);

    return () => window.clearTimeout(timer);
  }

  const timer = window.setTimeout(() => {
    const workflowOutcome = getWorkflowStageForChoice(
      currentRcaCategory,
      activeChoiceId,
    );

    setIsFinished(true);
    setIsExecuting(false);
    setHasRerunWithRca(true);
    setLastWorkflowStage(workflowOutcome.workflowStage);
    setPausedStepId(null);

    saveRerunWithRcaResult(
      decodedBatchName,
      currentRcaCategory,
      activeChoiceId,
    );

    addLog(
      "System",
      workflowOutcome.workflowStage === "fileWatcher"
        ? `Remediation path submitted. File Watcher Agent is now running and waiting for corrected or normalized file readiness. This workflow state expires in ${rerunExpiryMinutes} minutes.`
        : `All pipeline tasks safely executed. Incident state transitioned to RESOLVED. Workflow outcome: Rerun with RCA. This workflow state expires in ${rerunExpiryMinutes} minutes.`,
      "success",
    );
  }, 1000);

  return () => window.clearTimeout(timer);
}, [
  activeChoice,
  activeChoiceId,
  visibleStepCount,
  isFinished,
  isExecuting,
  decodedBatchName,
  currentRcaCategory,
  rerunExpiryMinutes,
]);

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 font-sans flex flex-col">
      <div className="border-b border-zinc-800/60 px-6 py-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs text-zinc-300 transition-colors hover:text-white flex items-center gap-1"
        >
          <span>←</span> Go back
        </button>
      </div>

      <section className="px-6 py-5 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-white tracking-tight">
            {decodedBatchName} job failed - {incidentTitle}
          </h1>

          <span className="rounded bg-red-950/50 border border-red-900/50 px-2 py-0.5 text-[10px] font-bold text-red-500">
            HIGH
          </span>

          <span className="rounded bg-purple-950/50 border border-purple-900/60 px-2.5 py-0.5 text-[10px] font-bold text-purple-400 uppercase font-mono tracking-wider animate-pulse">
            RCA CLASSIFICATION: {currentRcaCategory}
          </span>

          <SlaCountdownBadge
            slaTargetMs={operationalTiming.slaTargetMs}
            className={operationalTiming.slaClassName}
          />

          {/* <span className="font-mono text-[10px] text-zinc-500">
            Target: {operationalTiming.slaTarget}
          </span> */}
        </div>
      </section>

      <section className="grid flex-1 grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[380px_1fr] gap-0 overflow-hidden">
        <aside className="border-r border-zinc-800/60 px-6 py-2 overflow-y-auto custom-scrollbar flex flex-col">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Executed Steps
            </h2>
            <p className="mt-1 text-[10px] text-zinc-300 mb-6">
              Automated incident resolution pipeline tracking history.
            </p>
          </div>

          <div className="space-y-4 flex-1">
            {dynamicExecutedSteps.map((step) => (
              <div key={step.id} className="relative">
                <div className="absolute left-[15px] top-8 h-[calc(100%+16px)] w-px bg-zinc-800" />

                <div className="relative rounded-lg border border-emerald-900/50 bg-[#0f1115] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-950/50 border border-emerald-900 text-emerald-500">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <step.icon className="h-3.5 w-3.5 text-zinc-300" />
                          <h3 className="text-[13px] font-semibold text-zinc-300">
                            {step.title}
                          </h3>
                        </div>

                        <p className="mt-1 text-[10px] text-zinc-300">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full border border-emerald-800/50 px-2 py-0.5 text-[10px] text-emerald-400">
                      Completed
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <div className="relative mt-6">
              {isExecuting && (
                <div className="absolute left-[15px] top-8 h-[calc(100%+16px)] w-px bg-zinc-800" />
              )}

              <div className="relative rounded-lg border border-zinc-700 bg-[#0f1115] p-1">
                <div className="flex items-start justify-between p-3">
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-950/30 text-blue-500">
                      <Zap className="h-4 w-4 fill-blue-500/20" />
                    </div>

                    <div>
                      <h3 className="text-[13px] font-bold text-white">
                        automated_resolution
                      </h3>
                      <p className="text-[10px] text-zinc-300 mt-0.5">
                        Please select one of the provided options to auto-resolve
                      </p>

                      {hasRerunWithRca && (
                        <p className="mt-1 text-[10px] font-mono text-emerald-400">
                          {lastWorkflowStage === "fileWatcher"
                            ? "File Watcher is active. Execution is paused until file readiness is confirmed."
                            : "This job has already been rerun with RCA. Execution is disabled until the stored result expires."}
                        </p>
                      )}
                    </div>
                  </div>

                  <span
                    className={clsx(
                      "text-[10px] font-bold uppercase tracking-wide",
                      hasRerunWithRca ? "text-emerald-400" : "text-emerald-500",
                    )}
                  >
                    {lastWorkflowStage === "fileWatcher"
                      ? "File Watcher Active"
                      : hasRerunWithRca
                        ? "Rerun Completed"
                        : "Active"}
                  </span>
                </div>

                <div className="mt-2 space-y-1">
                  {choices.map((choice, index) => {
                    const isChoiceAvailable =
                      isChoiceAvailableForFreshness(
                        choice.id,
                        rcaKpiDetails.dataFreshnessSensitivity,
                      );

                    const isSidebarChoiceDisabled =
                      !isChoiceAvailable ||
                      isExecuting ||
                      hasRerunWithRca;

                    const isSidebarChoiceActive =
                      activeChoiceId === choice.id &&
                      isChoiceAvailable;

                    return (
                      <div
                        key={choice.id}
                        role="button"
                        tabIndex={isSidebarChoiceDisabled ? -1 : 0}
                        aria-disabled={isSidebarChoiceDisabled}
                        title={
                          !isChoiceAvailable
                            ? "T-1 carry-forward is unavailable for High data freshness sensitivity"
                            : hasRerunWithRca
                              ? "This job already has an active RCA workflow state"
                              : choice.title
                        }
                        onClick={() => {
                          if (!isSidebarChoiceDisabled) {
                            setActiveChoiceId(choice.id);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (isSidebarChoiceDisabled) {
                            return;
                          }

                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            setActiveChoiceId(choice.id);
                          }
                        }}
                        className={clsx(
                          "w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left text-xs transition-all",

                          isSidebarChoiceActive
                            ? "bg-blue-900/20 border border-blue-800/50"
                            : "border border-transparent",

                          isChoiceAvailable &&
                            !isExecuting &&
                            !hasRerunWithRca &&
                            "cursor-pointer hover:bg-zinc-800/50",

                          !isChoiceAvailable &&
                            "cursor-not-allowed select-none opacity-30 blur-[1.5px] grayscale",

                          isExecuting &&
                            !isSidebarChoiceActive &&
                            "opacity-50 cursor-not-allowed",
                        )}
                      >
                        <div>
                          <span className="block text-sm text-zinc-300 uppercase font-bold mb-0.5">
                            Choice #{index + 1}
                          </span>

                          <span
                            className={clsx(
                              "block font-semibold truncate max-w-[240px]",
                              isSidebarChoiceActive
                                ? "text-blue-400"
                                : "text-zinc-300",
                            )}
                          >
                            {choice.title}
                          </span>
                        </div>

                        <div
                          role="button"
                          tabIndex={isSidebarChoiceDisabled ? -1 : 0}
                          aria-disabled={isSidebarChoiceDisabled}
                          title={
                            !isChoiceAvailable
                              ? "T-1 carry-forward requires Low data freshness sensitivity"
                              : "Run this resolution choice"
                          }
                          className={clsx(
                            "h-6 w-6 rounded flex items-center justify-center transition-colors shrink-0",

                            isSidebarChoiceDisabled
                              ? "bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50"
                              : isSidebarChoiceActive
                                ? "bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                                : "bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer",
                          )}
                          onClick={(event) => {
                            event.stopPropagation();

                            if (isSidebarChoiceDisabled) {
                              return;
                            }

                            handleExecute(choice.id);
                          }}
                          onKeyDown={(event) => {
                            if (isSidebarChoiceDisabled) {
                              return;
                            }

                            if (
                              event.key === "Enter" ||
                              event.key === " "
                            ) {
                              event.preventDefault();
                              event.stopPropagation();
                              handleExecute(choice.id);
                            }
                          }}
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>
            </div>

            {(isExecuting || isFinished) && activeChoice && (
              <div className="pt-4 space-y-4">
                {activeChoice?.pipeline?.map((step, index) => {
                  const isPausedAtThisStep = pausedStepId === step.id;

                  const isVisible = isFinished || index <= visibleStepCount;

                  const isCompleted =
                    pausedStepId != null
                      ? index < activeChoice.pipeline.findIndex((item) => item.id === pausedStepId)
                      : isFinished
                        ? true
                        : index < visibleStepCount;

                  if (!isVisible) return null;

                  return (
                    <div
                      key={step.id}
                      className="relative animate-in fade-in slide-in-from-top-2"
                    >
                      {index !== (activeChoice?.pipeline?.length ?? 0) - 1 && (
                        <div className="absolute left-[15px] top-8 h-[calc(100%+16px)] w-px bg-zinc-800" />
                      )}

                      <div className="relative rounded-lg border border-zinc-800/80 bg-[#0f1115] px-4 py-3 flex items-start justify-between gap-3 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="mt-1">
                            {isCompleted ? (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-950/50 border border-emerald-900 text-emerald-500">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                            ) : isPausedAtThisStep ? (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-800 bg-amber-950/40 text-amber-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                              </div>
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-900 bg-blue-950/30 text-blue-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                              </div>
                            )}
                          </div>

                          <div>
                            <h4 className="text-[13px] font-bold text-white uppercase tracking-tight">
                              {step.title}
                            </h4>
                            <p className="text-[10px] text-zinc-300 mt-1 font-mono">
                              TYPE: {step.action} &bull; SCOPE: {step.scope}
                            </p>
                          </div>
                        </div>

                       <span
                          className={clsx(
                            "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase shrink-0",
                            isPausedAtThisStep
                              ? "border-amber-800/50 bg-amber-950/30 text-amber-400"
                              : isCompleted
                                ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-400"
                                : "border-blue-800/50 bg-blue-950/30 text-blue-400",
                          )}
                        >
                          {isPausedAtThisStep ? "Running" : isCompleted ? "Completed" : "Executing"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <section className="px-8 py-2 overflow-y-auto custom-scrollbar">
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Primary Resolution Choices
              </h2>
              <p className="mt-1 text-xs text-zinc-300">
                Please select and execute one of the provided choices for
                resolving the batch job.
              </p>
            </div>

            {isExecuting && !isFinished && (
              <span className="bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 px-3 py-1 rounded text-xs font-bold animate-pulse flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Execution in Progress
              </span>
            )}

            {isFinished && lastWorkflowStage === "fileWatcher" && (
              <span className="bg-amber-950/40 text-amber-300 border border-amber-800/50 px-3 py-1 rounded text-xs font-bold flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                File Watcher Running
              </span>
            )}

            {isFinished && lastWorkflowStage === "executor" && (
              <span className="bg-emerald-950/40 text-emerald-300 border border-emerald-800/50 px-3 py-1 rounded text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Execution Completed
              </span>
            )}
          </div>
          <div className="mb-6 rounded-xl border border-zinc-800/80 bg-[#0a0c10] p-5">
          <div className="mb-4 border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-bold text-white">
              Job-Level Decision KPIs
            </h3>
          </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <KpiMetric
                    label="Downstream Tolerance Window"
                    value={rcaKpiDetails.downstreamToleranceWindow}
                  />

                  <KpiMetric
                    label="Data Freshness Sensitivity"
                    value={rcaKpiDetails.dataFreshnessSensitivity}
                  />

                  <KpiMetric
                    label="Upstream Responsiveness Time"
                    value={rcaKpiDetails.upstreamResponsivenessIndex}
                  />
                </div>
          </div>
                  <div className="grid gap-6 xl:grid-cols-3">
                    {choices.map((choice, index) => {
                      const isChoiceAvailable =
                        isChoiceAvailableForFreshness(
                          choice.id,
                          rcaKpiDetails.dataFreshnessSensitivity,
                        );

                      const isActive =
                        activeChoiceId === choice.id &&
                        isChoiceAvailable;

                      return (
                        <div key={choice.id} className="flex flex-col relative">
                          <div className="flex items-center justify-between mb-2 h-6">
                            <h3 className="text-[15px] font-bold text-white">
                              Choice #{index + 1}
                            </h3>

                            {isActive && (
                              <span className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                                ACTIVE SELECTION
                              </span>
                            )}
                          </div>

                          <article
                            aria-disabled={!isChoiceAvailable || isExecuting}
                            onClick={() => {
                              if (!isExecuting && isChoiceAvailable) {
                                setActiveChoiceId(choice.id);
                              }
                            }}
                            className={clsx(
                              "rounded-xl border bg-[#0a0c10] p-4 flex flex-col flex-1 transition-all duration-200",

                              isChoiceAvailable
                                ? "cursor-pointer"
                                : [
                                    "cursor-not-allowed",
                                    "select-none",
                                    "opacity-25",
                                    "blur-[2px]",
                                    "grayscale",
                                  ],

                              isActive
                                ? "border-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.1)]"
                                : "border-zinc-800/80",

                              isChoiceAvailable &&
                                !isActive &&
                                !isExecuting &&
                                "hover:border-zinc-600",

                              isExecuting &&
                                !isActive &&
                                "opacity-40 grayscale pointer-events-none cursor-not-allowed",
                            )}
                          >

                    <div className="flex items-center gap-2 mb-2">
                      <choice.icon className="h-4 w-4 text-blue-500 shrink-0" />
                      <h4 className="text-[13px] font-bold text-white leading-tight">
                        {choice.title}
                      </h4>
                    </div>

                    <p className="mb-3 font-mono text-[11px] font-semibold leading-relaxed text-zinc-300">
                      {choice.subtitle}
                    </p>

                    <div className="mb-2 flex items-end gap-2">
                      <span className="text-2xl font-bold leading-none text-white">
                        {choice.score}
                      </span>

                      <span className="pb-0.5 text-[9px] font-bold uppercase text-zinc-300">
                        Confidence
                      </span>
                    </div>

                    <span
                      className={clsx(
                        "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold mb-6 w-fit",
                        choice.badge === "System Recommended" ||
                          choice.badge === "Recommended Path"
                          ? "bg-emerald-900/30 text-emerald-400"
                          : "bg-zinc-800 text-zinc-300",
                      )}
                    >
                      {choice.badge}
                    </span>

                    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                      <div className="mb-3 border-b border-zinc-800 pb-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-300">
                          KPI Details
                        </p>
                      </div>

                      <div className="space-y-2">
                        <KpiMetric
                          label="Historical Occurrence Frequency"
                          value={choice.frequency}
                          className="text-white"
                        />

                        <KpiMetric
                          label="Average Turnaround Time"
                          value={choice.avgTat ?? "Not available"}
                          className={choice.avgTatColor ?? "text-white"}
                        />

                        <KpiMetric
                          label="Failure Pattern Match Confidence"
                          value={choice.fpmc ?? "Not available"}
                          className={choice.fpmcColor ?? "text-white"}
                        />
                      </div>
                    </div>

                    <div className="mt-2 border-t border-zinc-800/80 pt-3">
                      <p className="text-[12px] font-bold text-zinc-300 mb-1">
                        Explanation:
                      </p>
                      <p className="text-[12px] text-zinc-300 leading-relaxed font-sans">
                        {choice.explanation}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-800/80 flex-1 flex flex-col justify-end">
                      <p className="text-[12px] font-bold text-blue-400 mb-1">
                        Risk Context:
                      </p>
                      <p className="text-[12px] text-zinc-300 leading-relaxed">
                        {choice.riskContext}
                      </p>
                    </div>
                  </article>
                  {!isChoiceAvailable && (
                    <div className="absolute inset-x-0 bottom-0 top-8 z-10 flex items-center justify-center rounded-xl bg-black/20">
                      <div className="mx-4 rounded-lg border border-amber-800/60 bg-amber-950/95 px-4 py-3 text-center shadow-xl">
                        <ShieldAlert className="mx-auto mb-2 h-4 w-4 text-amber-400" />

                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
                          {choice.title}
                        </p>

                        <p className="mt-1 text-[10px] leading-relaxed text-zinc-300">
                          High data freshness sensitivity.
                        </p>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>

          <div className="mt-8 mb-12">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Resolution What-If Analysis - Decision Tree
                </h2>
                <p className="text-[10px] text-zinc-300 mt-1">
                  Interactive visualization of algorithmic orchestration layers
                  and automated continuous standby fallbacks.
                </p>
              </div>
            </div>

            <InteractiveDecisionTree
              activeChoiceId={activeChoiceId}
              rcaCategory={currentRcaCategory}
            />
          </div>
        </section>
      </section>
    </main>
  );
}

export default function IcaResolutionPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { batchName } = useParams();

  const decodedBatchName = decodeURIComponent(
    batchName ?? "BAN_DEPOSI_FD_P_0117",
  );

  const routeState = location.state as {
    rca?: unknown;
    jobId?: string;
    status?: string;
    failureTimestamp?: string;
  } | null;

  const { data: failedJobsApiResponse, isFetching } =
    useGetDashboardJobsQuery({
      status: "FAILURE",
      lob: "",
      application: "",
      environment: "PROD",
    }) as {
      data?: DashboardJobsResponse;
      isFetching: boolean;
    };
    const failedJobs = React.useMemo(() => {
      if (failedJobsApiResponse?.data == null) {
        return [];
      }

      return failedJobsApiResponse.data.map(
        mapDashboardJobToFailedJob,
      );
    }, [failedJobsApiResponse]);

  const rcaFromRouteState = isIcaSupportedRcaCategory(routeState?.rca)
    ? routeState.rca
    : null;

  const rcaFromApi = React.useMemo<RcaCategory | null>(() => {
    const matchedJob = failedJobs.find(
      (job) => job.id === decodedBatchName,
    );

    if (!isIcaSupportedRcaCategory(matchedJob?.rca)) {
      return null;
    }

    return matchedJob.rca;
  }, [
    decodedBatchName,
    failedJobs,
  ]);


  const currentRcaCategory = rcaFromRouteState ?? rcaFromApi;

    const currentJobIndex = React.useMemo(
    () =>
      failedJobs.findIndex(
        (job) => job.id === decodedBatchName,
      ),
    [
      decodedBatchName,
      failedJobs,
    ],
  );

  const dataFreshnessSensitivity =
    React.useMemo<DataFreshnessSensitivity>(() => {
      if (currentRcaCategory === "Technical") {
        return "Low";
      }

    return deriveDataFreshnessSensitivityFromIndex(currentJobIndex);
  }, [currentRcaCategory, currentJobIndex]);


  if (currentRcaCategory == null && isFetching) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-300">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-[#0f1115] px-5 py-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          Loading ICA context...
        </div>
      </main>
    );
  }

  if (currentRcaCategory == null) {
    return (
      <SomethingWentWrongPage
        onGoBack={() => navigate(-1)}
        reason="Unable to load ICA context for this job. ICA resolution is available only for Completeness and Accuracy RCA categories."
      />
    );
  }

  return (
  <IcaResolutionErrorBoundary
    onGoBack={() => navigate(-1)}
  >
    <IcaResolutionPageContent
      currentRcaCategory={currentRcaCategory}
      dataFreshnessSensitivity={
        dataFreshnessSensitivity
      }
    />
  </IcaResolutionErrorBoundary>
);

}