import {
  DropdownMenuItem as BaseDropdownMenuItem,
  type DropdownMenuItemProps as BaseDropdownMenuItemProps,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kjaniec-dev/ui";
import * as React from "react";

// For backward compatibility, map `variant="destructive"` to `danger`
export interface DropdownMenuItemProps
  extends Omit<BaseDropdownMenuItemProps, "danger"> {
  variant?: "default" | "destructive";
  danger?: boolean;
}

const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ variant, danger, ...props }, ref) => {
  const isDanger = danger || variant === "destructive";
  return <BaseDropdownMenuItem ref={ref} danger={isDanger} {...props} />;
});
DropdownMenuItem.displayName = "DropdownMenuItem";

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
