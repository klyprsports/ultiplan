import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  target: string;
}

interface OnboardingTourProps {
  steps: OnboardingStep[];
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const OnboardingTour: React.FC<OnboardingTourProps> = ({
  steps,
  stepIndex,
  onNext,
  onPrev,
  onClose
}) => {
  const step = steps[stepIndex];
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipRect, setTooltipRect] = useState<Rect | null>(null);

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        setTooltipRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const padded = {
        top: Math.max(0, rect.top - 8),
        left: Math.max(0, rect.left - 8),
        width: rect.width + 16,
        height: rect.height + 16
      };
      setTargetRect(padded);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  const tooltipPosition = useMemo(() => {
    if (!targetRect) return null;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = 320;
    const height = 160;
    const padding = 16;
    const rightSpace = viewportW - (targetRect.left + targetRect.width);
    const leftSpace = targetRect.left;
    const belowSpace = viewportH - (targetRect.top + targetRect.height);
    let left = targetRect.left;
    let top = targetRect.top + targetRect.height + padding;

    if (rightSpace >= width + padding) {
      left = targetRect.left + targetRect.width + padding;
      top = Math.min(Math.max(padding, targetRect.top), viewportH - height - padding);
    } else if (leftSpace >= width + padding) {
      left = targetRect.left - width - padding;
      top = Math.min(Math.max(padding, targetRect.top), viewportH - height - padding);
    } else if (belowSpace < height + padding) {
      top = targetRect.top - height - padding;
      top = Math.max(padding, top);
      left = Math.min(Math.max(padding, targetRect.left), viewportW - width - padding);
    } else {
      left = Math.min(Math.max(padding, targetRect.left), viewportW - width - padding);
    }

    return { top, left, width, height };
  }, [targetRect]);

  useEffect(() => {
    if (tooltipPosition) {
      setTooltipRect(tooltipPosition);
    }
  }, [tooltipPosition]);

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-[130]">
      <div className="absolute inset-0 bg-slate-950/70" />
      {targetRect && (
        <div
          className="absolute rounded-xl border border-emerald-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.7)]"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height
          }}
        />
      )}
      <div
        className="absolute bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl px-5 py-4"
        style={{
          top: tooltipRect?.top ?? '50%',
          left: tooltipRect?.left ?? '50%',
          width: tooltipRect?.width ?? 320,
          transform: tooltipRect ? undefined : 'translate(-50%, -50%)'
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Step {stepIndex + 1} of {steps.length}</div>
            <div className="text-base font-bold text-white mt-1">{step.title}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors" aria-label="Close tour">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">
          {step.body}
        </p>
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={onPrev}
            disabled={stepIndex === 0}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${
              stepIndex === 0 ? 'border-slate-800 text-slate-600 cursor-not-allowed' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ChevronLeft size={14} /> Back
          </button>
          <button
            onClick={onNext}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
          >
            {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
