import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function Menu({ subOpen, forceMount }: { subOpen: boolean; forceMount?: true }) {
  return (
    <DropdownMenu open>
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuSub open={subOpen}>
          <DropdownMenuSubTrigger>Options</DropdownMenuSubTrigger>
          <DropdownMenuSubContent forceMount={forceMount}>
            <DropdownMenuItem>Submenu item</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("dropdown submenu mounting", () => {
  it("keeps force-mounted content after the submenu closes", () => {
    const { rerender } = render(<Menu subOpen forceMount />);
    expect(screen.getByText("Submenu item")).toBeInTheDocument();
    rerender(<Menu subOpen={false} forceMount />);
    expect(screen.getByText("Submenu item")).toBeInTheDocument();
  });

  it("unmounts content by default after the submenu closes", () => {
    const { rerender } = render(<Menu subOpen />);
    expect(screen.getByText("Submenu item")).toBeInTheDocument();
    rerender(<Menu subOpen={false} />);
    expect(screen.queryByText("Submenu item")).not.toBeInTheDocument();
  });
});
