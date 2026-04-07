import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search } from 'lucide-react';
import { cn } from '../../lib/cn';

interface CommandItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  section?: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
}

export function CommandPalette({ isOpen, onClose, items }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        filteredItems[selectedIndex].action();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedIndex]);

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.section?.toLowerCase().includes(search.toLowerCase())
  );

  const groupedItems = filteredItems.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const section = item.section || 'General';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-modal flex items-start justify-center pt-[20vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-2xl rounded-2xl border border-black/5 dark:border-white/10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.2)] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-4 px-5 border-b border-black/5 dark:border-white/5">
              <Search className="w-5 h-5 text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedIndex(0); }}
                placeholder="Type a command or search..."
                className="flex-1 h-16 bg-transparent text-lg text-foreground placeholder:text-muted/70 focus:outline-none focus:ring-0"
                aria-label="Search commands"
              />
              <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-[10px] font-mono text-muted bg-black/5 dark:bg-white/5 rounded border border-black/5 dark:border-white/5">
                ESC
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                  No results found for &ldquo;{search}&rdquo;
                </div>
              ) : (
                Object.entries(groupedItems).map(([section, sectionItems]) => (
                  <div key={section} className="mb-2 last:mb-0">
                    <div className="px-2 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      {section}
                    </div>
                    {sectionItems.map((item) => {
                      const index = globalIndex++;
                      const isSelected = index === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors',
                            isSelected ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground hover:bg-black/5 dark:hover:bg-white/5',
                          )}
                          onClick={() => { item.action(); onClose(); }}
                          onMouseEnter={() => setSelectedIndex(index)}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {item.icon && <span className="shrink-0 text-muted">{item.icon}</span>}
                          <span className="flex-1 text-left">{item.label}</span>
                          {item.shortcut && (
                            <kbd className="text-[10px] font-mono text-muted bg-surface px-1.5 py-0.5 rounded border border-border">
                              {item.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-surface/50">
              <div className="flex items-center gap-3 text-[10px] text-muted">
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface rounded border border-border">↑↓</kbd> Navigate</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface rounded border border-border">↵</kbd> Select</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-surface rounded border border-border">esc</kbd> Close</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
