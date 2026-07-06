import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, LucideIcon } from 'lucide-react';

interface InputFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  type: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: LucideIcon;
}

export default function InputField({
  label,
  type,
  placeholder,
  value,
  onChange,
  error,
  icon: Icon,
  className = '',
  ...props
}: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`flex flex-col gap-1.5 w-full text-left ${className}`}>
      <label className="text-[12px] font-medium text-slate-400 tracking-[0.5px] uppercase select-none font-sans">
        {label}
      </label>
      
      <div className="relative w-full">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none text-slate-500">
            <Icon className="w-4 h-4" />
          </div>
        )}

        <input
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full bg-[#0B1120]/80 text-[#F8FAFC] font-sans text-[15px] rounded-[10px] transition-all duration-200 outline-hidden
            ${Icon ? 'py-[14px] pr-4 pl-10' : 'py-3 px-4'}
            ${isPassword ? 'pr-11' : ''}
            ${
              error
                ? 'border border-red-500/50 focus:ring-3 focus:ring-red-500/8'
                : 'border border-white/8 focus:border-accent-blue/50 focus:ring-3 focus:ring-accent-blue/10'
            }
          `}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
            tabIndex={-1}
            data-interactive="true"
          >
            {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-[12px] text-red-400 font-sans"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
