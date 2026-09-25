import { render, screen } from "@testing-library/react";
import { Participants } from "../participants";

describe("Participants", () => {
  test("reports voting progress for active voters only", () => {
    render(
      <Participants
        participants={[
          { id: "1", name: "Alice", vote: "5" },
          { id: "2", name: "Bob", vote: null },
          { id: "3", name: "Guest", vote: null },
          { id: "4", name: "Paused", vote: null, paused: true },
        ]}
      />,
    );

    const ring = screen.getByRole("progressbar", { name: "Voting progress" });
    expect(ring).toHaveAttribute("aria-valuenow", "1");
    expect(ring).toHaveAttribute("aria-valuemax", "2");
    expect(screen.getByText("1 of 2 voted")).toBeInTheDocument();
  });

  test("announces when everyone has voted", () => {
    render(
      <Participants
        participants={[
          { id: "1", name: "Alice", vote: "5" },
          { id: "2", name: "Bob", vote: "3" },
        ]}
      />,
    );

    expect(screen.getByText("Everyone has voted")).toBeInTheDocument();
  });
});
