"use client";

import { useEffect, useState } from "react";
import {
  deleteScheduledJob,
  fetchScheduledJobs,
  fetchUserAgents,
  type ManagedAgent,
  type ScheduledJob,
} from "@/lib/api";

type AgentsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  ownerAddress: string;
  onAskPrompt?: (prompt: string) => void;
};

export function AgentsDrawer({
  isOpen,
  onClose,
  ownerAddress,
  onAskPrompt,
}: AgentsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"agents" | "schedules">("agents");
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [schedules, setSchedules] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    if (isOpen && ownerAddress) {
      queueMicrotask(() => {
        if (ignore) return;
        setLoading(true);
        setError(null);
        Promise.all([fetchUserAgents(ownerAddress), fetchScheduledJobs()])
          .then(([agentsData, jobsData]) => {
            if (!ignore) {
              setAgents(agentsData);
              setSchedules(jobsData);
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
    Promise.all([fetchUserAgents(ownerAddress), fetchScheduledJobs()])
      .then(([agentsData, jobsData]) => {
        setAgents(agentsData);
        setSchedules(jobsData);
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

  function handleCopy(address: string) {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  }

  async function handleCancelSchedule(jobId: string) {
    setDeletingJobId(jobId);
    try {
      await deleteScheduledJob(jobId);
      setSchedules((prev) => prev.filter((j) => (j.job_id || j.id) !== jobId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel schedule");
    } finally {
      setDeletingJobId(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Container */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl transition-transform duration-300">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">
              Managed Sub-Agents
            </h2>
            <p className="text-xs text-[var(--ink-dim)]">
              Hedera Vault & Autonomous Scheduler
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              title="Refresh"
              className="border border-[var(--border)] bg-[var(--bg-raised)] p-1.5 text-xs text-[var(--ink-dim)] transition hover:text-[var(--ink)] disabled:opacity-50"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="border border-[var(--border)] bg-[var(--bg-raised)] px-2.5 py-1 text-xs text-[var(--ink-dim)] transition hover:text-[var(--ink)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[var(--border)] bg-[var(--bg-raised)]/40 px-5">
          <button
            onClick={() => setActiveTab("agents")}
            className={`border-b-2 py-2.5 text-xs font-medium transition ${
              activeTab === "agents"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            Agents ({agents.length})
          </button>
          <button
            onClick={() => setActiveTab("schedules")}
            className={`ml-6 border-b-2 py-2.5 text-xs font-medium transition ${
              activeTab === "schedules"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--ink-dim)] hover:text-[var(--ink)]"
            }`}
          >
            Schedules ({schedules.length})
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3.5 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex py-12 justify-center text-xs text-[var(--ink-dim)]">
              Loading agent details...
            </div>
          ) : activeTab === "agents" ? (
            <div className="flex flex-col gap-4">
              {agents.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <p className="text-xs text-[var(--ink-dim)]">
                    No managed sub-agents found for this wallet.
                  </p>
                  <button
                    onClick={() => {
                      onAskPrompt?.("Create a new agent named yield-bot");
                      onClose();
                    }}
                    className="mt-4 border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-ink)] transition hover:bg-[var(--accent)]/85"
                  >
                    + Provision New Agent
                  </button>
                </div>
              ) : (
                agents.map((agent) => (
                  <div
                    key={agent.agent_name}
                    className="border border-[var(--border)] bg-[var(--bg-raised)]/60 p-4 transition hover:border-[var(--accent)]/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[var(--ink)]">
                        {agent.agent_name}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border ${
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
                        <span className="font-mono text-[var(--ink)]">
                          {agent.account_id || "Pending creation"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[var(--ink-dim)]">
                        <span>EVM Address:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-[var(--ink)]">
                            {agent.evm_address.slice(0, 8)}...
                            {agent.evm_address.slice(-6)}
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

                    <div className="mt-3 border-t border-[var(--border)]/60 pt-2 text-[10px] text-[var(--ink-faint)]">
                      Created: {new Date(agent.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}

              {agents.length > 0 && (
                <button
                  onClick={() => {
                    onAskPrompt?.("Create a new agent named yield-bot");
                    onClose();
                  }}
                  className="mt-2 w-full border border-[var(--accent)]/50 bg-[var(--accent-soft)] py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
                >
                  + Provision New Agent
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {schedules.length === 0 ? (
                <div className="py-10 text-center text-xs text-[var(--ink-dim)]">
                  No active background cron jobs scheduled.
                </div>
              ) : (
                schedules.map((job) => {
                  const id = job.job_id || job.id;
                  return (
                    <div
                      key={id}
                      className="border border-[var(--border)] bg-[var(--bg-raised)]/60 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-[var(--ink)] truncate max-w-[200px]">
                          {id}
                        </span>
                        <button
                          onClick={() => handleCancelSchedule(id)}
                          disabled={deletingJobId === id}
                          className="border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-2 py-0.5 text-[10px] text-[var(--danger)] transition hover:bg-[var(--danger)] hover:text-white disabled:opacity-50"
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
                            <span className="font-medium text-[var(--accent)]">
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
          )}
        </div>
      </div>
    </div>
  );
}
