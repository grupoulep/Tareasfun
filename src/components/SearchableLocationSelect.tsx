import React, { useState, useRef, useEffect, useMemo } from 'react';

interface SearchableLocationSelectProps {
  label: string;
  value: string;
  onChange: (newValue: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  secondaryOptions?: { label: string; value: string; department?: string }[];
  onSelectSecondaryDepartment?: (dept: string) => void;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const SearchableLocationSelect: React.FC<SearchableLocationSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar con lupa...',
  required = false,
  secondaryOptions,
  onSelectSecondaryDepartment,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const normalizedQuery = useMemo(() => normalizeText(searchQuery), [searchQuery]);

  const filteredPrimary = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter(opt => normalizeText(opt).includes(normalizedQuery));
  }, [options, normalizedQuery]);

  // Si el usuario escribe en la lupa de Municipio y busca un municipio de otro departamento, mostrar coincidencias nacionales también
  const filteredSecondary = useMemo(() => {
    if (!normalizedQuery || !secondaryOptions) return [];
    const primarySet = new Set(filteredPrimary.map(o => normalizeText(o)));
    return secondaryOptions
      .filter(
        item =>
          normalizeText(item.label).includes(normalizedQuery) &&
          !primarySet.has(normalizeText(item.value))
      )
      .slice(0, 60);
  }, [secondaryOptions, normalizedQuery, filteredPrimary]);

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-xs font-bold text-[#0B2559] mb-1">
          {label} {required ? '*' : ''}
        </label>
      )}

      {/* Botón principal con Lupa integrada */}
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className="flex-1 min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-left text-[#0B2559] bg-white border border-[#B3D9FF] hover:border-[#0B2559] rounded-lg focus:outline-none focus:border-[#0B2559] flex items-center justify-between gap-2 transition-colors"
        >
          <span className="truncate font-medium">
            {value || <span className="text-[#0B2559]/50">{placeholder}</span>}
          </span>
          <i
            className={`fi ${
              isOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
            } text-sm text-[#0B2559]/70 shrink-0`}
          />
        </button>

        <button
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          title={searchPlaceholder}
          className={`min-w-[40px] min-h-[42px] sm:min-h-0 px-2.5 py-2 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
            isOpen
              ? 'bg-[#0B2559] text-white border-[#0B2559]'
              : 'bg-[#EAF3FF] text-[#0B2559] border-[#B3D9FF] hover:bg-[#B3D9FF]'
          }`}
        >
          <i className="fi fi-rr-search text-xs" />
        </button>
      </div>

      {/* Menú desplegable con buscador de Lupa en tiempo real */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-[#0B2559] rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 bg-[#F4F9FF] border-b border-[#B3D9FF]">
            <div className="relative flex items-center">
              <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-[#0B2559]/60 hover:text-[#0B2559] p-1"
                >
                  <i className="fi fi-rr-cross-small text-xs" />
                </button>
              )}
            </div>
            <div className="mt-1 px-1 flex items-center justify-between text-[10px] text-[#0B2559]/70">
              <span>
                {filteredPrimary.length}{' '}
                {filteredPrimary.length === 1 ? 'resultado disponible' : 'resultados disponibles'}
              </span>
              {searchQuery && <span className="font-semibold text-[#3B82F6]">Filtrando...</span>}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-[#EAF3FF]">
            {filteredPrimary.slice(0, 150).map(opt => {
              const isSelected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[#0B2559] text-white font-bold'
                      : 'text-[#0B2559] hover:bg-[#EAF3FF]'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <i className="fi fi-rr-check text-[10px] shrink-0" />}
                </button>
              );
            })}

            {filteredSecondary.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-[#F4F9FF] text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">
                  Otros municipios de Colombia encontrados
                </div>
                {filteredSecondary.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.department && onSelectSecondaryDepartment) {
                        onSelectSecondaryDepartment(item.department);
                      }
                      onChange(item.value);
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-[#0B2559] hover:bg-[#EAF3FF] flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-[10px] text-[#3B82F6] font-semibold shrink-0">
                      {item.department}
                    </span>
                  </button>
                ))}
              </>
            )}

            {filteredPrimary.length === 0 && filteredSecondary.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-[#0B2559]/70">
                No se encontraron resultados para «{searchQuery}»
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
