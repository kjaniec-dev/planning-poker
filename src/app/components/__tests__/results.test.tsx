import { render, screen } from "@testing-library/react";
import { Results, summarizeRound } from "../results";

const round = {
  id: "r1",
  story: null,
  participants: [
    { id: "1", name: "Alice", vote: "5" },
    { id: "2", name: "Bob", vote: "8" },
    { id: "3", name: "Carol", vote: "5" },
    { id: "4", name: "Dave", vote: "☕" },
    { id: "5", name: "Eve", vote: null },
  ],
};

describe("summarizeRound", () => {
  test("counts cast votes only, numeric first, and computes stats", () => {
    const summary = summarizeRound(round.participants);

    expect(summary.distribution).toEqual([
      { vote: "5", count: 2 },
      { vote: "8", count: 1 },
      { vote: "☕", count: 1 },
    ]);
    expect(summary.avg).toBe(6);
    expect(summary.median).toBe(5);
    // 2 of 4 cast votes on the most picked card
    expect(summary.agreement).toBe(50);
  });

  test("returns null stats when nobody voted", () => {
    const summary = summarizeRound([{ id: "1", name: "Alice", vote: null }]);

    expect(summary.avg).toBeNull();
    expect(summary.median).toBeNull();
    expect(summary.agreement).toBeNull();
  });
});

describe("Results", () => {
  const baseProps = {
    participants: round.participants,
    onReveal: jest.fn(),
    canReveal: true,
  };

  test("shows empty state before the first reveal", () => {
    render(<Results {...baseProps} revealed={false} previousRound={null} />);

    expect(screen.getByText("No results yet.")).toBeInTheDocument();
  });

  test("renders chart, metrics and individual votes once revealed", () => {
    render(<Results {...baseProps} revealed previousRound={round} />);

    expect(screen.getByLabelText("Vote distribution")).toBeInTheDocument();
    expect(screen.getByText("Average")).toBeInTheDocument();
    expect(screen.getByText("Median")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  test("shows previous round while re-estimating without individual votes", () => {
    render(<Results {...baseProps} revealed={false} previousRound={round} />);

    expect(screen.getByText("Previous round results")).toBeInTheDocument();
    expect(screen.queryByText("Carol")).not.toBeInTheDocument();
  });
});
