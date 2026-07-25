"""Hedera Account Provisioner Tool — provisions new Hedera agent keys
on demand. Generates an ECDSA keypair and derives its real EVM address
(PublicKey.to_evm_address()); the Hedera account itself doesn't exist yet at
this point — no operator account or AccountCreateTransaction is involved.
It springs into existence via Hedera's Auto Account Creation the moment the
user funds that EVM address with the 1 HBAR seed transfer, and
app/api/agent_actions.py resolves the resulting native account_id from
Mirror Node once that happens. Private keys are encrypted via AES-256-GCM
and registered to the Vault immediately, since the key is what identifies
the agent from the start.
"""

import hashlib
import json
import os
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from hiero_sdk_python import PrivateKey
from langchain_core.tools import tool

from app.core.agent_store import get_agent_by_name, get_user_agents, save_agent
from app.core.config import get_settings


def _get_encryption_key(secret_key: Optional[str] = None) -> bytes:
    """Derive a 32-byte key for AES-256-GCM encryption."""
    key_source = secret_key or get_settings().agent_vault_encryption_key
    return hashlib.sha256(key_source.encode("utf-8")).digest()


def encrypt_private_key(private_key_raw: str, secret_key: Optional[str] = None) -> str:
    """Encrypt a raw private key string using AES-256-GCM.
    Returns format: 'nonce_hex:ciphertext_hex'.
    """
    key = _get_encryption_key(secret_key)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, private_key_raw.encode("utf-8"), None)
    return f"{nonce.hex()}:{ciphertext.hex()}"


def decrypt_private_key(encrypted_str: str, secret_key: Optional[str] = None) -> str:
    """Decrypt an AES-256-GCM encrypted private key string ('nonce_hex:ciphertext_hex')."""
    key = _get_encryption_key(secret_key)
    aesgcm = AESGCM(key)
    nonce_hex, ct_hex = encrypted_str.split(":", 1)
    nonce = bytes.fromhex(nonce_hex)
    ciphertext = bytes.fromhex(ct_hex)
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


def derive_evm_address(public_key: Any) -> str:
    """The real 20-byte EVM address derived from an ECDSA public key
    (keccak(pubkey)[-20:], same derivation Ethereum/MetaMask use) — this is
    what Hedera's Auto Account Creation keys off of, unlike the long-zero
    `0x{account_num:040x}` alias which only exists once an account already
    has a number."""
    return f"0x{public_key.to_evm_address().to_string()}"


class Vault:
    """Vault helper interface for registering and fetching encrypted agent records."""

    @staticmethod
    def register_agent(
        name: str,
        evm_address: str,
        encrypted_private_key: str,
        owner_address: str = "0xdefault_owner",
    ) -> Dict[str, Any]:
        save_agent(owner_address, name, evm_address, encrypted_private_key)
        return {
            "owner_address": owner_address,
            "name": name,
            "account_id": "",
            "evm_address": evm_address,
            "encrypted_private_key": encrypted_private_key,
        }

    @staticmethod
    def get_agent(owner_address: str, name: str) -> Optional[Dict[str, Any]]:
        return get_agent_by_name(owner_address, name)

    @staticmethod
    def list_agents(owner_address: str) -> List[Dict[str, Any]]:
        return get_user_agents(owner_address)


