import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'text' | 'icon';
export type ButtonSize = 'sm' | 'lg';
export type ButtonTone = 'primary' | 'danger';

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  fit?: boolean;
  className?: string;
}

/** Builds the shared `.btn*` className for both <Button> and <LinkButton>. */
function buttonClassName({ variant = 'secondary', size, tone, fit, className }: ButtonClassOptions): string {
  const classes = variant === 'icon' || variant === 'text' ? [`btn--${variant}`] : ['btn'];
  if (variant === 'primary') classes.push('btn--primary');
  if (variant === 'danger') classes.push('btn--danger');
  if (variant === 'icon') {
    if (size === 'lg') classes.push('btn--icon-lg');
    if (tone) classes.push(`btn--${tone}`);
    if (fit) classes.push('btn--icon--fit');
  }
  if (className) classes.push(className);
  return classes.join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Only meaningful for variant="icon": fills it with the primary/danger accent color. */
  tone?: ButtonTone;
  /** Only meaningful for variant="icon": lets it size to its label instead of a fixed square. */
  fit?: boolean;
}

export function Button({ variant, size, tone, fit, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, size, tone, fit, className })} {...rest} />;
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** Same visual system as <Button>, for navigation styled as a button (react-router <Link>). */
export function LinkButton({ variant, size, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClassName({ variant, size, className })} {...rest} />;
}
