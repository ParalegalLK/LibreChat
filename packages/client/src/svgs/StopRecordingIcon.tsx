import { JSX } from 'react/jsx-runtime';
import { cn } from '~/utils/';

type StopRecordingIconProps = {
  className?: string;
};

export default function StopRecordingIcon({ className }: StopRecordingIconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className={cn(className)}
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}
