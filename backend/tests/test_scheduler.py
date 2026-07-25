from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from hiero_sdk_python import PrivateKey

from app.core.agent_store import set_agent_account_and_status
from app.core.config import get_settings
from app.core.scheduler import (
    execute_autonomous_hedera_action,
    get_scheduler,
    init_scheduler,
    list_scheduled_jobs,
    remove_scheduled_job,
    run_scheduled_rebalance,
    schedule_rebalance_job,
    shutdown_scheduler,
)
from app.main import app
from app.tools.hedera_provisioner import Vault, encrypt_private_key


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    monkeypatch.setenv("SCHEDULER_DB_PATH", str(tmp_path / "scheduler.db"))
    get_settings.cache_clear()
    yield
    shutdown_scheduler()
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_scheduler_init_and_shutdown(tmp_path):
    db_file = str(tmp_path / "test_scheduler.db")
    sched = init_scheduler(db_file)
    assert sched is not None
    assert sched.running is True
    assert get_scheduler() == sched

    shutdown_scheduler()
    assert get_scheduler() is None


def test_execute_autonomous_hedera_action_from_vault(tmp_path):
    owner = "0x1234567890123456789012345678901234567890"
    agent_name = "YieldSentinel"
    account_id = "0.0.78492"

    raw_key = PrivateKey.generate_ecdsa().to_string_der()
    encrypted_key = encrypt_private_key(raw_key)
    Vault.register_agent(
        name=agent_name,
        evm_address="0xb081bd3b7845046d3019128968144ca13a13bcd2",
        encrypted_private_key=encrypted_key,
        owner_address=owner,
    )
    # Simulate a completed seed-funding flow — the account only exists
    # (and autonomous execution is only meaningful) once confirm-agent has
    # resolved a real account_id and flipped the agent ACTIVE.
    set_agent_account_and_status(owner, agent_name, account_id, "ACTIVE")

    res = execute_autonomous_hedera_action(owner, agent_name, action_type="rebalance")
    assert res["owner_address"] == owner
    assert res["agent_name"] == agent_name
    assert res["account_id"] == account_id
    assert res["action_type"] == "rebalance"
    assert res["status"] in ("success", "simulated")
    assert "transaction_id" in res
    assert "timestamp" in res


def test_execute_autonomous_action_missing_agent():
    with pytest.raises(ValueError, match="not found in Vault"):
        execute_autonomous_hedera_action("0xmissing", "NonExistentAgent")


@pytest.mark.asyncio
async def test_schedule_and_list_remove_jobs(tmp_path):
    db_file = str(tmp_path / "sched_jobs.db")
    init_scheduler(db_file)

    owner = "0x1234567890123456789012345678901234567890"
    agent_name = "YieldSentinel"
    account_id = "0.0.78492"

    raw_key = PrivateKey.generate_ecdsa().to_string_der()
    encrypted_key = encrypt_private_key(raw_key)
    Vault.register_agent(
        name=agent_name,
        evm_address="0xb081bd3b7845046d3019128968144ca13a13bcd2",
        encrypted_private_key=encrypted_key,
        owner_address=owner,
    )
    set_agent_account_and_status(owner, agent_name, account_id, "ACTIVE")

    job_id = schedule_rebalance_job(owner, agent_name, cron_expression="0 0 * * *")
    assert job_id == f"cron-{agent_name}-{account_id}-rebalance"

    jobs = list_scheduled_jobs()
    assert len(jobs) == 1
    assert jobs[0]["id"] == job_id
    assert "cron" in jobs[0]["trigger"]

    # Test top-level task execution handler
    run_res = run_scheduled_rebalance(owner, agent_name)
    assert run_res["agent_name"] == agent_name

    # Remove job
    removed = remove_scheduled_job(job_id)
    assert removed is True
    assert len(list_scheduled_jobs()) == 0


def test_fastapi_lifespan_scheduler():
    with patch("app.main.get_subgraph_tools", new_callable=AsyncMock):
        with TestClient(app) as client:
            res = client.get("/health")
            assert res.status_code == 200
            sched = get_scheduler()
            assert sched is not None
            assert sched.running is True

        assert get_scheduler() is None
