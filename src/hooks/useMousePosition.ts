import { useState, useEffect } from 'react';

export interface MousePosition {
  x: number;
  y: number;
  isHovered: boolean;
  isClicked: boolean;
}

export function useMousePosition(): MousePosition {
  const [position, setPosition] = useState<MousePosition>({
    x: 0,
    y: 0,
    isHovered: false,
    isClicked: false,
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const isInteractive = !!(
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'A' ||
          target.closest('button') ||
          target.closest('a') ||
          target.closest('[data-interactive]') ||
          target.style.cursor === 'pointer')
      );

      setPosition((prev) => ({
        ...prev,
        x: e.clientX,
        y: e.clientY,
        isHovered: isInteractive,
      }));
    };

    const handleMouseDown = () => {
      setPosition((prev) => ({ ...prev, isClicked: true }));
    };

    const handleMouseUp = () => {
      setPosition((prev) => ({ ...prev, isClicked: false }));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return position;
}
