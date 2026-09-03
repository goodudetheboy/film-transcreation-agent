import type { SVGProps } from 'react';

/** Shared line-art icon set — replaces emoji glyphs (inconsistent across OS/
 * browser font fallbacks) with crisp, theme-aware SVGs that inherit their
 * color from `currentColor`, same as the rest of the app's iconography
 * (see PrepAnimation.tsx). Default size is 16x16; override via `width`/
 * `height` or wrap in a sized container. */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
      <path d="M12 8l1.4 3.6L17 13l-3.6 1.4L12 18l-1.4-3.6L7 13l3.6-1.4L12 8Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.35-4.35" />
    </Icon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20Z" />
      <path d="M13 7l4 4" />
    </Icon>
  );
}

export function LightbulbIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V17h5v-1.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2M9.5 2.5h5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5v15l13-7.5-13-7.5Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SkipBackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 4.5v15L8 12l11-7.5Z" fill="currentColor" stroke="none" />
      <path d="M5 4.5v15" />
    </Icon>
  );
}

export function SkipForwardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5v15l11-7.5L5 4.5Z" fill="currentColor" stroke="none" />
      <path d="M19 4.5v15" />
    </Icon>
  );
}

export function SpeakerMuteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5v5h4l5.5 4.5v-14L8 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="M16 9l5 6M21 9l-5 6" />
    </Icon>
  );
}

export function SpeakerLowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5v5h4l5.5 4.5v-14L8 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="M17.5 9.5a4.5 4.5 0 0 1 0 5" />
    </Icon>
  );
}

export function SpeakerHighIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 9.5v5h4l5.5 4.5v-14L8 9.5H4Z" fill="currentColor" stroke="none" />
      <path d="M17 9a5.5 5.5 0 0 1 0 6M19.8 7a9 9 0 0 1 0 10" />
    </Icon>
  );
}
