import React, { useState, useRef, useEffect } from 'react';

interface CollapsibleFieldProps {
  label: string;
  valuePreview?: string | number;
  required?: boolean;
  icon?: string;
  isSecret?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  placeholderHint?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Componente compacto donde el campo de llenado se despliega al hacer clic
 * en la palabra o frase principal para minimizar el espacio en pantalla.
 */
export const CollapsibleField: React.FC<CollapsibleFieldProps> = ({
  label,
  valuePreview,
  required = false,
  icon = 'fi-rr-edit',
  isSecret = false,
  defaultOpen = false,
  forceOpen,
  placeholderHint = 'Clic para llenar',
  className = '',
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);

  const effectiveOpen = forceOpen !== undefined ? forceOpen : isOpen;

  const hasValue =
    valuePreview !== undefined &&
    valuePreview !== null &&
    String(valuePreview).trim().length > 0;

  const displayPreview = hasValue
    ? isSecret
      ? '••••••••'
      : String(valuePreview)
    : placeholderHint;

  useEffect(() => {
    if (effectiveOpen && contentRef.current && !defaultOpen) {
      const inputEl = contentRef.current.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('input, select, textarea');
      if (inputEl) {
        inputEl.focus();
      }
    }
  }, [effectiveOpen, defaultOpen]);

  return (
    <div
      className={`border rounded-xl transition-all duration-150 ${
        effectiveOpen
          ? 'border-[#0B2559] bg-white shadow-2xs'
          : hasValue
          ? 'border-[#B3D9FF] bg-[#F4F9FF]/90 hover:border-[#3B82F6] hover:bg-white'
          : 'border-[#D6EAFF] bg-[#F4F9FF]/60 hover:border-[#7CC0FF] hover:bg-white'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left select-none"
        title={`Clic en "${label}" para desplegar o minimizar el campo de llenado`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              effectiveOpen
                ? 'bg-[#0B2559] text-white'
                : hasValue
                ? 'bg-[#B3D9FF] text-[#0B2559]'
                : 'bg-[#EAF3FF] text-[#3B82F6]'
            }`}
          >
            <i className={`fi ${icon} text-[11px]`} />
          </span>
          <span className="text-xs font-bold text-[#0B2559] truncate">
            {label}
            {required && <span className="text-rose-600 ml-0.5">*</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 max-w-[55%] shrink-0">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-md truncate max-w-[140px] sm:max-w-[180px] ${
              hasValue
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold font-mono'
                : 'bg-white/80 text-[#3B82F6] border border-[#D6EAFF] italic'
            }`}
          >
            {displayPreview}
          </span>
          <i
            className={`fi ${
              effectiveOpen ? 'fi-rr-angle-small-up text-[#0B2559]' : 'fi-rr-angle-small-down text-[#3B82F6]'
            } text-sm shrink-0`}
          />
        </div>
      </button>

      {effectiveOpen && (
        <div
          ref={contentRef}
          className="px-3 pb-3 pt-1.5 border-t border-[#EAF3FF] bg-white rounded-b-xl animate-fadeIn"
        >
          {children}
        </div>
      )}
    </div>
  );
};
