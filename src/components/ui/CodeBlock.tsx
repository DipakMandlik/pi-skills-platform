import { useState, type ReactNode, type HTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  filename?: string;
}

export function CodeBlock({ code, language, filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      {(filename || language) && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
          <div className="flex items-center gap-2">
            {filename && <span className="text-xs font-medium text-foreground">{filename}</span>}
            {language && <span className="text-[10px] text-muted uppercase">{language}</span>}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
            aria-label={copied ? 'Copied' : 'Copy code'}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="p-4 text-sm font-mono text-foreground overflow-x-auto bg-surface/50">
        <code>{code}</code>
      </pre>
    </div>
  );
}
