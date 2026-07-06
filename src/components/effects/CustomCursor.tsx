import React, { useEffect, useRef, useState } from 'react';
import { useMousePosition } from '../../hooks/useMousePosition';

export default function CustomCursor() {
  const { x, y, isHovered, isClicked } = useMousePosition();
  const cursorRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    // Check if device supports touch or screen is small
    const checkDevice = () => {
      const mobile = 
        window.matchMedia('(max-width: 1024px)').matches || 
        ('ontouchstart' in window) || 
        (navigator.maxTouchPoints > 0);
      setIsMobile(mobile);
      if (!mobile) {
        document.documentElement.classList.add('custom-cursor-active');
      } else {
        document.documentElement.classList.remove('custom-cursor-active');
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);

    // Fade in cursor when mouse first moves
    const handleFirstMove = () => {
      setIsVisible(true);
      window.removeEventListener('mousemove', handleFirstMove);
    };
    window.addEventListener('mousemove', handleFirstMove);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('mousemove', handleFirstMove);
      document.documentElement.classList.remove('custom-cursor-active');
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;

    let animationFrameId: number;
    const updatePosition = () => {
      if (!cursorRef.current) return;

      // Lerp positioning
      const lerpFactor = 0.12;
      const currentX = positionRef.current.x;
      const currentY = positionRef.current.y;

      const targetX = x;
      const targetY = y;

      const nextX = currentX + (targetX - currentX) * lerpFactor;
      const nextY = currentY + (targetY - currentY) * lerpFactor;

      positionRef.current = { x: nextX, y: nextY };

      const radius = isHovered ? 24 : 16;
      cursorRef.current.style.transform = `translate3d(${nextX - radius}px, ${nextY - radius}px, 0)`;

      animationFrameId = requestAnimationFrame(updatePosition);
    };

    animationFrameId = requestAnimationFrame(updatePosition);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [x, y, isHovered, isMobile]);

  if (isMobile || !isVisible) return null;

  return (
    <div
      ref={cursorRef}
      id="custom-cursor"
      className={`fixed top-0 left-0 pointer-events-none z-9999 rounded-full border transition-all duration-150 ease-out backdrop-invert-10
        ${isHovered 
          ? 'w-[48px] h-[48px] border-accent-blue bg-accent-blue/5 scale-100' 
          : 'w-[32px] h-[32px] border-white/40 bg-transparent scale-100'
        }
        ${isClicked ? 'scale-75 border-accent-cyan bg-accent-cyan/10' : ''}
      `}
      style={{
        willChange: 'transform, width, height',
      }}
    />
  );
}
