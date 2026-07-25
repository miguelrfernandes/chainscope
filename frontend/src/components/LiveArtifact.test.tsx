import { describe, expect, it } from "vitest";
import { LiveArtifact } from "./LiveArtifact";

describe("LiveArtifact component", () => {
  it("renders HederaEvmActionCard for action/hedera-evm-tx-batch", () => {
    const artifact = {
      type: "action/hedera-evm-tx-batch",
      data: JSON.stringify({
        human_message: "Schedule recurring transfer of 1 HBAR to 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB every 28800 seconds",
        steps: [
          {
            label: "Create Scheduled Vault",
            to: "0x1111111111111111111111111111111111111111",
            data: "0xb4bd6f46",
            value: "0x0",
          },
          {
            label: "Configure recurring transfer",
            to: "0x2222222222222222222222222222222222222222",
            data: "0xba674903",
            value: "0x0",
          },
        ],
      }),
    };

    const element = LiveArtifact({ artifact });
    expect(element).not.toBeNull();
    expect(element?.type).toBeDefined();
    expect(element?.props.payload.human_message).toContain("Schedule recurring transfer");
    expect(element?.props.payload.steps).toHaveLength(2);
  });

  it("renders HederaEvmActionCard for action/hedera-evm-tx", () => {
    const artifact = {
      type: "action/hedera-evm-tx",
      data: JSON.stringify({
        human_message: "Transfer 5 HBAR to 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB",
        to: "0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB",
        value: "0x4563918244f40000",
        data: "0x",
      }),
    };

    const element = LiveArtifact({ artifact });
    expect(element).not.toBeNull();
    expect(element?.props.payload.human_message).toBe("Transfer 5 HBAR to 0x53b87eAC409C46A2CfDdB10e761dFD0F3d58A0cB");
  });

  it("returns null for unknown artifact type", () => {
    const artifact = {
      type: "unknown/type",
      data: "{}",
    };

    const element = LiveArtifact({ artifact });
    expect(element).toBeNull();
  });
});
