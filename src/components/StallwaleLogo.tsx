import React from 'react';

export type StallLogoVariant =
  | 'horizontal-dark' // PRIMARY / BLACK BACKGROUND version (Default, matches stall.stallwale.in/upgrade.html)
  | 'full-dark' // Full stacked dark logo with "THAT'S ALL" & "DISCOVER • CONNECT • GROW"
  | 'horizontal-light'
  | 'full-light'
  | 'icon'
  | 'monochrome-white'
  | 'monochrome-black';

interface StallwaleLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: StallLogoVariant;
  showText?: boolean;
  showTagline?: boolean;
  subtitle?: string;
  framed?: boolean;
}

export function StallwaleLogo({
  size = 'md',
  variant = 'horizontal-dark',
  showText = true,
  showTagline = false,
  subtitle,
}: StallwaleLogoProps) {
  const imgSizeClass =
    size === 'sm'
      ? 'w-9 h-9'
      : size === 'lg'
      ? 'w-12 h-12'
      : size === 'xl'
      ? 'w-14 h-14'
      : 'w-11 h-11';

  if (!showText || variant === 'icon') {
    return (
      <img
        src="/stall-logo.png"
        alt="STall logo"
        className={`${imgSizeClass} object-contain shrink-0 select-none`}
      />
    );
  }

  const wordSizeClass =
    size === 'sm'
      ? 'text-lg'
      : size === 'lg'
      ? 'text-2xl'
      : size === 'xl'
      ? 'text-3xl'
      : 'text-[1.35rem]';

  const includeTagline =
    showTagline || variant === 'full-light' || variant === 'full-dark';

  return (
    <div className="inline-flex flex-col items-start select-none">
      {/* Official STall Header Lockup from https://stall.stallwale.in/upgrade.html */}
      <div className="inline-flex items-center gap-2.5">
        <img
          src="/stall-logo.png"
          alt="STall logo"
          className={`${imgSizeClass} object-contain shrink-0`}
        />
        <div className="leading-none">
          <div
            className={`${wordSizeClass} font-extrabold text-white tracking-tight leading-none`}
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            all
          </div>
          <span className="block mt-1 text-[#6f6f6f] text-[8.5px] tracking-[0.2em] font-bold uppercase">
            {subtitle || "THAT'S ALL"}
          </span>
        </div>
      </div>

      {includeTagline && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[9px] font-bold tracking-[0.18em] uppercase text-[#d6d6d6]">
          <span>DISCOVER</span>
          <span className="text-[#f0b429]">•</span>
          <span>CONNECT</span>
          <span className="text-[#f0b429]">•</span>
          <span>GROW</span>
        </div>
      )}
    </div>
  );
}
