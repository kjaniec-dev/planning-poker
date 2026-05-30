import {
  Button as BaseButton,
  type ButtonProps as BaseButtonProps,
} from "@kjaniec-dev/ui";
import * as React from "react";

export interface ButtonProps extends Omit<BaseButtonProps, "variant" | "size"> {
  variant?:
    | "default"
    | "destructive"
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "danger"
    | "link";
  size?: "default" | "sm" | "md" | "lg" | "icon" | "icon-sm" | "icon-lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", ...props }, ref) => {
    // Map variants
    let mappedVariant: BaseButtonProps["variant"] = "primary";
    if (variant === "default" || variant === "primary") {
      mappedVariant = "primary";
    } else if (variant === "destructive" || variant === "danger") {
      mappedVariant = "danger";
    } else if (
      variant === "secondary" ||
      variant === "outline" ||
      variant === "ghost"
    ) {
      mappedVariant = variant;
    } else if (variant === "link") {
      // Fallback for link variant if it's ghost
      mappedVariant = "ghost";
    }

    // Map sizes
    let mappedSize: BaseButtonProps["size"] = "md";
    if (size === "default" || size === "md") {
      mappedSize = "md";
    } else if (
      size === "sm" ||
      size === "lg" ||
      size === "icon" ||
      size === "icon-sm"
    ) {
      mappedSize = size;
    } else if (size === "icon-lg") {
      mappedSize = "lg"; // closest fallback
    }

    return (
      <BaseButton
        ref={ref}
        variant={mappedVariant}
        size={mappedSize}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";

export { buttonVariants } from "@kjaniec-dev/ui";
export { Button };
