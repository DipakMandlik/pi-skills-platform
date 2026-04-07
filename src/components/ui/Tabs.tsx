import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/cn';

interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Tabs({ tabs, activeKey, onChange, className, size = 'md' }: TabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-tab-key="${activeKey}"]`) as HTMLElement;
    if (activeEl) {
      setIndicatorStyle({
        left: activeEl.offsetLeft,
        width: activeEl.offsetWidth,
      });
    }
  }, [activeKey]);

  return (
    <div ref={tabsRef} className={cn('relative flex items-center gap-0.5', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            data-tab-key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap rounded-md',
              size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              isActive
                ? 'text-primary'
                : 'text-muted hover:text-foreground hover:bg-surface',
            )}
            role="tab"
            aria-selected={isActive}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className={cn(
                'inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1',
                isActive ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted',
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
      <motion.div
        className="absolute bottom-0 h-0.5 bg-primary rounded-full"
        animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      />
    </div>
  );
}
