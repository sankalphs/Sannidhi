import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

function SmokeButton() {
  return <Button>Get Started</Button>;
}

describe("smoke", () => {
  it("renders the button label", () => {
    render(<SmokeButton />);
    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
  });
});
