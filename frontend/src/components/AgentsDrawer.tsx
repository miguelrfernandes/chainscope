"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Bot, Calendar, Copy, Check, RefreshCw, X, ExternalLink, Plus, Sparkles, Archive, RotateCcw, Coins, Bell, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";

import {
  deleteScheduledJob,
  deleteUserAgent,
  unarchiveUserAgent,
  fetchScheduledJobs,
  fetchUserAgents,
  fetchScheduledQueries,
  deleteScheduledQuery,
  fetchScheduledQueryRuns,
  markRunRead,
  type ManagedAgent,
  type ScheduledJob,
  type ScheduledQuery,
  type ScheduledQueryRun,
} from "@/lib/api";


type AgentsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  ownerAddress: string;
  onAskPrompt?: (prompt: string) => void;
  onPreparePrompt?: (prompt: string) => void;
  initialTab?: "wallet" | "agents" | "schedules" | "alerts";
};

function getCachedAgents(owner: string): ManagedAgent[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(`chainscope_cached_agents_${owner.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedAgents(owner: string, data: ManagedAgent[]) {
  if (typeof window === "undefined" || !owner) return;
  try {
    localStorage.setItem(`chainscope_cached_agents_${owner.toLowerCase()}`, JSON.stringify(data));
  } catch {}
}

function getCachedSchedules(owner: string): ScheduledJob[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(`chainscope_cached_schedules_${owner.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedSchedules(owner: string, data: ScheduledJob[]) {
  if (typeof window === "undefined" || !owner) return;
  try {
    localStorage.setItem(`chainscope_cached_schedules_${owner.toLowerCase()}`, JSON.stringify(data));
  } catch {}
}

function getCachedScheduledQueries(owner: string): ScheduledQuery[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(`chainscope_cached_scheduled_queries_${owner.toLowerCase()}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCachedScheduledQueries(owner: string, data: ScheduledQuery[]) {
  if (typeof window === "undefined" || !owner) return;
  try {
    localStorage.setItem(`chainscope_cached_scheduled_queries_${owner.toLowerCase()}`, JSON.stringify(data));
  } catch {}
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-white/10" />
        <div className="h-4 w-14 rounded bg-white/10" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-white/5" />
        <div className="h-3 w-3/4 rounded bg-white/5" />
      </div>
    </div>
  );
}

export function AgentsDrawer({
  isOpen,
  onClose,
  ownerAddress,
  onAskPrompt,
  onPreparePrompt,
  initialTab = "wallet",
}: AgentsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"wallet" | "agents" | "schedules" | "alerts">(initialTab);
  const [agents, setAgents] = useState<ManagedAgent[]>(() =>
    getCachedAgents(ownerAddress)
  );
  const [schedules, setSchedules] = useState<ScheduledJob[]>(() =>
    getCachedSchedules(ownerAddress)
  );
  const [scheduledQueries, setScheduledQueries] = useState<ScheduledQuery[]>(() =>
    getCachedScheduledQueries(ownerAddress)
  );
  const [queryRuns, setQueryRuns] = useState<Record<number, ScheduledQueryRun[]>>({});
  const [expandedQueryId, setExpandedQueryId] = useState<number | null>(null);
  const [loadingRunsQueryId, setLoadingRunsQueryId] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
  const [deletingQueryId, setDeletingQueryId] = useState<number | null>(null);
  const [deletingAgentName, setDeletingAgentName] = useState<string | null>(null);
  const [restoringAgentName, setRestoringAgentName] = useState<string | null>(null);

  const activeAgents = agents.filter((a) => a.status !== "ARCHIVED");
  const archivedAgents = agents.filter((a) => a.status === "ARCHIVED");

  useEffect(() => {
    if (isOpen && initialTab) {
      queueMicrotask(() => {
        setActiveTab(initialTab);
      });
    }
  }, [isOpen, initialTab]);


  useEffect(() => {
    let ignore = false;
    if (isOpen && ownerAddress) {
      queueMicrotask(() => {
        if (ignore) return;
        const cachedAgents = getCachedAgents(ownerAddress);
        const cachedJobs = getCachedSchedules(ownerAddress);
        const cachedQueries = getCachedScheduledQueries(ownerAddress);
        if (cachedAgents.length > 0) setAgents(cachedAgents);
        if (cachedJobs.length > 0) setSchedules(cachedJobs);
        if (cachedQueries.length > 0) setScheduledQueries(cachedQueries);
        setLoading(true);
        setError(null);
      });

      Promise.all([
        fetchUserAgents(ownerAddress),
        fetchScheduledJobs(),
        fetchScheduledQueries(ownerAddress),
      ])
        .then(([agentsData, jobsData, queriesData]) => {
          if (!ignore) {
            setAgents(agentsData);
            setSchedules(jobsData);
            setScheduledQueries(queriesData);
            setCachedAgents(ownerAddress, agentsData);
            setCachedSchedules(ownerAddress, jobsData);
            setCachedScheduledQueries(ownerAddress, queriesData);
          }
        })
        .catch((err) => {
          if (!ignore) {
            setError(
              err instanceof Error ? err.message : "Failed to load agent details"
            );
          }
        })
        .finally(() => {
          if (!ignore) {
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, ownerAddress]);

  function loadData() {
    if (!ownerAddress) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchUserAgents(ownerAddress),
      fetchScheduledJobs(),
      fetchScheduledQueries(ownerAddress),
    ])
      .then(([agentsData, jobsData, queriesData]) => {
        setAgents(agentsData);
        setSchedules(jobsData);
        setScheduledQueries(queriesData);
        setCachedAgents(ownerAddress, agentsData);
        setCachedSchedules(ownerAddress, jobsData);
        setCachedScheduledQueries(ownerAddress, queriesData);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load agent details"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function handleCancelScheduledQuery(queryId: number) {
    if (!ownerAddress) return;
    setDeletingQueryId(queryId);
    try {
      await deleteScheduledQuery(queryId, ownerAddress);
      setScheduledQueries((prev) => {
        const next = prev.filter((q) => q.id !== queryId);
        setCachedScheduledQueries(ownerAddress, next);
        return next;
      });
      // also refresh scheduled jobs
      const jobs = await fetchScheduledJobs();
      setSchedules(jobs);
      setCachedSchedules(ownerAddress, jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel scheduled query");
    } finally {
      setDeletingQueryId(null);
    }
  }

  async function toggleExpandQueryRuns(queryId: number) {
    if (expandedQueryId === queryId) {
      setExpandedQueryId(null);
      return;
    }
    setExpandedQueryId(queryId);
    if (!queryRuns[queryId]) {
      setLoadingRunsQueryId(queryId);
      try {
        const runs = await fetchScheduledQueryRuns(queryId, ownerAddress);
        setQueryRuns((prev) => ({ ...prev, [queryId]: runs }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run history");
      } finally {
        setLoadingRunsQueryId(null);
      }
    }
  }

  async function handleMarkRunRead(runId: number, queryId: number) {
    try {
      await markRunRead(runId, ownerAddress);
      setQueryRuns((prev) => {
        const existing = prev[queryId] || [];
        return {
          ...prev,
          [queryId]: existing.map((r) => (r.id === runId ? { ...r, is_read: 1 } : r)),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark run as read");
    }
  }

  function handleCopy(address: string) {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  }

  async function handleCancelSchedule(jobId: string) {
    setDeletingJobId(jobId);
    try {
      await deleteScheduledJob(jobId);
      setSchedules((prev) => {
        const next = prev.filter((j) => (j.job_id || j.id) !== jobId);
        setCachedSchedules(ownerAddress, next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel schedule");
    } finally {
      setDeletingJobId(null);
    }
  }

  async function handleArchiveAgent(agentName: string) {
    if (!ownerAddress) return;
    setDeletingAgentName(agentName);
    try {
      await deleteUserAgent(ownerAddress, agentName);
      setAgents((prev) => {
        const next = prev.map((a) =>
          a.agent_name === agentName ? { ...a, status: "ARCHIVED" } : a
        );
        setCachedAgents(ownerAddress, next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive agent");
    } finally {
      setDeletingAgentName(null);
    }
  }

  async function handleUnarchiveAgent(agentName: string) {
    if (!ownerAddress) return;
    setRestoringAgentName(agentName);
    try {
      await unarchiveUserAgent(ownerAddress, agentName);
      const updatedAgents = await fetchUserAgents(ownerAddress);
      setAgents(updatedAgents);
      setCachedAgents(ownerAddress, updatedAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore agent");
    } finally {
      setRestoringAgentName(null);
    }
  }

  function handleCreateAgent() {
    const prompt = "Create a new agent named yield-bot";
    if (onPreparePrompt) {
      onPreparePrompt(prompt);
    } else if (onAskPrompt) {
      onAskPrompt(prompt);
    }
    onClose();
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />

        {/* Drawer Container */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#070a09]/95 backdrop-blur-2xl shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">
                Wallet & Account Menu
              </h2>
              <p className="text-xs text-[var(--ink-dim)]">
                Manage connected accounts, sub-agents & scheduled jobs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={loading}
                title="Refresh details"
                className={`rounded-full border border-white/10 bg-white/5 p-2 text-xs text-[var(--ink-dim)] transition hover:bg-white/10 hover:text-[var(--ink)] disabled:opacity-50 ${
                  loading ? "animate-spin" : ""
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-xs text-[var(--ink-dim)] transition hover:bg-white/10 hover:text-[var(--ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-white/10 bg-white/[0.02] px-6">
            <button
              onClick={() => setActiveTab("wallet")}
              className={`flex items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition ${
                activeTab === "wallet"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
              Account
            </button>

            <button
              onClick={() => setActiveTab("agents")}
              className={`ml-5 flex items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition ${
                activeTab === "agents"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Sub-Agents ({activeAgents.length})
            </button>

            <button
              onClick={() => setActiveTab("schedules")}
              className={`ml-5 flex items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition ${
                activeTab === "schedules"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Schedules ({schedules.length})
            </button>

            <button
              onClick={() => setActiveTab("alerts")}
              className={`ml-5 flex items-center gap-1.5 border-b-2 py-3 text-xs font-semibold transition ${
                activeTab === "alerts"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              Alerts ({scheduledQueries.length})
            </button>
          </div>

          {/* Content Area */}
          <div className="relative flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#070a09]/50 backdrop-blur-xs animate-pulse pointer-events-none">
                <div className="flex items-center gap-2.5 rounded-full border border-[var(--accent)]/40 bg-[#131313] px-4 py-2 shadow-2xl">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]"></span>
                  </span>
                  <span className="text-xs font-medium text-[var(--accent)]">
                    Updating vault...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2.5 text-xs font-medium text-[var(--danger)]">
                ⚠️ {error}
              </div>
            )}

            {activeTab === "wallet" ? (
              <div className="flex flex-col gap-4">
                {/* Account Card */}
                <div className="rounded-2xl border border-white/10 bg-[#0d1210]/90 p-5 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)] shadow-[0_0_8px_var(--success)]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                        Connected EVM Wallet
                      </span>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-mono text-[var(--ink-dim)]">
                      Active
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-[var(--ink)]">
                      {ownerAddress ? `${ownerAddress.slice(0, 10)}...${ownerAddress.slice(-6)}` : "No EVM Wallet Connected"}
                    </span>
                    {ownerAddress && (
                      <button
                        onClick={() => handleCopy(ownerAddress)}
                        className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline font-medium"
                      >
                        {copiedAddress === ownerAddress ? (
                          <>
                            <Check className="h-3 w-3" /> copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sub-Agents Overview */}
                <div className="rounded-2xl border border-white/10 bg-[#0d1210]/90 p-5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-[var(--accent)]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                        Agent Vault Summary
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab("agents")}
                      className="text-xs font-medium text-[var(--accent)] hover:underline flex items-center gap-1"
                    >
                      view all <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--ink-dim)] leading-relaxed">
                    {activeAgents.length} active agent keypair{activeAgents.length === 1 ? "" : "s"} encrypted in AES-256-GCM Vault
                    {archivedAgents.length > 0 ? ` (${archivedAgents.length} archived)` : ""}.
                  </p>
                </div>
              </div>
            ) : activeTab === "agents" ? (
              <div className="flex flex-col gap-4">
                {agents.length === 0 && loading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : activeAgents.length === 0 && archivedAgents.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-center">
                    <Bot className="h-8 w-8 text-[var(--ink-faint)] mb-2" />
                    <p className="text-xs text-[var(--ink-dim)]">
                      No managed sub-agents found for this wallet.
                    </p>
                    <button
                      onClick={handleCreateAgent}
                      className="mt-4 flex items-center gap-1.5 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-ink)] shadow-[0_0_15px_rgba(255,180,84,0.25)] transition hover:bg-[var(--accent)]/90"
                    >
                      <Plus className="h-3.5 w-3.5" /> Provision New Agent
                    </button>
                  </div>
                ) : (
                  <>
                    {activeAgents.length === 0 && (
                      <div className="rounded-xl border border-white/5 bg-white/5 p-4 text-center text-xs text-[var(--ink-dim)]">
                        No active sub-agents. Archived agents are shown below.
                      </div>
                    )}
                    {activeAgents.map((agent) => (
                      <div
                        key={agent.agent_name}
                        className="rounded-2xl border border-white/10 bg-[#0d1210]/90 p-5 shadow-xl transition hover:border-[var(--accent)]/30"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                            <Bot className="h-4 w-4 text-[var(--accent)]" /> {agent.agent_name}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold border ${
                              agent.status === "ACTIVE"
                                ? "border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {agent.status}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-col gap-1.5 text-xs">
                          <div className="flex items-center justify-between text-[var(--ink-dim)]">
                            <span>Hedera Account:</span>
                            <span className="font-mono text-[var(--ink)] font-medium">
                              {agent.account_id || "Pending creation"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[var(--ink-dim)]">
                            <span>EVM Alias:</span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] text-[var(--ink)]">
                                {agent.evm_address.slice(0, 8)}...{agent.evm_address.slice(-6)}
                              </span>
                              <button
                                onClick={() => handleCopy(agent.evm_address)}
                                className="text-[10px] text-[var(--accent)] hover:underline"
                              >
                                {copiedAddress === agent.evm_address ? "copied!" : "copy"}
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[var(--ink-dim)]">
                            <span>Live Balance:</span>
                            <span className="font-semibold text-[var(--success)]">
                              {agent.balance_hbar.toFixed(2)} HBAR
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-white/10 pt-3 flex items-center justify-between">
                          <div className="text-[10px] text-[var(--ink-faint)]">
                            Created: {new Date(agent.created_at).toLocaleString()}
                          </div>
                          <div className="flex items-center gap-2">
                            {agent.status === "PENDING" && (
                              <button
                                onClick={() => {
                                  const prompt = `Seed agent ${agent.agent_name} with 1 HBAR`;
                                  if (onPreparePrompt) onPreparePrompt(prompt);
                                  else if (onAskPrompt) onAskPrompt(prompt);
                                  onClose();
                                }}
                                className="flex items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
                              >
                                <Sparkles className="h-3 w-3" /> Provision & Seed
                              </button>
                            )}
                            {agent.status === "ACTIVE" && (
                              <button
                                onClick={() => {
                                  const prompt = `Create a fungible token named ${agent.agent_name}-TOKEN with symbol ${agent.agent_name.slice(0, 4).toUpperCase()} for agent ${agent.agent_name}`;
                                  if (onPreparePrompt) onPreparePrompt(prompt);
                                  else if (onAskPrompt) onAskPrompt(prompt);
                                  onClose();
                                }}
                                className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500 hover:text-white"
                                title="Create an HTS token for this agent"
                              >
                                <Coins className="h-3 w-3" /> Create Token
                              </button>
                            )}
                            <button
                              onClick={() => handleArchiveAgent(agent.agent_name)}
                              disabled={deletingAgentName === agent.agent_name}
                              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-amber-400/90 border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-300 transition disabled:opacity-50"
                              title="Archive Agent (Hide in Archive)"
                            >
                              <Archive className="h-3 w-3" />
                              {deletingAgentName === agent.agent_name ? "Archiving..." : "Archive"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Archived Agents Section */}
                    {archivedAgents.length > 0 && (
                      <div className="mt-6 border-t border-white/10 pt-5">
                        <div className="flex items-center gap-2 mb-3 px-1 text-xs font-bold uppercase tracking-wider text-[var(--ink-dim)]">
                          <Archive className="h-3.5 w-3.5 text-zinc-400" />
                          <span>Archived Agents ({archivedAgents.length})</span>
                        </div>
                        <div className="flex flex-col gap-3">
                          {archivedAgents.map((agent) => (
                            <div
                              key={agent.agent_name}
                              className="rounded-2xl border border-white/5 bg-[#090d0b]/70 p-4 shadow-md transition opacity-80 hover:opacity-100"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-sm text-zinc-300 flex items-center gap-2">
                                  <Bot className="h-4 w-4 text-zinc-500" /> {agent.agent_name}
                                </span>
                                <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                                  ARCHIVED
                                </span>
                              </div>

                              <div className="mt-2.5 flex flex-col gap-1 text-xs text-zinc-400">
                                <div className="flex items-center justify-between">
                                  <span>Hedera Account:</span>
                                  <span className="font-mono text-zinc-300 font-medium">
                                    {agent.account_id || "Pending creation"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>EVM Alias:</span>
                                  <span className="font-mono text-[11px] text-zinc-300">
                                    {agent.evm_address ? `${agent.evm_address.slice(0, 8)}...${agent.evm_address.slice(-6)}` : "N/A"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3 border-t border-white/5 pt-2.5 flex items-center justify-between">
                                <div className="text-[10px] text-zinc-500">
                                  Created: {new Date(agent.created_at).toLocaleString()}
                                </div>
                                <button
                                  onClick={() => handleUnarchiveAgent(agent.agent_name)}
                                  disabled={restoringAgentName === agent.agent_name}
                                  className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  {restoringAgentName === agent.agent_name ? "Restoring..." : "Restore"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {agents.length > 0 && (
                  <button
                    onClick={handleCreateAgent}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] py-2.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Provision New Agent
                  </button>
                )}
              </div>
            ) : activeTab === "schedules" ? (
              <div className="flex flex-col gap-4">
                {schedules.length === 0 && loading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : schedules.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[var(--ink-dim)]">
                    No active background cron jobs scheduled.
                  </div>
                ) : (
                  schedules.map((job) => {
                    const id = job.job_id || job.id;
                    return (
                      <div
                        key={id}
                        className="rounded-2xl border border-white/10 bg-[#0d1210]/90 p-5 shadow-xl"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-[var(--ink)] truncate max-w-[200px]">
                            {id}
                          </span>
                          <button
                            onClick={() => handleCancelSchedule(id)}
                            disabled={deletingJobId === id}
                            className="rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1 text-[10px] font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-white disabled:opacity-50"
                          >
                            {deletingJobId === id ? "Canceling..." : "Cancel"}
                          </button>
                        </div>

                        <div className="mt-3 flex flex-col gap-1.5 text-xs text-[var(--ink-dim)]">
                          <div className="flex items-center justify-between">
                            <span>Trigger:</span>
                            <span className="font-mono text-[var(--ink)]">
                              {job.trigger}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Next Run:</span>
                            <span className="text-[var(--ink)]">
                              {job.next_run_time
                                ? new Date(job.next_run_time).toLocaleString()
                                : "N/A"}
                            </span>
                          </div>
                          {job.args && job.args.length > 0 && (
                            <div className="flex items-center justify-between">
                              <span>Agent Target:</span>
                              <span className="font-semibold text-[var(--accent)]">
                                {job.args[1] || job.args[0]}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* activeTab === "alerts" */
              <div className="flex flex-col gap-4">
                {scheduledQueries.length === 0 && loading ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : scheduledQueries.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[var(--ink-dim)]">
                    No scheduled question alerts created yet. Try asking: &quot;Set up daily alerts for USDC whale transactions&quot;
                  </div>
                ) : (
                  scheduledQueries.map((query) => {
                    const matchingJob = schedules.find(
                      (j) => (j.job_id || j.id) === (query.job_id || `query-${query.id}`)
                    );
                    const isExpanded = expandedQueryId === query.id;
                    const runs = queryRuns[query.id] || [];
                    const unreadCount = runs.filter((r) => r.is_read === 0).length;

                    return (
                      <div
                        key={query.id}
                        className="rounded-2xl border border-white/10 bg-[#0d1210]/90 p-5 shadow-xl flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[var(--ink)]">
                              {query.name}
                            </span>
                            {unreadCount > 0 && (
                              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)]">
                                {unreadCount} new
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleCancelScheduledQuery(query.id)}
                            disabled={deletingQueryId === query.id}
                            className="rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-1 text-[10px] font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-white disabled:opacity-50"
                          >
                            {deletingQueryId === query.id ? "Canceling..." : "Cancel"}
                          </button>
                        </div>

                        <p className="text-xs text-[var(--ink-dim)] bg-white/5 rounded-lg p-2.5 font-mono">
                          {query.prompt}
                        </p>

                        <div className="flex flex-col gap-1 text-[11px] text-[var(--ink-dim)]">
                          <div className="flex items-center justify-between">
                            <span>Cron Schedule:</span>
                            <span className="font-mono text-[var(--ink)]">{query.cron_expression}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Next Run:</span>
                            <span className="text-[var(--ink)]">
                              {matchingJob?.next_run_time
                                ? new Date(matchingJob.next_run_time).toLocaleString()
                                : "Scheduled"}
                            </span>
                          </div>
                        </div>

                        <div className="border-t border-white/10 pt-2">
                          <button
                            onClick={() => toggleExpandQueryRuns(query.id)}
                            className="flex w-full items-center justify-between text-xs font-semibold text-[var(--accent)] hover:underline"
                          >
                            <span>
                              Run History Inbox {runs.length > 0 ? `(${runs.length})` : ""}
                            </span>
                            {loadingRunsQueryId === query.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 flex flex-col gap-2.5 max-h-60 overflow-y-auto">
                              {runs.length === 0 ? (
                                <p className="text-[11px] text-[var(--ink-faint)] py-2 text-center">
                                  No runs recorded yet for this alert.
                                </p>
                              ) : (
                                runs.map((run) => (
                                  <div
                                    key={run.id}
                                    className={`rounded-xl border p-3 text-xs transition ${
                                      run.is_read === 0
                                        ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]/20"
                                        : "border-white/5 bg-white/[0.02]"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-[10px] text-[var(--ink-dim)]">
                                        {new Date(run.run_at).toLocaleString()}
                                      </span>
                                      {run.is_read === 0 && (
                                        <button
                                          onClick={() => handleMarkRunRead(run.id, query.id)}
                                          className="flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline"
                                        >
                                          <CheckCircle className="h-3 w-3" /> Mark read
                                        </button>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-[var(--ink)] whitespace-pre-wrap leading-relaxed">
                                      {run.answer}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
