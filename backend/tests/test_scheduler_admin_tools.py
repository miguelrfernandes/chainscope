import json

import pytest
from hiero_sdk_python import PrivateKey

from app.agents.specialists.scheduler_admin import (
    make_cancel_wallet_rebalance_job_tool,
    make_list_wallet_rebalance_jobs_tool,
    make_schedule_wallet_rebalance_tool,
)
from app.core.agent_store import set_agent_account_and_status
from app.core.config import get_settings
from app.core.scheduler import init_scheduler, shutdown_scheduler
from app.tools.hedera_provisioner import Vault, encrypt_private_key

OWNER = "0x1234567890123456789012345678901234567890"
OTHER_OWNER = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
AGENT_NAME = "YieldSentinel"
ACCOUNT_ID = "0.0.78492"


@pytest.fixture(autouse=True)
def _isolated_env(tmp_path, monkeypatch):
    monkeypatch.setenv("MANAGED_AGENT_DB_PATH", str(tmp_path / "managed_agents.db"))
    monkeypatch.setenv("SCHEDULER_DB_PATH", str(tmp_path / "scheduler.db"))
    get_settings.cache_clear()
    yield
    shutdown_scheduler()
    get_settings.cache_clear()


def _register_active_agent(owner=OWNER, name=AGENT_NAME, account_id=ACCOUNT_ID):
    raw_key = PrivateKey.generate_ecdsa().to_string_der()
    encrypted_key = encrypt_private_key(raw_key)
    Vault.register_agent(
        name=name,
        evm_address="0xb081bd3b7845046d3019128968144ca13a13bcd2",
        encrypted_private_key=encrypted_key,
        owner_address=owner,
    )
    set_agent_account_and_status(owner, name, account_id, "ACTIVE")


@pytest.mark.asyncio
async def test_schedule_wallet_rebalance_success(tmp_path):
    init_scheduler(str(tmp_path / "scheduler.db"))
    _register_active_agent()
    tool = make_schedule_wallet_rebalance_tool(OWNER)

    result = json.loads(
        tool.invoke(
            {
                "agent_name": AGENT_NAME,
                "target_account_id": "0.0.999",
                "amount_hbar": 2.5,
                "cron_expression": "0 0 * * *",
            }
        )
    )

    assert result["status"] == "success"
    assert result["job_id"] == f"cron-{AGENT_NAME}-{ACCOUNT_ID}-rebalance"

    list_tool = make_list_wallet_rebalance_jobs_tool(OWNER)
    listed = json.loads(list_tool.invoke({}))
    assert listed["count"] == 1
    assert listed["jobs"][0]["id"] == result["job_id"]


@pytest.mark.asyncio
async def test_schedule_wallet_rebalance_unknown_agent(tmp_path):
    init_scheduler(str(tmp_path / "scheduler.db"))
    tool = make_schedule_wallet_rebalance_tool(OWNER)

    result = json.loads(
        tool.invoke(
            {
                "agent_name": "NoSuchAgent",
                "target_account_id": "0.0.999",
                "amount_hbar": 1.0,
            }
        )
    )

    assert result["status"] == "error"
    assert "not found" in result["message"]


@pytest.mark.asyncio
async def test_schedule_wallet_rebalance_rejects_bad_amount_and_account(tmp_path):
    init_scheduler(str(tmp_path / "scheduler.db"))
    _register_active_agent()
    tool = make_schedule_wallet_rebalance_tool(OWNER)

    bad_amount = json.loads(
        tool.invoke({"agent_name": AGENT_NAME, "target_account_id": "0.0.999", "amount_hbar": 0})
    )
    assert bad_amount["status"] == "error"

    bad_account = json.loads(
        tool.invoke({"agent_name": AGENT_NAME, "target_account_id": "not-an-account", "amount_hbar": 1.0})
    )
    assert bad_account["status"] == "error"


@pytest.mark.asyncio
async def test_wallet_rebalance_jobs_are_owner_scoped(tmp_path):
    init_scheduler(str(tmp_path / "scheduler.db"))
    _register_active_agent(owner=OWNER, name=AGENT_NAME, account_id=ACCOUNT_ID)
    _register_active_agent(owner=OTHER_OWNER, name="OtherAgent", account_id="0.0.11111")

    make_schedule_wallet_rebalance_tool(OWNER).invoke(
        {"agent_name": AGENT_NAME, "target_account_id": "0.0.999", "amount_hbar": 1.0}
    )
    other_result = json.loads(
        make_schedule_wallet_rebalance_tool(OTHER_OWNER).invoke(
            {"agent_name": "OtherAgent", "target_account_id": "0.0.888", "amount_hbar": 1.0}
        )
    )
    other_job_id = other_result["job_id"]

    owner_jobs = json.loads(make_list_wallet_rebalance_jobs_tool(OWNER).invoke({}))
    assert owner_jobs["count"] == 1
    assert owner_jobs["jobs"][0]["args"][0] == OWNER

    # Owner cannot cancel the other owner's job.
    cancel_result = json.loads(
        make_cancel_wallet_rebalance_job_tool(OWNER).invoke({"job_id": other_job_id})
    )
    assert cancel_result["status"] == "error"


@pytest.mark.asyncio
async def test_cancel_wallet_rebalance_job(tmp_path):
    init_scheduler(str(tmp_path / "scheduler.db"))
    _register_active_agent()
    schedule_result = json.loads(
        make_schedule_wallet_rebalance_tool(OWNER).invoke(
            {"agent_name": AGENT_NAME, "target_account_id": "0.0.999", "amount_hbar": 1.0}
        )
    )

    cancel_result = json.loads(
        make_cancel_wallet_rebalance_job_tool(OWNER).invoke({"job_id": schedule_result["job_id"]})
    )
    assert cancel_result["status"] == "success"

    listed = json.loads(make_list_wallet_rebalance_jobs_tool(OWNER).invoke({}))
    assert listed["count"] == 0