def _provision_hedera_agent(name: str, owner_wallet_address: str = "0xdefault_owner") -> str:
    """Provisions a new Hedera sub-agent key on demand.
    Generates an ECDSA keypair and derives its real EVM address, encrypts the
    private key via AES-256-GCM and registers the record to the Vault, and
    returns an initial seed funding action payload for 1 HBAR. The account
    itself is created on-chain (Auto Account Creation) the moment that
    seed funding lands — see app/api/agent_actions.py.
    """
    # 1. Generate ECDSA keypair — required for Auto Account Creation, which
    # keys off a real public-key-derived EVM address (not the long-zero
    # `0x{account_num:040x}` alias, which doesn't exist until an account does).
    private_key = PrivateKey.generate_ecdsa()
    public_key = private_key.public_key()
    private_key_der = private_key.to_string_der()
    public_key_der = public_key.to_string_der()
    evm_address = derive_evm_address(public_key)

    # 2. Encrypt private key via AES-256-GCM
    encrypted_key = encrypt_private_key(private_key_der)

    # 3. Register record to Vault (no account_id yet — resolved on seed funding)
    owner_addr = owner_wallet_address or "0xdefault_owner"
    Vault.register_agent(
        name=name,
        evm_address=evm_address,
        encrypted_private_key=encrypted_key,
        owner_address=owner_addr,
    )

    # 4. Return initial seed funding action payload (1 HBAR)
    payload = {
        "status": "success",
        "name": name,
        "account_id": None,
        "evm_address": evm_address,
        "public_key": public_key_der,
        "vault_registered": True,
        "message": (
            f"Successfully generated a new Hedera sub-agent key for **{name}** "
            f"(EVM address `{evm_address[:8]}...{evm_address[-4:]}`) tied to your wallet. "
            "Private key has been encrypted with AES-256-GCM and registered to Vault. "
            "The agent's Hedera account doesn't exist on-chain yet — send the 1 HBAR "
            "initial seed funding below to auto-create and activate it."
        ),
        "action": {
            "type": "action/seed-agent-hbar",
            "id": "seed-agent-hbar",
            "label": f"Seed {name} with 1 HBAR",
            "description": f"Fund your newly created agent key for {name} ({evm_address}) with 1 HBAR from your connected wallet to create its Hedera account.",
            "protocol": "Hedera Testnet",
            "recipient_account_id": evm_address,
            "value": "1 HBAR",
            "amount_hbar": 1.0,
            "cta": "Seed 1 HBAR",
        },
    }
    return json.dumps(payload, indent=2)


def make_provision_hedera_agent_tool(owner_wallet_address: str):
    """Factory creating a provision_hedera_agent tool with owner_wallet_address bound."""

    @tool
    def provision_hedera_agent(name: str) -> str:
        """Provisions a new Hedera sub-agent key on demand.
        Generates an ECDSA keypair and derives its real EVM address, encrypts
        the private key via AES-256-GCM and registers the record to the
        Vault, and returns an initial seed funding action payload for 1 HBAR
        — the account itself is auto-created on-chain once that lands.
        """
        return _provision_hedera_agent(name, owner_wallet_address=owner_wallet_address)

    return provision_hedera_agent


@tool
def provision_hedera_agent(name: str, owner_wallet_address: str = "0xdefault_owner") -> str:
    """Provisions a new Hedera sub-agent key on demand.
    Generates an ECDSA keypair and derives its real EVM address, encrypts
    the private key via AES-256-GCM and registers the record to the Vault,
    and returns an initial seed funding action payload for 1 HBAR — the
    account itself is auto-created on-chain once that lands.
    """
    return _provision_hedera_agent(name, owner_wallet_address=owner_wallet_address)


@tool
def list_hedera_agents(owner_wallet_address: str = "0xdefault_owner") -> str:
    """Lists all managed Hedera sub-agents registered to the given owner wallet address in the Vault."""
    agents = Vault.list_agents(owner_wallet_address)
    return json.dumps({"status": "success", "count": len(agents), "agents": agents}, indent=2)


@tool
def get_hedera_agent(name: str, owner_wallet_address: str = "0xdefault_owner") -> str:
    """Gets details and address information for a specific managed Hedera sub-agent by name from the Vault."""
    agent = Vault.get_agent(owner_wallet_address, name)
    if not agent:
        return json.dumps(
            {
                "status": "error",
                "message": f"Agent '{name}' not found for owner '{owner_wallet_address}'.",
            },
            indent=2,
        )

    account_id = agent.get("account_id") or None
    return json.dumps(
        {
            "status": "success",
            "name": agent["agent_name"],
            "account_id": account_id,
            "evm_address": agent.get("evm_address", ""),
            "lifecycle_status": agent.get("status", "UNKNOWN"),
            "created_at": agent.get("created_at", ""),
        },
        indent=2,
    )
