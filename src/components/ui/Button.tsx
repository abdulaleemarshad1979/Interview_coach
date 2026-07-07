import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showArrow?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'data-interactive'?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  showArrow = false,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isPrimary = variant === 'primary';

  const baseClasses = 'relative inline-flex items-center justify-center font-medium font-sans transition-all focus:outline-hidden focus:ring-2 focus:ring-accent-blue/50 select-none cursor-pointer overflow-hidden';
  
  const sizeClasses = {
    sm: 'text-xs px-4 py-1.5 rounded-full h-8',
    md: 'text-sm px-6 py-2.5 rounded-full h-11',
    lg: 'text-base px-8 py-3.5 rounded-full h-14',
  };

  const variantClasses = {
    primary: 'bg-accent-blue hover:bg-blue-600 text-white border border-transparent shadow-lg shadow-accent-blue/10 active:scale-[0.98]',
    secondary: 'bg-transparent border border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-900 active:scale-[0.98]',
    ghost: 'bg-transparent text-slate-500 hover:text-slate-900 border border-transparent group',
  };

  return (
    <motion.button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${disabled || loading ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${className}`}
      whileHover={!disabled && !loading && !isGhost ? { scale: 1.02, y: -1 } : undefined}
      whileTap={!disabled && !loading && !isGhost ? { scale: 0.98 } : undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            fillRule="evenodd"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}

      <span className="relative z-10 flex items-center gap-1.5">
        {children}
        {showArrow && !loading && (
          <ArrowRight
            className={`w-4 h-4 transition-transform duration-200 ${
              isGhost ? 'group-hover:translate-x-1.5' : 'group-hover:translate-x-1'
            }`}
          />
        )}
      </span>

      {isPrimary && (
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
      )}

      {isGhost && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1.5px] bg-accent-blue transition-all duration-300 group-hover:w-full" />
      )}
    </motion.button>
  );
}
