import { describe, expect, it } from "vitest";
import { HistorySidebar } from "./HistorySidebar";

describe("HistorySidebar component", () => {
  const defaultProps = {
    activeId: null,
    onSelectExample: () => {},
    onSelectThread: () => {},
    onDeleteThread: () => {},
    onNewChat: () => {},
    threads: [],
    walletConnected: false,
  };

  it("does not render 'your history' or wallet notice when walletConnected is false", () => {
    const element = HistorySidebar({ ...defaultProps, walletConnected: false });
    // children[1] is the main flex container div
    const contentDiv = element.props.children[1];
    const historySection = contentDiv.props.children[0];

    expect(historySection).toBe(false);
  });

  it("renders 'your history' section when walletConnected is true", () => {
    const element = HistorySidebar({ ...defaultProps, walletConnected: true, threads: [] });
    const contentDiv = element.props.children[1];
    const historySection = contentDiv.props.children[0];

    expect(historySection).not.toBe(false);
    expect(historySection.type).toBeDefined();
    // React Fragment children
    const fragmentChildren = historySection.props.children;
    expect(fragmentChildren[0].props.children).toBe("your history");
    expect(fragmentChildren[1].props.children).toBe("Real questions you ask the live agents will show up here.");
  });
});
