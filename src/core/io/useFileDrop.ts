import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function useFileDrop(onFile: (file: File) => void) {
  const [isOver, setIsOver] = useState(false);
  const onFileRef = useRef(onFile);
  useEffect(() => {
    onFileRef.current = onFile;
  });

  const dropProps = useMemo(
    () => ({
      onDragOverCapture: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setIsOver(true);
      },
      onDragLeave: () => setIsOver(false),
      onDropCapture: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFileRef.current(file);
      },
    }),
    [],
  );
  return { isOver, dropProps };
}
