"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  progress: number; // 0-100
  onReset?: () => void;
  onUndo?: () => void;
  showUndo?: boolean;
}

export function ProgressBar({
  progress,
  onReset,
  onUndo,
  showUndo = false,
}: ProgressBarProps) {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">Progress</span>
        <span className="text-sm text-muted-foreground">
          {Math.round(progress)}%
        </span>
      </div>

      <Progress value={progress} className="w-full" />

      <div className="flex justify-end space-x-2">
        {showUndo && onUndo && (
          <Button variant="outline" size="sm" onClick={onUndo}>
            <Undo2 className="mr-2 h-4 w-4" />
            Undo
          </Button>
        )}

        {onReset && (
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
