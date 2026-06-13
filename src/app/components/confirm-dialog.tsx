"use client";

import { ConfirmDialog as LibConfirmDialog } from "@kjaniec-dev/ui";
import React, { useState } from "react";
import type { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  cancelLabel?: string;
  onAction: () => void;
  actionVariant?: React.ComponentProps<typeof Button>["variant"];
  actionSize?: React.ComponentProps<typeof Button>["size"];
  actionDisabled?: boolean;
};

type TriggerProps = {
  onClick?: React.MouseEventHandler;
  disabled?: boolean;
};

export function ConfirmDialog({
  trigger,
  title,
  description = "",
  actionLabel = "Confirm",
  cancelLabel = "Cancel",
  onAction,
  actionDisabled,
}: ConfirmDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    onAction();
    setIsOpen(false);
  };

  const triggerElement = React.isValidElement(trigger)
    ? React.cloneElement(trigger as React.ReactElement<TriggerProps>, {
        onClick: (e: React.MouseEvent) => {
          if (actionDisabled) return;
          const element = trigger as React.ReactElement<TriggerProps>;
          // Call original onClick if it exists
          if (element.props && typeof element.props.onClick === "function") {
            element.props.onClick(e);
          }
          setIsOpen(true);
        },
        disabled:
          actionDisabled ||
          (trigger as React.ReactElement<TriggerProps>).props?.disabled,
      })
    : trigger;

  return (
    <>
      {triggerElement}
      <LibConfirmDialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleConfirm}
        title={title}
        description={description}
        confirmLabel={actionLabel}
        cancelLabel={cancelLabel}
        tone="primary"
      />
    </>
  );
}
